package scheduler

import (
	"context"
	"fmt"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// SerialScheduler 串行调度器：按阶段链式执行，前一阶段输出注入下一阶段上下文
// 适用场景：线性工作流（研究 → 架构 → 设计 → 开发）
type SerialScheduler struct {
	pool *agent.Pool
	bus  *bus.CommunicationBus
}

func NewSerialScheduler(pool *agent.Pool, b *bus.CommunicationBus) *SerialScheduler {
	return &SerialScheduler{pool: pool, bus: b}
}

func (s *SerialScheduler) Mode() protocol.TeamMode {
	return protocol.ModeSerial
}

func (s *SerialScheduler) Execute(ctx context.Context, plan *ExecutionPlan) ([]*TaskResult, error) {
	if len(plan.Tasks) == 0 {
		return nil, fmt.Errorf("no tasks to execute")
	}

	var results []*TaskResult

	// 按依赖顺序执行：前一阶段的 artifacts 通过继承上下文传递到下一阶段
	var parentResult *TaskResult
	for _, task := range plan.Tasks {
		result := s.executeTask(ctx, task, parentResult)
		results = append(results, result)
		if !result.Success {
			break
		}
		parentResult = result
	}

	return results, nil
}

func (s *SerialScheduler) executeTask(ctx context.Context, task Task, parentResult *TaskResult) *TaskResult {
	timeout := time.Duration(task.Timeout) * time.Second
	if timeout == 0 {
		timeout = 10 * time.Minute
	}

	assignment := &agent.TaskAssignment{
		TaskID:  task.ID,
		Prompt:  task.Prompt,
		Timeout: timeout,
	}

	// 将前一阶段结果作为继承上下文传递
	if parentResult != nil && len(parentResult.Artifacts) > 0 {
		assignment.Context = &agent.ContextSnapshot{
			ParentTask: parentResult.TaskID,
			AgentID:    parentResult.AgentID,
			Artifacts:  parentResult.Artifacts,
		}
	}

	s.bus.Publish(&protocol.Message{
		Type:      protocol.MsgTaskAssign,
		FromAgent: "serial-scheduler",
		ToAgent:   task.AssignedTo,
		Payload:   assignment,
	})

	if err := s.pool.AssignTask(task.AssignedTo, assignment); err != nil {
		return &TaskResult{TaskID: task.ID, AgentID: task.AssignedTo, Success: false, Error: err.Error()}
	}

	result, err := s.pool.WaitResult(task.AssignedTo, timeout)
	if err != nil {
		return &TaskResult{TaskID: task.ID, AgentID: task.AssignedTo, Success: false, Error: err.Error()}
	}

	return &TaskResult{
		TaskID:    result.TaskID,
		AgentID:   task.AssignedTo,
		Success:   result.Success,
		Artifacts: result.Artifacts,
		Error:     result.Error,
		Metrics:   result.Metrics,
	}
}
