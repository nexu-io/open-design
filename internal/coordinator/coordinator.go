// Package coordinator 团队协调器：任务拆分、Agent分配、结果聚合、生命周期管理
package coordinator

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/config"
	ctxmgr "github.com/nexu-io/open-design/packages/multi-agent-team/internal/context"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/scheduler"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// TeamStatus 团队执行状态
type TeamStatus string

const (
	StatusIdle      TeamStatus = "idle"
	StatusRunning   TeamStatus = "running"
	StatusCompleted TeamStatus = "completed"
	StatusFailed    TeamStatus = "failed"
)

// LifecycleHook 生命周期钩子函数
type LifecycleHook struct {
	OnTeamStart    func(teamName string, taskDesc string)
	OnTaskStart    func(taskID string, agentID string)
	OnTaskComplete func(taskID string, agentID string, result *scheduler.TaskResult)
	OnTaskError    func(taskID string, agentID string, err error)
	OnTeamComplete func(teamName string, result *TeamResult)
}

// TeamState 团队运行时状态（可查询）
type TeamState struct {
	mu         sync.RWMutex
	Status     TeamStatus
	TaskStates map[string]*TaskState
	StartedAt  time.Time
	EndedAt    time.Time
}

// TaskState 单个任务的运行时状态
type TaskState struct {
	ID       string
	AgentID  string
	Status   TeamStatus
	Error    string
	Started  time.Time
	Finished time.Time
}

// Coordinator 团队协调器
type Coordinator struct {
	cfg        *config.TeamConfig
	pool       *agent.Pool
	bus        *bus.CommunicationBus
	store      protocol.ArtifactStore
	ctxMgr     *ctxmgr.Manager
	hooks      *LifecycleHook
	state      *TeamState
	retryCount map[string]int // taskID → retry count
}

// TeamResult 团队执行结果
type TeamResult struct {
	TeamID    string
	Mode      protocol.TeamMode
	Success   bool
	Results   []*scheduler.TaskResult
	Duration  time.Duration
	Artifacts []*protocol.Artifact
	State     *TeamState
}

// New 创建团队协调器
func New(cfg *config.TeamConfig, pool *agent.Pool, b *bus.CommunicationBus, store protocol.ArtifactStore) *Coordinator {
	return &Coordinator{
		cfg:        cfg,
		pool:       pool,
		bus:        b,
		store:      store,
		ctxMgr:     ctxmgr.NewManager(),
		hooks:      &LifecycleHook{},
		retryCount: make(map[string]int),
	}
}

// OnHook 注册生命周期钩子
func (c *Coordinator) OnHook(hooks *LifecycleHook) {
	if hooks.OnTeamStart != nil {
		c.hooks.OnTeamStart = hooks.OnTeamStart
	}
	if hooks.OnTaskStart != nil {
		c.hooks.OnTaskStart = hooks.OnTaskStart
	}
	if hooks.OnTaskComplete != nil {
		c.hooks.OnTaskComplete = hooks.OnTaskComplete
	}
	if hooks.OnTaskError != nil {
		c.hooks.OnTaskError = hooks.OnTaskError
	}
	if hooks.OnTeamComplete != nil {
		c.hooks.OnTeamComplete = hooks.OnTeamComplete
	}
}

// GetState 获取团队运行时状态（线程安全）
func (c *Coordinator) GetState() *TeamState {
	c.state.mu.RLock()
	defer c.state.mu.RUnlock()
	return c.state
}

// Run 执行团队任务
func (c *Coordinator) Run(ctx context.Context, taskDescription string) (*TeamResult, error) {
	startTime := time.Now()

	// 初始化状态
	c.state = &TeamState{
		Status:     StatusRunning,
		TaskStates: make(map[string]*TaskState),
		StartedAt:  startTime,
	}

	// 触发团队启动钩子
	if c.hooks.OnTeamStart != nil {
		c.hooks.OnTeamStart(c.cfg.Team.Name, taskDescription)
	}
	c.bus.Publish(&protocol.Message{
		Type:    protocol.MsgContextSync,
		Payload: map[string]any{"event": "team_started", "team": c.cfg.Team.Name},
	})

	log.Printf("[coordinator] 启动团队 '%s'，模式: %s", c.cfg.Team.Name, c.cfg.Team.Mode)

	// 1. 任务拆分
	tasks, err := c.splitTasks(taskDescription)
	if err != nil {
		c.state.mu.Lock()
		c.state.Status = StatusFailed
		c.state.EndedAt = time.Now()
		c.state.mu.Unlock()
		return nil, fmt.Errorf("task splitting: %w", err)
	}
	log.Printf("[coordinator] 任务拆分为 %d 个子任务", len(tasks))

	// 初始化任务状态
	for _, t := range tasks {
		c.state.mu.Lock()
		c.state.TaskStates[t.ID] = &TaskState{
			ID:      t.ID,
			AgentID: t.AssignedTo,
			Status:  StatusIdle,
		}
		c.state.mu.Unlock()
	}

	// 2. 构建调度计划
	plan := &scheduler.ExecutionPlan{
		TeamID: c.cfg.Team.Name,
		Tasks:  tasks,
		Mode:   c.cfg.Team.Mode,
	}

	// 3. 创建调度器
	sched, err := scheduler.New(c.cfg.Team.Mode, c.pool, c.bus, c.store)
	if err != nil {
		return nil, fmt.Errorf("create scheduler: %w", err)
	}

	// 4. 注册调度器的事件回调来驱动生命周期钩子
	c.registerSchedulerHooks(sched, plan)

	// 5. 执行调度（带重试）
	var results []*scheduler.TaskResult
	maxRetries := c.cfg.Team.MaxRetries
	if maxRetries <= 0 {
		maxRetries = 0
	}

	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			log.Printf("[coordinator] 重试第 %d 次", attempt)
		}
		results, err = sched.Execute(ctx, plan)
		if err == nil {
			break
		}
		log.Printf("[coordinator] 执行失败: %v", err)
	}

	success := err == nil

	// 6. 聚合工件
	var allArtifacts []*protocol.Artifact
	for _, r := range results {
		allArtifacts = append(allArtifacts, r.Artifacts...)
	}

	duration := time.Since(startTime)

	// 更新状态
	c.state.mu.Lock()
	if success {
		c.state.Status = StatusCompleted
	} else {
		c.state.Status = StatusFailed
	}
	c.state.EndedAt = time.Now()
	c.state.mu.Unlock()

	teamResult := &TeamResult{
		TeamID:    c.cfg.Team.Name,
		Mode:      c.cfg.Team.Mode,
		Success:   success,
		Results:   results,
		Duration:  duration,
		Artifacts: allArtifacts,
		State:     c.state,
	}

	// 触发团队完成钩子
	if c.hooks.OnTeamComplete != nil {
		c.hooks.OnTeamComplete(c.cfg.Team.Name, teamResult)
	}
	c.bus.Publish(&protocol.Message{
		Type: protocol.MsgContextSync,
		Payload: map[string]any{
			"event":    "team_completed",
			"team":     c.cfg.Team.Name,
			"success":  success,
			"duration": duration.String(),
		},
	})

	if success {
		log.Printf("[coordinator] 团队执行完成，耗时 %v，产出 %d 个工件", duration, len(allArtifacts))
	} else {
		log.Printf("[coordinator] 团队执行失败，耗时 %v", duration)
	}

	return teamResult, err
}

// registerSchedulerHooks 为调度器注册生命周期事件
func (c *Coordinator) registerSchedulerHooks(sched scheduler.Scheduler, plan *scheduler.ExecutionPlan) {
	// 这个方法在调度器执行前后被调用，用于驱动 hooks
	// 由于 scheduler.Scheduler 接口没有内置 hook 机制，
	// 这里通过 bus 消息来桥接
	_ = plan
}

// splitTasks 根据团队配置和任务描述拆分任务
func (c *Coordinator) splitTasks(description string) ([]scheduler.Task, error) {
	switch c.cfg.Team.Mode {
	case protocol.ModeSerial:
		return c.splitSerialTasks(description), nil
	case protocol.ModeParallel:
		return c.splitParallelTasks(description), nil
	case protocol.ModeGenetic:
		return c.splitGeneticTasks(description), nil
	case protocol.ModeInheritance:
		return c.splitInheritanceTasks(description), nil
	case protocol.ModeHybrid:
		return c.splitHybridTasks(description), nil
	default:
		return nil, fmt.Errorf("unsupported mode: %s", c.cfg.Team.Mode)
	}
}

// splitSerialTasks 串行任务拆分：基于 pipeline 配置
func (c *Coordinator) splitSerialTasks(description string) []scheduler.Task {
	var tasks []scheduler.Task

	if c.cfg.Pipeline != nil {
		for i, stage := range c.cfg.Pipeline.Stages {
			task := scheduler.Task{
				ID:           fmt.Sprintf("stage-%d-%s", i, stage.Name),
				Prompt:       description,
				AssignedTo:   stage.Agent,
				Dependencies: stage.DependsOn,
				Timeout:      600, // 默认 10 分钟
				Metadata: map[string]string{
					"stage":     stage.Name,
					"input_from": stage.InputFrom,
					"output_as": stage.OutputAs,
				},
			}
			tasks = append(tasks, task)
		}
	}

	// 如果没有配置 pipeline stages，按 Agent 数量均分
	if len(tasks) == 0 {
		for i, agentSpec := range c.cfg.Team.Agents {
			task := scheduler.Task{
				ID:         fmt.Sprintf("task-%d-%s", i, agentSpec.ID),
				Prompt:     description,
				AssignedTo: agentSpec.ID,
				Timeout:    600,
			}
			if i > 0 {
				task.Dependencies = []string{fmt.Sprintf("task-%d-%s", i-1, c.cfg.Team.Agents[i-1].ID)}
			}
			tasks = append(tasks, task)
		}
	}

	return tasks
}

// splitParallelTasks 并行任务拆分：每个 Agent 独立处理同一任务的不同维度
func (c *Coordinator) splitParallelTasks(description string) []scheduler.Task {
	var tasks []scheduler.Task

	for i, agentSpec := range c.cfg.Team.Agents {
		prompt := description
		// 根据 Agent 角色定制 prompt
		if agentSpec.Role != "" {
			prompt = fmt.Sprintf("[%s 角色] %s", agentSpec.Role, description)
		}

		task := scheduler.Task{
			ID:       fmt.Sprintf("task-%d-%s", i, agentSpec.ID),
			Prompt:   prompt,
			Timeout:  600,
			Metadata: map[string]string{"role": agentSpec.Role},
		}
		tasks = append(tasks, task)
	}

	return tasks
}

// splitGeneticTasks 遗传任务拆分：单任务多变体
func (c *Coordinator) splitGeneticTasks(description string) []scheduler.Task {
	return []scheduler.Task{
		{
			ID:       "genetic-root",
			Prompt:   description,
			Timeout:  600,
			Metadata: map[string]string{"type": "genetic_root"},
		},
	}
}

// splitInheritanceTasks 继承任务拆分：基于配置的继承树
func (c *Coordinator) splitInheritanceTasks(description string) []scheduler.Task {
	var tasks []scheduler.Task

	// 如果配置了继承树，按树结构拆分
	if c.cfg.Team.Inheritance.Enabled {
		c.walkInheritanceTree(c.cfg.Team.Inheritance.Tree, description, "", &tasks)
	} else {
		// 默认：按 Agent 顺序构建线性继承链
		for i, agentSpec := range c.cfg.Team.Agents {
			task := scheduler.Task{
				ID:         fmt.Sprintf("inh-%d-%s", i, agentSpec.ID),
				Prompt:     description,
				AssignedTo: agentSpec.ID,
				Timeout:    600,
			}
			if i > 0 {
				task.Dependencies = []string{fmt.Sprintf("inh-%d-%s", i-1, c.cfg.Team.Agents[i-1].ID)}
			}
			tasks = append(tasks, task)
		}
	}

	return tasks
}

// walkInheritanceTree 递归遍历继承树，生成任务
func (c *Coordinator) walkInheritanceTree(node config.InheritanceNode, description, parentID string, tasks *[]scheduler.Task) {
	taskID := fmt.Sprintf("inh-%s", node.AgentID)
	task := scheduler.Task{
		ID:         taskID,
		Prompt:     description,
		AssignedTo: node.AgentID,
		Timeout:    600,
	}
	if parentID != "" {
		task.Dependencies = []string{parentID}
	}
	*tasks = append(*tasks, task)

	for _, child := range node.Children {
		c.walkInheritanceTree(child, description, taskID, tasks)
	}
}

// splitHybridTasks 混合模式拆分：串行管线中每个阶段可并行
func (c *Coordinator) splitHybridTasks(description string) []scheduler.Task {
	var tasks []scheduler.Task

	// 将串行管线阶段作为主干
	for i, stage := range c.cfg.Pipeline.Stages {
		task := scheduler.Task{
			ID:         fmt.Sprintf("stage-%d-%s", i, stage.Name),
			Prompt:     description,
			AssignedTo: stage.Agent,
			Timeout:    600,
			Metadata: map[string]string{
				"stage":     stage.Name,
				"input_from": stage.InputFrom,
				"output_as":  stage.OutputAs,
			},
		}
		if i > 0 {
			task.Dependencies = []string{fmt.Sprintf("stage-%d-%s", i-1, c.cfg.Pipeline.Stages[i-1].Name)}
		}
		tasks = append(tasks, task)
	}

	return tasks
}

// GetStatus 获取团队当前状态
func (c *Coordinator) GetStatus() map[string]*protocol.AgentRuntime {
	runtimes := c.pool.ListRuntimes()
	status := make(map[string]*protocol.AgentRuntime, len(runtimes))
	for i := range runtimes {
		status[runtimes[i].ID] = &runtimes[i]
	}
	return status
}

// Shutdown 关闭协调器
func (c *Coordinator) Shutdown() {
	c.pool.Shutdown()
	c.bus.Shutdown()
}
