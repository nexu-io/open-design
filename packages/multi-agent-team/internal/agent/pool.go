// Package agent Agent 池管理与 OpenDesign Daemon 对接
package agent

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent/adapter/daemon"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/config"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/profiler"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// DaemonAddr 默认 daemon 地址（可被 CLi 覆盖）
var DaemonAddr = "http://127.0.0.1:17900"

// Pool Agent 池管理器
type Pool struct {
	mu             sync.RWMutex
	agents         map[string]*ManagedAgent
	bus            *bus.CommunicationBus
	workDir        string
	daemonClient   *daemon.Client
	builder        *profiler.TeamBuilder // 智能组队构建器
	config         *config.TeamConfig    // 团队配置
	eventSink      EventSink             // 事件转发回调（可选）
	projectId      string                // 运行项目上下文
	conversationId string                // 运行会话上下文
	mainAgentID    string                // 主 Agent，只有它的事件会进入聊天窗
}

// EventSink 由外部（如 odteam CLI）设置的回调，用于流式转发
// daemon SSE 事件。每个 agent 执行任务时收到的事件都会通过此回调
// 转发，使调用方能够实时输出中间结果。
type EventSink func(agentID, eventType string, data []byte)
// ManagedAgent 受管理的 Agent 实例
type ManagedAgent struct {
	Spec    config.AgentSpec
	Runtime protocol.AgentRuntime
	taskCh  chan *TaskAssignment
	replyCh chan *TaskResult
	ctx     context.Context
	cancel  context.CancelFunc
	client  *daemon.Client
	workDir        string
	onEvent        EventSink
	isMain         bool // 是否为主 Agent，主 Agent 的事件才进入聊天窗
	// 运行上下文，传递给 daemon /api/chat
	projectId      string
	conversationId string
}

// TaskAssignment 任务分配
type TaskAssignment struct {
	TaskID    string
	Prompt    string
	Context   *ContextSnapshot // 继承的上下文
	Artifacts []*protocol.Artifact
	Timeout   time.Duration
}

// TaskResult 任务结果
type TaskResult struct {
	TaskID    string
	Success   bool
	Artifacts []*protocol.Artifact
	Error     string
	Metrics   TaskMetrics
}

// TaskMetrics 任务执行指标
type TaskMetrics struct {
	StartTime    time.Time
	EndTime      time.Time
	Duration     time.Duration
	TokensUsed   int
	FilesCreated int
}

// ContextSnapshot 上下文快照（用于继承）
type ContextSnapshot struct {
	AgentID    string
	ParentTask string
	Skills     []string
	Designs    []string
	Memory     map[string]any       // 共享记忆（含 inheritance_depth 等）
	Artifacts  []*protocol.Artifact // 父任务产出的完整工件（含路径、类型）
}

// NewPool 创建 Agent 池，连接 OpenDesign daemon
func NewPool(cfg *config.TeamConfig, b *bus.CommunicationBus, workDir string) *Pool {
	dc := daemon.NewClient(DaemonAddr)

	p := &Pool{
		agents:       make(map[string]*ManagedAgent),
		bus:          b,
		workDir:      workDir,
		daemonClient: dc,
		builder:      profiler.NewTeamBuilder(),
		config:       cfg,
	}

	// 首先注册所有 Agent 到 TeamBuilder（收集能力画像）
	for _, spec := range cfg.Team.Agents {
		p.builder.RegisterAgent(spec.ID, spec.Type, spec.Name, protocol.AgentCapability{
			Name:        spec.Name,
			Skills:      spec.Skills,
			Designs:     spec.Designs,
			MaxParallel: 1,
		})
	}

	// 如果启用了 auto_assign，自动分配 Agent 类型
	if cfg.Team.AutoAssign {
		p.applyAutoAssign(cfg)
	}

	// 注册并启动 Agent
	for _, spec := range cfg.Team.Agents {
		p.registerAgent(spec, dc)
	}

	return p
}

// applyAutoAssign 根据 Agent 能力画像自动分配运行时类型
func (p *Pool) applyAutoAssign(cfg *config.TeamConfig) {
	// 收集哪些 Agent 的 type 已手动设置（不覆盖）
	manualTypes := make(map[string]bool)
	for _, spec := range cfg.Team.Agents {
		if spec.Type != "" {
			manualTypes[spec.Type] = true
		}
	}

	for i, spec := range cfg.Team.Agents {
		if spec.Type != "" {
			continue // 已有手动设置，不覆盖
		}

		// 根据角色找到最佳 Agent 类型
		role := profiler.RoleByName(spec.Role)
		bestType := p.builder.FindBestAgentType(role, manualTypes)
		if bestType != "" {
			cfg.Team.Agents[i].Type = bestType
			manualTypes[bestType] = true
			profile := p.builder.GetProfile(spec.ID)
			if profile != nil {
				log.Printf("[auto_assign] %s (%s) → %s (score: %.0f)",
					spec.ID, spec.Role, bestType, profile.CalculateRoleScore(role))
			}
		}
	}
}

// GetTeamBuilder 获取智能组队构建器
func (p *Pool) GetTeamBuilder() *profiler.TeamBuilder {
	return p.builder
}

// registerAgent 注册并启动 Agent
func (p *Pool) registerAgent(spec config.AgentSpec, dc *daemon.Client) {
	ctx, cancel := context.WithCancel(context.Background())

	ma := &ManagedAgent{
		Spec: spec,
		Runtime: protocol.AgentRuntime{
			ID:     spec.ID,
			Status: protocol.AgentIdle,
			Capability: protocol.AgentCapability{
				Name:        spec.Name,
				Skills:      spec.Skills,
				Designs:     spec.Designs,
				MaxParallel: 1,
			},
		},
		taskCh:  make(chan *TaskAssignment, 10),
		replyCh: make(chan *TaskResult, 10),
		ctx:     ctx,
		cancel:  cancel,
		client:  dc,
		workDir: p.workDir,
		isMain:  p.mainAgentID == spec.ID,
	}

	subCh := p.bus.Subscribe(spec.ID, 50)
	p.agents[spec.ID] = ma

	// 传递运行上下文和事件回调
	ma.projectId = p.projectId
	ma.conversationId = p.conversationId
	if p.eventSink != nil {
		ma.onEvent = p.eventSink
	}

	go ma.run(subCh)
}

// run Agent 主循环
func (ma *ManagedAgent) run(subCh <-chan *protocol.Message) {
	defer ma.cancel()

	for {
		select {
		case <-ma.ctx.Done():
			return
		case msg, ok := <-subCh:
			if !ok {
				return
			}
			ma.handleMessage(msg)
		case task := <-ma.taskCh:
			ma.Runtime.Status = protocol.AgentBusy
			ma.Runtime.CurrentTask = task.TaskID
			result := ma.executeTask(task)
			ma.Runtime.Status = protocol.AgentIdle
			ma.Runtime.CurrentTask = ""
			ma.Runtime.LastSeen = time.Now()
			ma.replyCh <- result
		}
	}
}

// handleMessage 处理总线消息
func (ma *ManagedAgent) handleMessage(msg *protocol.Message) {
	switch msg.Type {
	case protocol.MsgContextSync:
		if data, ok := msg.Payload.(map[string]any); ok {
			_ = data // 可由上层使用
		}
	case protocol.MsgStatusReport:
	default:
	}
}

// executeTask 调用 OpenDesign daemon API 执行任务
func (ma *ManagedAgent) executeTask(task *TaskAssignment) *TaskResult {
	startTime := time.Now()
	result := &TaskResult{
		TaskID:  task.TaskID,
		Metrics: TaskMetrics{StartTime: startTime},
	}

	// 1. 构建 daemon chat 请求
	chatReq := ma.buildChatRequest(task)

	// 2. 通过 SSE 流调用 daemon
	ctx, cancel := context.WithTimeout(ma.ctx, task.Timeout)
	defer cancel()

	eventCh, err := ma.client.ChatSSE(ctx, chatReq)
	if err != nil {
		result.Metrics.EndTime = time.Now()
		result.Metrics.Duration = result.Metrics.EndTime.Sub(startTime)
		result.Success = false
		result.Error = fmt.Sprintf("daemon chat sse failed: %v", err)
		return result
	}

	// 3. 消费 SSE 流，收集产物
	// daemon chat SSE 事件类型（来自 ChatSseEvent）：
	//   start  → run 启动（忽略）
	//   agent  → agent 输出（内含 live_artifact / text_delta / tool_use 等子类型）
	//   stdout / stderr → 原始输出（忽略）
	//   end    → run 结束（{ status: "succeeded" | "failed" }）
	//   error  → 错误
	var artifacts []*protocol.Artifact
	for evt := range eventCh {
		// 流式转发：将每个 daemon SSE 事件通过回调传递给外部消费者
		// （如 odteam CLI），使其能实时输出到 stdout 供 daemon 转发。
		// 仅主 Agent 的事件进入聊天窗，避免非主 Agent 消息 flooding。
		if ma.onEvent != nil && ma.isMain {
			ma.onEvent(ma.Spec.ID, evt.Type, evt.Data)
		}
		switch evt.Type {
		case "agent":
			// agent 事件：payload 可能是 live_artifact 并带着产物元数据
			var agentPayload struct {
				Type       string `json:"type"`
				ProjectID  string `json:"projectId"`
				ArtifactID string `json:"artifactId"`
				Title      string `json:"title"`
			}
			if json.Unmarshal(evt.Data, &agentPayload) == nil && agentPayload.Type == "live_artifact" {
				// live_artifact 事件只携带元数据 (projectId / artifactId / title)，
				// 不含实际文件内容。需要通过 daemon REST API 拉取渲染后的 HTML，
				// 否则 saveArtifact 无法写入文件，导致父子 handoff 失败。
				content, fetchErr := ma.client.FetchArtifactPreview(ctx, agentPayload.ProjectID, agentPayload.ArtifactID)
				if fetchErr != nil {
					// 拉取失败时记录错误但继续处理（artifact 仍以元数据形式保存）
					fmt.Printf("warning: failed to fetch artifact content for %s: %v\n", agentPayload.ArtifactID, fetchErr)
				}
				art := daemon.ArtifactEvent{
					ID:      agentPayload.ArtifactID,
					Name:    agentPayload.Title,
					Content: content,
				}
				artifact := ma.saveArtifact(&art, task.TaskID)
				if artifact != nil {
					artifacts = append(artifacts, artifact)
				}
			}
		case "end":
			// end 事件：{ code, status: "succeeded" | "failed" | "canceled", signal? }
			var endPayload struct {
				Status string `json:"status"`
			}
			json.Unmarshal(evt.Data, &endPayload)
			result.Success = endPayload.Status == "succeeded"
			if !result.Success && result.Error == "" {
				result.Error = fmt.Sprintf("run ended with status: %s", endPayload.Status)
			}
		case "error":
			var errPayload struct {
				Message string `json:"message"`
			}
			json.Unmarshal(evt.Data, &errPayload)
			result.Error = errPayload.Message
			if result.Error == "" {
				result.Error = "daemon returned error event"
			}
			result.Metrics.EndTime = time.Now()
			result.Metrics.Duration = result.Metrics.EndTime.Sub(startTime)
			result.Success = false
			result.Artifacts = artifacts
			return result
		}
	}

	result.Metrics.EndTime = time.Now()
	result.Metrics.Duration = result.Metrics.EndTime.Sub(startTime)
	result.Artifacts = artifacts
	result.Metrics.FilesCreated = len(artifacts)

	if !result.Success && result.Error == "" {
		result.Error = "stream ended without completion event"
	}

	return result
}

// buildChatRequest 构建 daemon chat 请求
// 对齐 daemon 协议：填充 agentId、skillIds、designSystemId
// 继承上下文通过 prompt 文本显式注入，因为 daemon 的 RunContextSelection 契约
// 只支持 skillIds/pluginIds/mcpServerIds/connectorIds/workspaceItems，
// 自定义的 {parent, artifact_ids, memory} 负载会在规范化阶段被丢弃。
func (ma *ManagedAgent) buildChatRequest(task *TaskAssignment) daemon.ChatRequest {
	message := task.Prompt

	// 将继承上下文注入到 prompt 中（daemon 支持的传递方式）
	// 不仅检查 Artifacts，也检查 Memory / Skills / Designs，
	// 因为父任务即使没有 artifact 产出也可能有共享上下文需要传递。
	if task.Context != nil && hasInheritanceContext(task.Context) {
		message = buildInheritancePrompt(task.Prompt, task.Context)
	}

	return daemon.ChatRequest{
		Message:        message,
		AgentId:        ma.Spec.Type,                  // daemon 需要运行时 slug (claude-code/codex)，非团队标签 (designer/writer)
		Skills:         ma.Spec.Skills,                // YAML 中配置的技能 ID
		Designs:        firstOrEmpty(ma.Spec.Designs), // daemon 契约要求单个 string，发送第一个选中的设计系统
		Stream:         true,
		ProjectId:      ma.projectId,
		ConversationId: ma.conversationId,
	}
}

// hasInheritanceContext 检查是否存在任何有意义的继承上下文
// 当父任务有工件、共享内存、继承技能或设计系统时返回 true
func hasInheritanceContext(ctx *ContextSnapshot) bool {
	return len(ctx.Artifacts) > 0 ||
		len(ctx.Memory) > 0 ||
		len(ctx.Skills) > 0 ||
		len(ctx.Designs) > 0 ||
		ctx.ParentTask != ""
}

// buildInheritancePrompt 将继承上下文信息注入到 prompt 文本中
// 包含父 Agent 产出的工件路径、类型等可操作信息，让子 Agent 能够
// 实际访问和利用父任务的产出文件。
func buildInheritancePrompt(originalPrompt string, ctx *ContextSnapshot) string {
	var b strings.Builder
	b.WriteString("[Inheritance context from parent agent]\n")
	b.WriteString(fmt.Sprintf("Parent agent: %s\n", ctx.AgentID))
	if ctx.ParentTask != "" {
		b.WriteString(fmt.Sprintf("Parent task: %s\n", ctx.ParentTask))
	}
	if len(ctx.Artifacts) > 0 {
		b.WriteString(fmt.Sprintf("Inherited %d artifact(s) from parent:\n", len(ctx.Artifacts)))
		for i, a := range ctx.Artifacts {
			b.WriteString(fmt.Sprintf("  %d. %s\n", i+1, a.Name))
			b.WriteString(fmt.Sprintf("     ID:   %s\n", a.ID))
			b.WriteString(fmt.Sprintf("     Type: %s\n", a.Type))
			b.WriteString(fmt.Sprintf("     Path: %s\n", a.Path))
			if a.Size > 0 {
				b.WriteString(fmt.Sprintf("     Size: %d bytes\n", a.Size))
			}
		}
		b.WriteString("\nUse the artifact paths above to read and reference the parent's output files.\n")
	}
	if len(ctx.Memory) > 0 {
		b.WriteString("Shared memory:\n")
		for k, v := range ctx.Memory {
			b.WriteString(fmt.Sprintf("  %s: %v\n", k, v))
		}
	}
	if len(ctx.Skills) > 0 {
		b.WriteString(fmt.Sprintf("Inherited skills: %s\n", strings.Join(ctx.Skills, ", ")))
	}
	if len(ctx.Designs) > 0 {
		b.WriteString(fmt.Sprintf("Inherited design systems: %s\n", strings.Join(ctx.Designs, ", ")))
	}
	b.WriteString("\n---\n\n")
	b.WriteString(originalPrompt)
	return b.String()
}

// firstOrEmpty 返回 slice 第一个元素或空字符串
func firstOrEmpty(s []string) string {
	if len(s) > 0 {
		return s[0]
	}
	return ""
}

// sanitizeArtifactName 净化 daemon live_artifact title，防止路径逃逸。
// - filepath.Base 提取不含目录组件的文件名
// - 替换剩余的控制字符、路径分隔符、空字符
// - 返回空字符串时由调用者 fallback 到默认文件名
func sanitizeArtifactName(raw string) string {
	if raw == "" {
		return ""
	}

	// 1. 提取纯文件名，去除路径前缀（如 foo/bar.html → bar.html）
	cleaned := filepath.Base(raw)

	// 2. 移除".."（即使 base 提取后仍可能存在，如 "..foo" 不会逃逸
	//    但 ".." 本身在 base 后会变成 ".."，仍需处理）
	if cleaned == "." || cleaned == ".." {
		return ""
	}

	// 3. 替换所有非法字节：控制字符、路径分隔符、null
	var b strings.Builder
	b.Grow(len(cleaned))
	for _, r := range cleaned {
		switch {
		case r < 0x20:
			b.WriteByte('_')
		case r == '/' || r == '\\':
			b.WriteByte('_')
		case r > 0x7e && r < 0xa0:
			b.WriteByte('_')
		default:
			b.WriteRune(r)
		}
	}
	result := strings.TrimSpace(b.String())
	if result == "" || result == "." || result == ".." {
		return ""
	}
	return result
}

// saveArtifact 将 daemon 事件中的产物保存到工件存储
func (ma *ManagedAgent) saveArtifact(art *daemon.ArtifactEvent, taskID string) *protocol.Artifact {
	if art.Name == "" && art.Content == "" {
		return nil
	}

	// 生成产物 ID
	// 对 daemon live_artifact title 做路径净化，防止 title 含路径分隔符
	// 或 .. 导致写入失败或路径逃逸出 artifacts/<id>/ 目录。
	name := sanitizeArtifactName(art.Name)
	if name == "" {
		name = fmt.Sprintf("artifact-%s.html", ma.Spec.ID)
	}
	id := fmt.Sprintf("%s-%x", taskID, sha256.Sum256([]byte(name+time.Now().String())))[:40]

	// 写入工件目录
	artifactDir := filepath.Join(ma.workDir, "artifacts", id)
	if err := os.MkdirAll(artifactDir, 0755); err != nil {
		return nil
	}

	// 写入内容
	// 只有当 Content 或 Path 有值时才写入文件；两者都为空时（例如
	// FetchArtifactPreview 拉取失败）不创建 artifact，避免向子 agent
	// 暴露一个指向不存在文件的路径导致 handoff 失败。
	contentPath := filepath.Join(artifactDir, name)
	fileWritten := false
	if art.Content != "" {
		if err := os.WriteFile(contentPath, []byte(art.Content), 0644); err != nil {
			return nil
		}
		fileWritten = true
	} else if art.Path != "" {
		// 复制 daemon 生成的文件
		data, err := os.ReadFile(art.Path)
		if err != nil {
			return nil
		}
		if err := os.WriteFile(contentPath, data, 0644); err != nil {
			return nil
		}
		fileWritten = true
	}
	if !fileWritten {
		return nil
	}

	info, _ := os.Stat(contentPath)
	atype := protocol.ArtifactDesign
	if ma.Spec.Role == "writer" || ma.Spec.Role == "copy" {
		atype = protocol.ArtifactCopy
	}

	artifact := &protocol.Artifact{
		ID:        id,
		Name:      name,
		Type:      atype,
		Path:      contentPath,
		Size:      0,
		Producer:  ma.Spec.ID,
		CreatedAt: time.Now(),
		Metadata:  map[string]string{"task_id": taskID},
	}
	if info != nil {
		artifact.Size = info.Size()
	}

	// 写入元数据
	meta, _ := json.Marshal(artifact)
	os.WriteFile(filepath.Join(artifactDir, "meta.json"), meta, 0644)

	return artifact
}

// AssignTask 分配任务给指定 Agent
func (p *Pool) AssignTask(agentID string, task *TaskAssignment) error {
	p.mu.RLock()
	ma, ok := p.agents[agentID]
	p.mu.RUnlock()

	if !ok {
		return fmt.Errorf("agent not found: %s", agentID)
	}

	select {
	case ma.taskCh <- task:
		return nil
	case <-ma.ctx.Done():
		return fmt.Errorf("agent %s is shut down", agentID)
	default:
		return fmt.Errorf("agent %s task queue full", agentID)
	}
}

// WaitResult 等待 Agent 任务结果
func (p *Pool) WaitResult(agentID string, timeout time.Duration) (*TaskResult, error) {
	p.mu.RLock()
	ma, ok := p.agents[agentID]
	p.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("agent not found: %s", agentID)
	}

	select {
	case result := <-ma.replyCh:
		return result, nil
	case <-time.After(timeout):
		return nil, fmt.Errorf("timeout waiting for agent %s result", agentID)
	}
}

// WaitResultContext 等待 Agent 任务结果，支持通过 context 取消等待。
// 当 ctx 被取消（如并行调度器的 proceed signal 触发 cancel）时，
// 优先检查 replyCh 中是否已有已完成的结果，避免因 select 随机性
// 导致已完成结果在 ctx.Done() 竞态下丢失（partial-results 场景）。
func (p *Pool) WaitResultContext(ctx context.Context, agentID string, timeout time.Duration) (*TaskResult, error) {
	p.mu.RLock()
	ma, ok := p.agents[agentID]
	p.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("agent not found: %s", agentID)
	}

	select {
	case result := <-ma.replyCh:
		return result, nil
	case <-ctx.Done():
		// ctx 取消时优先排空 replyCh：agent 可能刚好在 cancel 瞬间
		// 将结果写入了 replyCh，此时 Go select 会随机选分支，
		// 不加非阻塞检查可能丢失已完成的结果。
		select {
		case result := <-ma.replyCh:
			return result, nil
		default:
			return nil, fmt.Errorf("wait cancelled for agent %s: %w", agentID, ctx.Err())
		}
	case <-time.After(timeout):
		// 超时时同样优先检查 replyCh，避免丢失恰好到达的结果
		select {
		case result := <-ma.replyCh:
			return result, nil
		default:
			return nil, fmt.Errorf("timeout waiting for agent %s result", agentID)
		}
	}
}

// GetRuntime 获取 Agent 运行时信息
func (p *Pool) GetRuntime(agentID string) (*protocol.AgentRuntime, error) {
	p.mu.RLock()
	defer p.mu.RUnlock()

	ma, ok := p.agents[agentID]
	if !ok {
		return nil, fmt.Errorf("agent not found: %s", agentID)
	}

	rt := ma.Runtime
	return &rt, nil
}

// ListRuntimes 列出所有 Agent 运行时
func (p *Pool) ListRuntimes() []protocol.AgentRuntime {
	p.mu.RLock()
	defer p.mu.RUnlock()

	var runtimes []protocol.AgentRuntime
	for _, ma := range p.agents {
		runtimes = append(runtimes, ma.Runtime)
	}
	return runtimes
}

// SetDaemonAddr 动态设置 daemon 地址（CLI 启动时调用）
func SetDaemonAddr(addr string) {
	DaemonAddr = addr
}

// SetMainAgent 设置主 Agent ID。只有主 Agent 的 SSE 事件会被转发
// 到前端聊天窗，其它 Agent 的事件会被静默消费，避免多 Agent 同时
// 输出导致聊天窗卡顿。
func (p *Pool) SetMainAgent(id string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.mainAgentID = id
	for _, ma := range p.agents {
		ma.isMain = ma.Spec.ID == id
	}
}

// SetEventSink 设置事件转发回调。已在 pool 中的 agent 和后续
// 注册的 agent 都会收到此回调。odteam CLI 用它把 daemon SSE 事件
// 流式输出到 stdout，供 daemon 转发给前端。
func (p *Pool) SetEventSink(fn EventSink) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.eventSink = fn
	for _, ma := range p.agents {
		ma.onEvent = fn
	}
}

// SetRunContext 设置运行项目/会话上下文，传递给后续 agent 的
// daemon /api/chat 请求。odteam CLI 从 stdin JSON 中读取这些值。
func (p *Pool) SetRunContext(projectId, conversationId string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.projectId = projectId
	p.conversationId = conversationId
	for _, ma := range p.agents {
		ma.projectId = projectId
		ma.conversationId = conversationId
	}
}

// Shutdown 关闭所有 Agent
func (p *Pool) Shutdown() {
	p.mu.Lock()
	defer p.mu.Unlock()

	for id, ma := range p.agents {
		ma.cancel()
		p.bus.Unsubscribe(id)
	}
}
