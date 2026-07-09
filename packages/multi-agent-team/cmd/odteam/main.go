// Package main odteam CLI — 多 Agent 团队协作编排入口
//
// daemon 在 ChatRequest.team 存在时 spawn 本 CLI，通过 stdin 传入
// JSON 请求（prompt、team 配置、daemon 地址、项目上下文等），
// odteam 执行调度编排并通过 stdout 输出 JSON lines 事件流，
// daemon 解析后转发为 SSE 事件给前端。
//
// 事件格式（每行一个 JSON）：
//
//	{"event":"team_start","data":{"mode":"inheritance","agents":2,"teamName":"..."}}
//	{"event":"agent","data":{"agentId":"designer","type":"text_delta","delta":"..."}}
//	{"event":"task_result","data":{"agentId":"designer","success":true,"artifacts":1,"duration":"5s"}}
//	{"event":"team_end","data":{"success":true}}
//	{"event":"error","data":{"message":"..."}}
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/config"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/profiler"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/scheduler"
)

// teamRequest 从 stdin 读取的请求体，由 daemon 构造
type teamRequest struct {
	Prompt         string         `json:"prompt"`
	DaemonAddr     string         `json:"daemonAddr"`
	WorkDir        string         `json:"workDir"`
	ProjectId      string         `json:"projectId"`
	ConversationId string         `json:"conversationId"`
	Team           teamSelection  `json:"team"`
}

type teamSelection struct {
	ID          string           `json:"id"`
	Mode        string           `json:"mode"`
	Name        string           `json:"name"`
	Assignments []teamAssignment `json:"assignments"`
}

type teamAssignment struct {
	AgentId   string `json:"agentId"`
	AgentType string `json:"agentType"`
	AgentName string `json:"agentName"`
	Role      string `json:"role"`
}

// cliEvent 输出到 stdout 的 JSON lines 事件
type cliEvent struct {
	Event string          `json:"event"`
	Data  json.RawMessage `json:"data"`
}

func main() {
	// 使用单一 bufio.Scanner 读取 stdin，避免 json.Decoder 内部缓冲
	// 与 scanner 之间的数据竞争。第一行是初始 JSON 请求，后续行是控制命令。
	scanner := bufio.NewScanner(os.Stdin)
	if !scanner.Scan() {
		emitError("failed to read stdin")
		os.Exit(1)
	}

	var req teamRequest
	if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
		emitError(fmt.Sprintf("failed to parse request: %v", err))
		os.Exit(1)
	}

	if req.Prompt == "" {
		emitError("prompt is required")
		os.Exit(1)
	}
	if req.DaemonAddr == "" {
		emitError("daemonAddr is required")
		os.Exit(1)
	}
	if req.Team.Mode == "" {
		emitError("team.mode is required")
		os.Exit(1)
	}
	if len(req.Team.Assignments) == 0 {
		emitError("team.assignments must not be empty")
		os.Exit(1)
	}

	// 后台读取 stdin 控制命令（如 {"command":"proceed"}），用于前端跳过/继续。
	// daemon 在发送初始请求后保持 stdin 打开，前端触发跳过时 daemon 写入
	// 控制命令到此 stdin，odteam 收到后取消剩余 Agent 并返回部分结果。
	skipCh := make(chan struct{})
	go func() {
		for scanner.Scan() {
			var cmd struct {
				Command string `json:"command"`
			}
			if json.Unmarshal(scanner.Bytes(), &cmd) == nil && cmd.Command == "proceed" {
				close(skipCh)
				return
			}
		}
	}()

	// 从 team.assignments 构建 TeamConfig
	cfg := buildTeamConfig(&req)

	// 设置 daemon 地址
	agent.SetDaemonAddr(req.DaemonAddr)

	// 确保工作目录存在
	workDir := req.WorkDir
	if workDir == "" {
		home, _ := os.UserHomeDir()
		workDir = filepath.Join(home, ".opendesign-team")
	}
	os.MkdirAll(filepath.Join(workDir, "artifacts"), 0755)

	// 指定主 Agent：只有主 Agent 的 SSE 事件会进入前端聊天窗，
	// 避免多 Agent 同时输出导致聊天窗卡顿。
	mainAgentID := selectMainAgentID(req.Team.Assignments)

	// 发送 team_start 事件
	emitEvent("team_start", map[string]any{
		"mode":        cfg.Team.Mode,
		"agents":      len(cfg.Team.Agents),
		"teamName":    cfg.Team.Name,
		"mainAgentId": mainAgentID,
	})

	// 创建通信总线和 Agent 池
	b := bus.NewBus()
	pool := agent.NewPool(cfg, b, workDir)
	defer pool.Shutdown()

	// 设置运行上下文（projectId / conversationId 传给 daemon /api/chat）
	pool.SetRunContext(req.ProjectId, req.ConversationId)

	if mainAgentID != "" {
		pool.SetMainAgent(mainAgentID)
	}

	// 设置事件回调：把 daemon SSE 事件流式转发到 stdout
	pool.SetEventSink(func(agentID, eventType string, data []byte) {
		// 将原始 daemon 事件包裹后转发，附带 agentId
		wrapped := map[string]json.RawMessage{
			"agentId": json.RawMessage(fmt.Sprintf("%q", agentID)),
		}
		// 尝试把 data 解析为 JSON object 并合并
		var obj map[string]json.RawMessage
		if json.Unmarshal(data, &obj) == nil {
			for k, v := range obj {
				wrapped[k] = v
			}
		} else {
			// 非 JSON payload，作为 raw 字段
			wrapped["raw"] = data
		}
		merged, _ := json.Marshal(wrapped)
		emitEvent("agent", json.RawMessage(merged))
	})

	// 构建执行计划
	plan := buildExecutionPlan(cfg, req.Prompt)

	// 根据模式选择调度器并执行
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	results, execErr := runScheduler(ctx, cfg.Team.Mode, pool, b, plan, skipCh)

	// 发送每个任务的结果事件
	for _, r := range results {
		emitEvent("task_result", map[string]any{
			"agentId":   r.AgentID,
			"success":   r.Success,
			"artifacts": len(r.Artifacts),
			"duration":  r.Metrics.Duration.String(),
			"error":     r.Error,
		})
	}

	if execErr != nil {
		emitError(fmt.Sprintf("orchestration failed: %v", execErr))
		os.Exit(1)
	}

	allSuccess := true
	for _, r := range results {
		if !r.Success {
			allSuccess = false
			break
		}
	}

	emitEvent("team_end", map[string]any{"success": allSuccess})
	if !allSuccess {
		os.Exit(1)
	}
}

// selectMainAgentID 从 assignments 中选出主 Agent。
// 优先选择 synthesizer/coordinator 角色，否则选择最后一位 Agent
//（串行/继承/互补模式下通常是最终输出者）。
func selectMainAgentID(assignments []teamAssignment) string {
	for _, a := range assignments {
		if a.Role == "synthesizer" || a.Role == "coordinator" {
			return a.AgentId
		}
	}
	if len(assignments) > 0 {
		return assignments[len(assignments)-1].AgentId
	}
	return ""
}

// buildTeamConfig 从 teamRequest 构建 TeamConfig
// 根据协作模式从 assignments 推导 cycle / complementary 专属配置。
// daemon 传来的请求只包含 assignments（不含 cycle/experts），
// 因此由 odteam 根据 mode 和 role 自行组装。
func buildTeamConfig(req *teamRequest) *config.TeamConfig {
	cfg := &config.TeamConfig{
		Team: config.Team{
			Name:   req.Team.Name,
			Mode:   req.Team.Mode,
			Agents: make([]config.AgentSpec, 0, len(req.Team.Assignments)),
		},
		Inheritance: config.InheritanceCfg{
			Enabled: req.Team.Mode == "inheritance",
		},
	}

	for _, a := range req.Team.Assignments {
		cfg.Team.Agents = append(cfg.Team.Agents, config.AgentSpec{
			ID:   a.AgentId,
			Name: a.AgentName,
			Role: a.Role,
			Type: a.AgentType,
		})
	}

	// 循环模式：从 assignments 中提取 generator / reviewer
	// role 为 "generator" 或 "reviewer" 的 assignment 映射到 CycleSpec
	if req.Team.Mode == "cycle" {
		cycle := &config.CycleSpec{
			MaxIterations:  5,
			ScoreThreshold: 8.0,
		}
		for _, a := range req.Team.Assignments {
			switch a.Role {
			case "generator":
				cycle.GeneratorID = a.AgentId
			case "reviewer":
				cycle.ReviewerID = a.AgentId
			}
		}
		cfg.Team.Cycle = cycle
	}

	// 互补模式：每个 assignment 映射为一个 ExpertSpec
	if req.Team.Mode == "complementary" && len(req.Team.Assignments) > 0 {
		experts := make([]config.ExpertSpec, 0, len(req.Team.Assignments))
		for i, a := range req.Team.Assignments {
			experts = append(experts, config.ExpertSpec{
				AgentID:   a.AgentId,
				Role:      a.Role,
				Specialty: a.Role,
				Order:     i,
			})
		}
		cfg.Team.Experts = experts
	}

	return cfg
}

// runScheduler 根据模式选择调度器并执行
func runScheduler(
	ctx context.Context,
	mode string,
	pool *agent.Pool,
	b *bus.CommunicationBus,
	plan *scheduler.ExecutionPlan,
	skipCh <-chan struct{},
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
		s.SetSkipChannel(skipCh)
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

// buildExecutionPlan 将 team 配置转为执行计划
func buildExecutionPlan(cfg *config.TeamConfig, prompt string) *scheduler.ExecutionPlan {
	plan := &scheduler.ExecutionPlan{}

	for i, spec := range cfg.Team.Agents {
		task := scheduler.Task{
			ID: fmt.Sprintf("task-%s", spec.ID),
			Prompt: func() string {
				if i == 0 {
					return prompt
				}
				return fmt.Sprintf("[Inherited from previous stage]\nContinue refining: %s", prompt)
			}(),
			AssignedTo: spec.ID,
			Timeout:    600,
		}

		// 对于继承/串行模式，建立线性依赖链
		if cfg.Team.Mode == "inheritance" || cfg.Team.Mode == "serial" {
			if i > 0 {
				task.Dependencies = []string{fmt.Sprintf("task-%s", cfg.Team.Agents[i-1].ID)}
			}
		}

		plan.Tasks = append(plan.Tasks, task)
	}

	// 互补模式：专家链配置
	if len(cfg.Team.Experts) > 0 {
		for i, e := range cfg.Team.Experts {
			plan.Experts = append(plan.Experts, &scheduler.ExpertTask{
				ExpertID:  e.AgentID,
				Role:      e.Role,
				Specialty: e.Specialty,
				Skills:    e.Skills,
				Designs:   e.Designs,
				Order:     i,
				Prompt:    prompt,
			})
		}
	}

	// 循环模式配置
	if cfg.Team.Cycle != nil {
		plan.Cycle = &scheduler.CycleConfig{
			GeneratorID:    cfg.Team.Cycle.GeneratorID,
			ReviewerID:     cfg.Team.Cycle.ReviewerID,
			MaxIterations:  cfg.Team.Cycle.MaxIterations,
			ScoreThreshold: cfg.Team.Cycle.ScoreThreshold,
			Topic:          prompt,
		}
	}

	return plan
}

// ---- output helpers ----

func emitEvent(event string, data any) {
	var rawData json.RawMessage
	if s, ok := data.(json.RawMessage); ok {
		rawData = s
	} else {
		b, err := json.Marshal(data)
		if err != nil {
			return
		}
		rawData = b
	}
	evt := cliEvent{Event: event, Data: rawData}
	line, _ := json.Marshal(evt)
	fmt.Fprintln(os.Stdout, string(line))
}

func emitError(msg string) {
	emitEvent("error", map[string]string{"message": msg})
}

// 确保未使用的 import 不会报错（profiler 在 auto_assign 时使用，
// 当前 odteam 不启用 auto_assign，但保留 import 以备后续扩展）
var _ = profiler.RoleByName
