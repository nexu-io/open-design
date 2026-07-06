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
	var req teamRequest
	dec := json.NewDecoder(os.Stdin)
	if err := dec.Decode(&req); err != nil {
		emitError(fmt.Sprintf("failed to read stdin: %v", err))
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

	// 发送 team_start 事件
	emitEvent("team_start", map[string]any{
		"mode":     cfg.Team.Mode,
		"agents":   len(cfg.Team.Agents),
		"teamName": cfg.Team.Name,
	})

	// 创建通信总线和 Agent 池
	b := bus.NewBus()
	pool := agent.NewPool(cfg, b, workDir)
	defer pool.Shutdown()

	// 设置运行上下文（projectId / conversationId 传给 daemon /api/chat）
	pool.SetRunContext(req.ProjectId, req.ConversationId)

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

	results, execErr := runScheduler(ctx, cfg.Team.Mode, pool, b, plan)

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

// buildTeamConfig 从 teamRequest 构建 TeamConfig
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

	return cfg
}

// runScheduler 根据模式选择调度器并执行
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
