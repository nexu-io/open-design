// Package agent Agent 池管理与 OpenDesign Daemon 对接
package agent

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent/adapter/daemon"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/config"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// DaemonAddr 默认 daemon 地址（可被 CLi 覆盖）
var DaemonAddr = "http://127.0.0.1:17900"

// Pool Agent 池管理器
type Pool struct {
	mu           sync.RWMutex
	agents       map[string]*ManagedAgent
	bus          *bus.CommunicationBus
	workDir      string
	daemonClient *daemon.Client
}

// ManagedAgent 受管理的 Agent 实例
type ManagedAgent struct {
	Spec     config.AgentSpec
	Runtime  protocol.AgentRuntime
	taskCh   chan *TaskAssignment
	replyCh  chan *TaskResult
	ctx      context.Context
	cancel   context.CancelFunc
	client   *daemon.Client
	workDir  string
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
	AgentID     string
	ParentTask  string
	Skills      []string
	Designs     []string
	Memory      map[string]any // 共享记忆
	ArtifactIDs []string
}

// NewPool 创建 Agent 池，连接 OpenDesign daemon
func NewPool(cfg *config.TeamConfig, b *bus.CommunicationBus, workDir string) *Pool {
	dc := daemon.NewClient(DaemonAddr)

	p := &Pool{
		agents:       make(map[string]*ManagedAgent),
		bus:          b,
		workDir:      workDir,
		daemonClient: dc,
	}

	for _, spec := range cfg.Team.Agents {
		p.registerAgent(spec, dc)
	}

	return p
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
	}

	subCh := p.bus.Subscribe(spec.ID, 50)
	p.agents[spec.ID] = ma

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
	var artifacts []*protocol.Artifact
	for evt := range eventCh {
		switch evt.Type {
		case "artifact":
			var art daemon.ArtifactEvent
			if err := json.Unmarshal(evt.Data, &art); err != nil {
				continue
			}
			artifact := ma.saveArtifact(&art, task.TaskID)
			if artifact != nil {
				artifacts = append(artifacts, artifact)
			}
		case "error":
			var errMsg string
			if json.Unmarshal(evt.Data, &errMsg) == nil {
				result.Error = errMsg
			} else {
				result.Error = "daemon returned error event"
			}
			result.Metrics.EndTime = time.Now()
			result.Metrics.Duration = result.Metrics.EndTime.Sub(startTime)
			result.Success = false
			result.Artifacts = artifacts
			return result
		case "done":
			result.Success = true
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
// 对齐 daemon 协议：填充 agentId、skillIds、designSystemId、runContext
func (ma *ManagedAgent) buildChatRequest(task *TaskAssignment) daemon.ChatRequest {
	req := daemon.ChatRequest{
		Message:    task.Prompt,
		AgentId:    ma.Spec.ID,               // 指定实际使用的 Agent 类型
		Skills:     ma.Spec.Skills,           // YAML 中配置的技能 ID
		Designs:    ma.Spec.Designs,          // YAML 中配置的设计系统 ID
		RunContext: ma.Spec.Type,             // Agent 运行时类型 (claude-code/codex/cursor...)
		Stream:     true,
	}

	// 注入继承上下文
	if task.Context != nil && len(task.Context.ArtifactIDs) > 0 {
		ctxMap := map[string]any{
			"parent":       task.Context.AgentID,
			"artifact_ids": task.Context.ArtifactIDs,
			"memory":       task.Context.Memory,
		}
		if data, err := json.Marshal(ctxMap); err == nil {
			req.Context = json.RawMessage(data)
		}
	}

	return req
}

// saveArtifact 将 daemon 事件中的产物保存到工件存储
func (ma *ManagedAgent) saveArtifact(art *daemon.ArtifactEvent, taskID string) *protocol.Artifact {
	if art.Name == "" && art.Content == "" {
		return nil
	}

	// 生成产物 ID
	name := art.Name
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
	contentPath := filepath.Join(artifactDir, name)
	if art.Content != "" {
		if err := os.WriteFile(contentPath, []byte(art.Content), 0644); err != nil {
			return nil
		}
	} else if art.Path != "" {
		// 复制 daemon 生成的文件
		data, err := os.ReadFile(art.Path)
		if err != nil {
			return nil
		}
		if err := os.WriteFile(contentPath, data, 0644); err != nil {
			return nil
		}
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

// Shutdown 关闭所有 Agent
func (p *Pool) Shutdown() {
	p.mu.Lock()
	defer p.mu.Unlock()

	for id, ma := range p.agents {
		ma.cancel()
		p.bus.Unsubscribe(id)
	}
}
