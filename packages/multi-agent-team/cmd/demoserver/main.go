// Package main 多 Agent 团队协作演示服务器
//
// 启动后访问 http://localhost:8090 查看演示面板。
// GET  /api/status           — daemon 连接状态
// POST /api/execute          — 执行团队任务，返回 SSE 流
// GET  /api/artifacts/:id    — 查看产物内容
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/config"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/profiler"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/scheduler"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

var (
	port       = "8090"
	daemonAddr = "http://127.0.0.1:7456"
	workDir    string
)

type uiAgentInfo struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Command    string `json:"command"`
	Available  bool   `json:"available"`
	Source     string `json:"source"`
	AuthStatus string `json:"authStatus,omitempty"` // ok | missing | unknown | ""(未装)
	FixHint    string `json:"fixHint,omitempty"`    // 认证失败时的修复指引
}

func main() {
	home, _ := os.UserHomeDir()
	workDir = home + "/.opendesign-demo"

	if a := os.Getenv("PORT"); a != "" {
		port = a
	}
	if a := os.Getenv("DAEMON_ADDR"); a != "" {
		daemonAddr = a
	}

	// 确保工作目录存在
	os.MkdirAll(workDir+"/artifacts", 0755)

	mux := http.NewServeMux()

	// 静态文件 — 演示面板
	mux.HandleFunc("/", serveDashboard)

	// API
	mux.HandleFunc("/api/status", handleStatus)
	mux.HandleFunc("/api/agents", handleAgents)
	mux.HandleFunc("/api/execute", handleExecute)
	mux.HandleFunc("/api/artifacts/", handleArtifacts)
	mux.HandleFunc("/api/modes", handleModes)

	srv := &http.Server{Addr: ":" + port, Handler: withCORS(mux)}

	go func() {
		log.Printf("🚀 Demo server: http://localhost:%s", port)
		log.Printf("   Daemon target: %s", daemonAddr)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	// 优雅关闭
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	log.Println("Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}

func serveDashboard(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(dashboardHTML)
		return
	}
	http.NotFound(w, r)
}

// handleAgents 返回 Agent 列表，含本地认证预检状态。
// 始终以本地 scanLocalAgents() 为基础（含 authStatus），daemon 在线时
// 用 daemon 的 installed 状态修正本地 available 判断，避免重复探测。
func handleAgents(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	list := scanLocalAgents()
	source := "local-scan"
	var errText string

	// daemon 在线时，用 daemon 的 installed 状态补充本地判断
	// （daemon 的检测更准确，会探测版本、配置等）。
	if raw, err := fetchDaemonAgentsRaw(ctx); err == nil {
		source = "local+daemon"
		daemonInstalled := make(map[string]bool)
		for _, item := range parseDaemonAgents(raw) {
			if item.Available {
				daemonInstalled[item.ID] = true
			}
		}
		for i := range list {
			if daemonInstalled[list[i].ID] {
				list[i].Available = true
				list[i].Source = "daemon"
			}
		}
	} else {
		errText = err.Error()
	}
	writeJSON(w, map[string]any{"agents": list, "source": source, "error": errText})
}

func fetchDaemonAgentsRaw(ctx context.Context) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(daemonAddr, "/")+"/api/agents", nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("daemon status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	return raw, nil
}

func parseDaemonAgents(raw map[string]any) []uiAgentInfo {
	items, _ := raw["agents"].([]any)
	list := make([]uiAgentInfo, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id, _ := m["id"].(string)
		if id == "" {
			continue
		}
		name, _ := m["name"].(string)
		cmd, _ := m["command"].(string)
		if cmd == "" {
			cmd, _ = m["bin"].(string)
		}
		available, _ := m["available"].(bool)
		if installed, ok := m["installed"].(bool); ok {
			available = installed
		}
		list = append(list, uiAgentInfo{ID: id, Name: name, Command: cmd, Available: available, Source: "daemon"})
	}
	return list
}

func scanLocalAgents() []uiAgentInfo {
	// 与 daemon 的 apps/daemon/src/runtimes/defs/ 完全对齐（22 个 runtime）。
	// Bins 顺序：daemon 主 bin → daemon fallbackBins → 用户 PATH 常见短名。
	// 任一命中即视为可用，避免因命令名差异漏检。
	// AuthCheck：认证探测（检查配置文件/凭证是否存在，或运行 status 命令）；
	// FixHint：失败时给用户的修复指引。
	home, _ := os.UserHomeDir()
	type authCheck struct {
		// 任一文件存在即视为已认证（凭据文件）
		Files []string
		// 或运行此命令成功（status/whoami 类）
		Cmd []string
	}
	candidates := []struct {
		ID, Name string
		Bins     []string
		Auth     authCheck
		FixHint  string
	}{
		{"amr", "AMR", []string{"vela"}, authCheck{}, ""},
		{"claude", "Claude Code", []string{"claude"}, authCheck{Files: []string{home + "/.claude/.credentials.json", home + "/.claude/credentials.json", home + "/.claude/auth.json"}}, "Claude Code 未登录。在终端运行 `claude`，进入后执行 `/login` 完成登录，然后重试。"},
		{"codex", "Codex CLI", []string{"codex"}, authCheck{Files: []string{home + "/.codex/auth.json"}}, "Codex CLI 配置异常。检查 `~/.codex/config.toml` 的 `[permissions]` 表与 `~/.codex/auth.json` 凭证；运行 `codex login` 确认已登录。"},
		{"devin", "Devin for Terminal", []string{"devin"}, authCheck{}, ""},
		{"gemini", "Gemini CLI", []string{"gemini"}, authCheck{Files: []string{home + "/.gemini/oauth_creds.json", home + "/.config/gemini/oauth_creds.json"}}, "Gemini CLI 未登录。运行 `gemini auth login` 完成认证。"},
		{"opencode", "OpenCode", []string{"opencode-cli", "opencode"}, authCheck{Files: []string{home + "/.config/opencode/opencode.json", home + "/.opencode/opencode.json"}}, "OpenCode 未配置。运行 `opencode auth` 设置 provider 凭据。"},
		{"hermes", "Hermes", []string{"hermes"}, authCheck{Files: []string{home + "/.hermes/auth.json"}}, "Hermes 未认证。运行 `hermes auth add <provider>` 添加 provider（如 xai-oauth / openai）。"},
		{"trae-cli", "Trae CLI", []string{"traecli", "trae"}, authCheck{Files: []string{home + "/.trae-cli/config.json", home + "/.trae/config.json"}}, "Trae CLI 未登录。运行 `traecli login` 完成认证。"},
		{"grok-build", "Grok Build", []string{"grok", "grok-build"}, authCheck{Cmd: []string{"grok", "auth", "status"}}, "Grok Build 未配置。设置 XAI_API_KEY 环境变量或运行 `grok auth`。"},
		{"kimi", "Kimi CLI", []string{"kimi"}, authCheck{Files: []string{home + "/.kimi/config.json"}}, "Kimi CLI 未登录。运行 `kimi login` 或设置 MOONSHOT_API_KEY。"},
		{"cursor-agent", "Cursor Agent", []string{"cursor-agent", "cursor"}, authCheck{Cmd: []string{"cursor-agent", "status"}}, "Cursor Agent 未登录。运行 `cursor-agent login`，再 `cursor-agent status` 确认，然后重试。"},
		{"qwen", "Qwen Code", []string{"qwen"}, authCheck{Files: []string{home + "/.qwen/config.json"}}, "Qwen Code 未登录。运行 `qwen login` 或设置 DASHSCOPE_API_KEY。"},
		{"qoder", "Qoder CLI", []string{"qodercli", "qoder"}, authCheck{Cmd: []string{"qodercli", "auth", "status"}}, "Qoder CLI 未登录。运行 `qodercli login` 或设置 QODER_PERSONAL_ACCESS_TOKEN。"},
		{"copilot", "GitHub Copilot CLI", []string{"copilot"}, authCheck{Cmd: []string{"copilot", "auth", "status"}}, "GitHub Copilot CLI 未登录。运行 `copilot auth` 完成认证。"},
		{"pi", "Pi", []string{"pi"}, authCheck{}, ""},
		{"kiro", "Kiro CLI", []string{"kiro-cli", "kiro"}, authCheck{Files: []string{home + "/.kiro/config.json"}}, "Kiro CLI 未登录。运行 `kiro-cli login` 完成认证。"},
		{"kilo", "Kilo", []string{"kilo"}, authCheck{}, ""},
		{"vibe", "Mistral Vibe CLI", []string{"vibe-acp", "vibe"}, authCheck{}, ""},
		{"deepseek", "DeepSeek TUI", []string{"deepseek", "codewhale"}, authCheck{Files: []string{home + "/.deepseek/config.toml"}}, "DeepSeek TUI 未配置 API Key。在 `~/.deepseek/config.toml` 设置 `api_key = \"...\"`，或设置 DEEPSEEK_API_KEY 环境变量。"},
		{"aider", "Aider", []string{"aider"}, authCheck{}, "Aider 未配置。设置 ANTHROPIC_API_KEY 或 OPENAI_API_KEY 环境变量。"},
		{"antigravity", "Antigravity", []string{"agy", "antigravity"}, authCheck{}, "Antigravity 需登录。在终端运行 `agy` 一次，浏览器完成 Google 登录后凭证会存入系统 keyring，然后重试。"},
		{"reasonix", "DeepSeek Reasonix", []string{"reasonix", "dsnix"}, authCheck{Files: []string{home + "/.reasonix/config.json"}}, "DeepSeek Reasonix 未配置。在 `~/.reasonix/config.json` 的 `apiKey` 字段填入 API Key，或设置 DEEPSEEK_API_KEY。"},
	}
	list := make([]uiAgentInfo, 0, len(candidates))
	for _, c := range candidates {
		available := false
		cmd := c.Bins[0]
		for _, b := range c.Bins {
			if _, err := exec.LookPath(b); err == nil {
				available = true
				cmd = b
				break
			}
		}
		info := uiAgentInfo{ID: c.ID, Name: c.Name, Command: cmd, Available: available, Source: "local"}
		if available {
			info.AuthStatus, info.FixHint = probeAuth(c.Auth, c.FixHint)
		}
		list = append(list, info)
	}
	return list
}

// probeAuth 认证预检：凭据文件存在 或 status 命令成功 → ok；否则 missing。
// 未定义任何探测条件（Files/Cmd 均空）→ unknown（无法判断）。
func probeAuth(check struct {
	Files []string
	Cmd   []string
}, fixHint string) (string, string) {
	// 未定义探测条件 → 无法判断
	if len(check.Files) == 0 && len(check.Cmd) == 0 {
		return "unknown", ""
	}
	// 1. 检查凭据文件（任一存在即 ok）
	for _, f := range check.Files {
		if _, err := os.Stat(f); err == nil {
			return "ok", ""
		}
	}
	// 2. 运行 status 命令
	if len(check.Cmd) > 0 {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, check.Cmd[0], check.Cmd[1:]...)
		cmd.Stdout = nil
		cmd.Stderr = nil
		cmd.Stdin = nil
		if err := cmd.Run(); err == nil {
			return "ok", ""
		}
	}
	// 3. 有探测条件但都不满足 → missing
	return "missing", fixHint
}

// handleStatus 检查 daemon 连接
// 用 /api/health（毫秒级）判断连通性，避免 /api/agents 首次探测 CLI 版本超时。
func handleStatus(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2000*time.Millisecond)
	defer cancel()

	connected := false
	if resp, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(daemonAddr, "/")+"/api/health", nil); err == nil {
		if r, err := http.DefaultClient.Do(resp); err == nil {
			r.Body.Close()
			if r.StatusCode == http.StatusOK {
				connected = true
			}
		}
	}

	resp := map[string]any{
		"daemon":    daemonAddr,
		"connected": connected,
		"agents":    0,
	}
	if !connected {
		resp["fallback"] = "local-scan"
	}
	writeJSON(w, resp)
}

// handleModes 列出可用调度模式
func handleModes(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, []map[string]any{
		{"id": "inheritance", "name": "Inheritance", "desc": "父子 Agent 上下文继承，工件传递与版本链追踪"},
		{"id": "cycle", "name": "Cycle", "desc": "生成器 ↔ 评审迭代求精，达到阈值后退出"},
		{"id": "complementary", "name": "Complementary", "desc": "互补专家链式交接，按序传递工件"},
		{"id": "parallel", "name": "Parallel", "desc": "同层级 Agent 并行执行，sync.WaitGroup 汇总"},
		{"id": "serial", "name": "Serial", "desc": "按阶段链式传递，前段 artifacts 通过 ContextSnapshot 交接"},
		{"id": "genetic", "name": "Genetic", "desc": "多代进化：并行生成 N 个变体 → 选择 → 最优解传下一代"},
		{"id": "hybrid", "name": "Hybrid", "desc": "按依赖分层层，同层并行，层间串行传递 artifacts"},
	})
}

// executeRequest 执行请求
type executeRequest struct {
	Config string `json:"config"` // YAML 文本
	Prompt string `json:"prompt"`
}

// handleExecute 执行团队任务 — 返回 SSE 流
func handleExecute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}

	var req executeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.Config == "" {
		http.Error(w, "config is required", http.StatusBadRequest)
		return
	}
	if req.Prompt == "" {
		req.Prompt = "Design a modern SaaS landing page hero section"
	}

	// 解析 YAML 配置
	tmpFile, err := os.CreateTemp("", "odteam-*.yaml")
	if err != nil {
		sendSSE(w, sseEvent{Event: "error", Data: map[string]string{"msg": "tempfile: " + err.Error()}})
		return
	}
	defer os.Remove(tmpFile.Name())
	if _, err := tmpFile.Write([]byte(req.Config)); err != nil {
		sendSSE(w, sseEvent{Event: "error", Data: map[string]string{"msg": "write config: " + err.Error()}})
		return
	}
	tmpFile.Close()

	cfg, err := config.Load(tmpFile.Name())
	if err != nil {
		sendSSE(w, sseEvent{Event: "error", Data: map[string]string{"msg": "config: " + err.Error()}})
		return
	}

	// SSE 头
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	// 设置 daemon 地址
	agent.SetDaemonAddr(daemonAddr)

	// 创建通信总线
	b := bus.NewBus()

	// 创建 Agent 池
	pool := agent.NewPool(cfg, b, workDir)
	defer pool.Shutdown()

	// 发送初始化事件
	sendSSETo(w, flusher, sseEvent{
		Event: "init",
		Data: map[string]any{
			"mode":        cfg.Team.Mode,
			"agents":      len(cfg.Team.Agents),
			"prompt":      req.Prompt,
			"auto_assign": cfg.Team.AutoAssign,
		},
	})

	// 如果启用了 auto_assign，发送智能组队分配结果
	if cfg.Team.AutoAssign {
		builder := pool.GetTeamBuilder()
		for _, spec := range cfg.Team.Agents {
			profile := builder.GetProfile(spec.ID)
			if profile != nil {
				bestRole, score := profile.FindBestRole()
				strengthLabels := profiler.CapabilityLabels(profile.Strengths)
				sendSSETo(w, flusher, sseEvent{
					Event: "auto_assign",
					Data: map[string]any{
						"agent_id":   spec.ID,
						"agent_type": spec.Type,
						"role":       bestRole.ID,
						"score":      fmt.Sprintf("%.0f", score),
						"profile":    profile.ProfileSummary(),
						"strengths":  strengthLabels,
						"traits":     profile.Traits,
					},
				})
			}
		}
	}

	// 构建执行计划（auto_assign 模式下会基于能力画像重写角色分配）
	plan := buildExecutionPlan(cfg, req.Prompt, pool)

	// 根据模式选择调度器
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
	defer cancel()

	results, execErr := runScheduler(ctx, cfg.Team.Mode, pool, b, plan)

	// 发送结果
	for _, result := range results {
		sendSSETo(w, flusher, sseEvent{
			Event: "result",
			Data: map[string]any{
				"agent":     result.AgentID,
				"success":   result.Success,
				"artifacts": len(result.Artifacts),
				"duration":  result.Metrics.Duration.String(),
				"error":     result.Error,
			},
		})

		// 每个 artifact 发送预览
		for _, art := range result.Artifacts {
			preview := ""
			if art.Path != "" {
				if data, err := os.ReadFile(art.Path); err == nil {
					if len(data) > 5000 {
						preview = string(data[:5000])
					} else {
						preview = string(data)
					}
				}
			}
			sendSSETo(w, flusher, sseEvent{
				Event: "artifact",
				Data: map[string]any{
					"id":       art.ID,
					"name":     art.Name,
					"type":     art.Type,
					"producer": art.Producer,
					"preview":  preview,
				},
			})
		}
	}

	if execErr != nil {
		sendSSETo(w, flusher, sseEvent{
			Event: "error",
			Data:  map[string]string{"msg": execErr.Error()},
		})
	}

	sendSSETo(w, flusher, sseEvent{Event: "done", Data: map[string]any{"results": len(results)}})
}

// runScheduler 根据模式选择并运行调度器
func runScheduler(
	ctx context.Context,
	mode string,
	pool *agent.Pool,
	b *bus.CommunicationBus,
	plan *scheduler.ExecutionPlan,
) ([]*scheduler.TaskResult, error) {
	switch mode {
	case "inheritance":
		s := scheduler.NewInheritanceScheduler(pool, b)
		return s.Execute(ctx, plan)
	case "cycle":
		s := scheduler.NewCycleScheduler(pool, b)
		return s.Execute(ctx, plan)
	case "complementary":
		s := scheduler.NewComplementaryScheduler(pool, b)
		return s.Execute(ctx, plan)
	case "parallel":
		s := scheduler.NewParallelScheduler(pool, b)
		return s.Execute(ctx, plan)
	case "serial":
		s := scheduler.NewSerialScheduler(pool, b)
		return s.Execute(ctx, plan)
	case "genetic":
		s := scheduler.NewGeneticScheduler(pool, b)
		return s.Execute(ctx, plan)
	case "hybrid":
		s := scheduler.NewHybridScheduler(pool, b)
		return s.Execute(ctx, plan)
	default:
		return nil, fmt.Errorf("unsupported mode: %s", mode)
	}
}

// buildExecutionPlan 将 YAML 配置转为执行计划
// 启用 auto_assign 时，基于智能组队结果重写 AssignedTo，实现真正的能力驱动角色分配
func buildExecutionPlan(cfg *config.TeamConfig, prompt string, pool *agent.Pool) *scheduler.ExecutionPlan {
	plan := &scheduler.ExecutionPlan{}

	// 智能组队：当 auto_assign 启用时，用 TeamBuilder 的角色分配结果重写任务分配
	// roleToAgent: 角色 -> 实际执行的 Agent ID（由能力画像决定，而非 YAML 顺序）
	roleToAgent := buildRoleAssignment(cfg, pool)

	for i, spec := range cfg.Team.Agents {
		task := scheduler.Task{
			ID: fmt.Sprintf("task-%s", spec.ID),
			Prompt: func() string {
				if i == 0 {
					return prompt
				}
				return fmt.Sprintf("[Inherited from previous stage]\nContinue refining: %s", prompt)
			}(),
			AssignedTo: resolveAssignedTo(spec, roleToAgent),
			Timeout:    600,
		}

		// 对于继承/串行模式，建立依赖链
		if cfg.Team.Mode == "inheritance" || cfg.Team.Mode == "serial" {
			if cfg.Inheritance.Enabled && cfg.Inheritance.Tree != nil && cfg.Team.Mode == "inheritance" {
				// 优先从 YAML inheritance.tree 解析依赖关系
				deps := findDependencies(cfg.Inheritance.Tree, spec.ID)
				if len(deps) > 0 {
					task.Dependencies = deps
				}
			} else if i > 0 {
				// fallback：按 agents 列表顺序建线性依赖链
				task.Dependencies = []string{fmt.Sprintf("task-%s", cfg.Team.Agents[i-1].ID)}
			}
		}

		plan.Tasks = append(plan.Tasks, task)
	}

	// 互补模式：专家链 — 智能组队重写 ExpertID
	if len(cfg.Team.Experts) > 0 {
		for i, e := range cfg.Team.Experts {
			expertID := e.AgentID
			// auto_assign 模式下，用该角色的最佳 Agent 替换
			if cfg.Team.AutoAssign && roleToAgent != nil {
				role := profiler.RoleByName(e.Role)
				if mapped, ok := roleToAgent[role.ID]; ok {
					expertID = mapped
				}
			}
			plan.Experts = append(plan.Experts, &scheduler.ExpertTask{
				ExpertID:  expertID,
				Role:      e.Role,
				Specialty: e.Specialty,
				Skills:    e.Skills,
				Designs:   e.Designs,
				Order:     i,
				Prompt:    prompt,
			})
		}
	}

	// 循环模式 — 智能组队重写 GeneratorID / ReviewerID
	if cfg.Team.Cycle != nil {
		genID := cfg.Team.Cycle.GeneratorID
		revID := cfg.Team.Cycle.ReviewerID
		if cfg.Team.AutoAssign && pool != nil {
			builder := pool.GetTeamBuilder()
			cycleAssign := builder.BuildCycleTeam()
			for _, a := range cycleAssign {
				if a.Role == "generator" {
					genID = a.AgentID
				}
				if a.Role == "reviewer" {
					revID = a.AgentID
				}
			}
		}
		plan.Cycle = &scheduler.CycleConfig{
			GeneratorID:    genID,
			ReviewerID:     revID,
			MaxIterations:  cfg.Team.Cycle.MaxIterations,
			ScoreThreshold: cfg.Team.Cycle.ScoreThreshold,
			Topic:          prompt,
		}
	}

	return plan
}

// buildRoleAssignment 构建角色 -> Agent ID 的映射
// auto_assign 启用时，按协作模式调用对应的 Build*Team 方法获取智能分配
// 未启用时返回 nil，保持原有 YAML 静态分配
func buildRoleAssignment(cfg *config.TeamConfig, pool *agent.Pool) map[string]string {
	if !cfg.Team.AutoAssign || pool == nil {
		return nil
	}
	builder := pool.GetTeamBuilder()
	roleToAgent := make(map[string]string)

	switch cfg.Team.Mode {
	case "complementary":
		for _, a := range builder.BuildComplementaryTeam() {
			roleToAgent[a.Role] = a.AgentID
		}
	case "cycle":
		for _, a := range builder.BuildCycleTeam() {
			roleToAgent[a.Role] = a.AgentID
		}
	case "inheritance":
		for _, a := range builder.BuildInheritanceTeam() {
			roleToAgent[a.Role] = a.AgentID
		}
	case "genetic":
		if a := builder.BuildGeneticTeam(); a.AgentID != "" {
			roleToAgent["generator"] = a.AgentID
		}
	case "parallel":
		roles := extractRolesFromAgents(cfg.Team.Agents)
		for _, a := range builder.BuildParallelTeam(roles) {
			roleToAgent[a.Role] = a.AgentID
		}
	case "serial":
		roles := extractRolesFromAgents(cfg.Team.Agents)
		for _, a := range builder.BuildSerialTeam(roles) {
			roleToAgent[a.Role] = a.AgentID
		}
	case "hybrid":
		roles := extractRolesFromAgents(cfg.Team.Agents)
		for _, a := range builder.BuildHybridTeam(roles) {
			roleToAgent[a.Role] = a.AgentID
		}
	}
	return roleToAgent
}

// extractRolesFromAgents 从 AgentSpec 列表提取角色 ID
func extractRolesFromAgents(agents []config.AgentSpec) []string {
	var roles []string
	for _, a := range agents {
		roles = append(roles, profiler.RoleByName(a.Role).ID)
	}
	return roles
}

// resolveAssignedTo 解析任务应分配给哪个 Agent
// 优先用智能组队结果，fallback 到 YAML 配置的 spec.ID
func resolveAssignedTo(spec config.AgentSpec, roleToAgent map[string]string) string {
	if roleToAgent != nil {
		role := profiler.RoleByName(spec.Role)
		if mapped, ok := roleToAgent[role.ID]; ok {
			return mapped
		}
	}
	return spec.ID
}

// findDependencies 在继承树中查找指定 agent 的父节点（即它依赖谁）
// 返回父节点的 task ID 列表（通常为 0 或 1 个）
func findDependencies(tree *config.TreeNode, agentID string) []string {
	var deps []string
	var walk func(node *config.TreeNode)
	walk = func(node *config.TreeNode) {
		if node == nil {
			return
		}
		for _, child := range node.Children {
			if child.AgentID == agentID {
				deps = append(deps, fmt.Sprintf("task-%s", node.AgentID))
			}
			walk(child)
		}
	}
	walk(tree)
	return deps
}

// handleArtifacts 返回 artifact 内容
func handleArtifacts(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/artifacts/")
	if id == "" {
		http.Error(w, "missing artifact id", http.StatusBadRequest)
		return
	}

	// 扫描 artifacts 目录
	entries, _ := os.ReadDir(workDir + "/artifacts")
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dirPath := workDir + "/artifacts/" + e.Name()
		metaPath := dirPath + "/meta.json"
		data, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}
		var art protocol.Artifact
		if json.Unmarshal(data, &art) != nil {
			continue
		}
		if strings.HasPrefix(art.ID, id) || art.ID == id {
			content, _ := os.ReadFile(art.Path)
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write(content)
			return
		}
	}
	http.NotFound(w, r)
}

// ---- SSE helpers ----

type sseEvent struct {
	Event string `json:"event"`
	Data  any    `json:"data"`
}

func sendSSE(w http.ResponseWriter, e sseEvent) {
	if flusher, ok := w.(http.Flusher); ok {
		sendSSETo(w, flusher, e)
	}
}

func sendSSETo(w http.ResponseWriter, flusher http.Flusher, e sseEvent) {
	data, _ := json.Marshal(e.Data)
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", e.Event, string(data))
	flusher.Flush()
}

func withCORS(next http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
