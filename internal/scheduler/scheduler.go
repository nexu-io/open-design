// Package scheduler 调度引擎：统一接口 + 工厂方法
package scheduler

import (
	"context"
	"fmt"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// Task 拆分后的原子任务
type Task struct {
	ID           string
	Prompt       string
	AssignedTo   string           // 指定的 Agent ID（可空）
	Dependencies []string         // 依赖的其他 Task ID
	Context      *agent.ContextSnapshot
	Timeout      int              // 超时秒数
	Metadata     map[string]string
}

// TaskResult 单个任务的执行结果
type TaskResult struct {
	TaskID     string
	AgentID    string
	Success    bool
	Artifacts  []*protocol.Artifact
	Error      string
	Metrics    agent.TaskMetrics
}

// ExecutionPlan 调度计划
type ExecutionPlan struct {
	TeamID string
	Tasks  []Task
	Mode   protocol.TeamMode
}

// Scheduler 调度器接口
type Scheduler interface {
	// Execute 执行调度计划，返回所有任务结果
	Execute(ctx context.Context, plan *ExecutionPlan) ([]*TaskResult, error)
	// Mode 返回调度器对应的团队模式
	Mode() protocol.TeamMode
}

// New 根据团队模式创建调度器
func New(mode protocol.TeamMode, pool *agent.Pool, b *bus.CommunicationBus, store protocol.ArtifactStore) (Scheduler, error) {
	switch mode {
	case protocol.ModeParallel:
		return NewParallelScheduler(pool, b), nil
	case protocol.ModeSerial:
		return NewSerialScheduler(pool, b), nil
	case protocol.ModeGenetic:
		return NewGeneticScheduler(pool, b, store), nil
	case protocol.ModeInheritance:
		return NewInheritanceScheduler(pool, b), nil
	case protocol.ModeHybrid:
		// 混合模式：组合并行+串行，由 coordinator 拆分后调度
		return NewParallelScheduler(pool, b), nil
	default:
		return nil, fmt.Errorf("unsupported team mode: %s", mode)
	}
}
