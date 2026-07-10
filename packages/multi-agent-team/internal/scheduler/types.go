// Package scheduler 多 Agent 任务调度器
// 支持并行、串行、遗传、继承、混合五种调度模式
package scheduler

import (
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// Task 调度任务定义
type Task struct {
	ID           string                 `json:"id"`
	Prompt       string                 `json:"prompt"`
	AssignedTo   string                 `json:"assigned_to,omitempty"`
	Dependencies []string               `json:"dependencies,omitempty"`
	Timeout      int                    `json:"timeout"` // 秒
	Context      *agent.ContextSnapshot `json:"-"`
}

// TaskResult 任务执行结果
type TaskResult struct {
	TaskID    string               `json:"task_id"`
	AgentID   string               `json:"agent_id"`
	Success   bool                 `json:"success"`
	Skipped   bool                 `json:"skipped,omitempty"`
	Artifacts []*protocol.Artifact `json:"artifacts,omitempty"`
	Error     string               `json:"error,omitempty"`
	Metrics   agent.TaskMetrics    `json:"metrics"`
}

// ExecutionPlan 执行计划
type ExecutionPlan struct {
	Tasks   []Task                    `json:"tasks"`
	Experts []*ExpertTask             `json:"experts,omitempty"` // 互补模式：专家链
	Cycle   *CycleConfig              `json:"cycle,omitempty"`   // 循环模式：循环配置
}

// ExpertTask 互补模式中的专家任务
type ExpertTask struct {
	ExpertID   string                 `json:"expert_id"`
	Role       string                 `json:"role"`
	Specialty  string                 `json:"specialty"`
	Skills     []string               `json:"skills,omitempty"`
	Designs    []string               `json:"designs,omitempty"`
	Order      int                    `json:"order"`
	Prompt     string                 `json:"prompt"`
	Context    *agent.ContextSnapshot `json:"-"`
}

// CycleConfig 循环模式的配置
type CycleConfig struct {
	GeneratorID    string  `json:"generator_id"`
	ReviewerID     string  `json:"reviewer_id"`
	MaxIterations  int     `json:"max_iterations"`
	ScoreThreshold float64 `json:"score_threshold"`
	Topic          string  `json:"topic"` // 任务主题
}
