package scheduler

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// ParallelScheduler 并行调度器：同一层级的 Agent 并行执行不同维度
// 适用场景：多视角设计（视觉 + 文案 + 前端同时工作）
type ParallelScheduler struct {
	pool *agent.Pool
	bus  *bus.CommunicationBus
}

func NewParallelScheduler(pool *agent.Pool, b *bus.CommunicationBus) *ParallelScheduler {
	return &ParallelScheduler{pool: pool, bus: b}
}

func (s *ParallelScheduler) Mode() protocol.TeamMode {
	return protocol.ModeParallel
}

func (s *ParallelScheduler) Execute(ctx context.Context, plan *ExecutionPlan) ([]*TaskResult, error) {
	if len(plan.Tasks) == 0 {
		return nil, fmt.Errorf("no tasks to execute")
	}

	var (
		mu      sync.Mutex
		results []*TaskResult
		wg      sync.WaitGroup
	)

	for _, task := range plan.Tasks {
		wg.Add(1)
		go func(t Task) {
			defer wg.Done()
			result := s.executeTask(ctx, t)
			mu.Lock()
			results = append(results, result)
			mu.Unlock()
		}(task)
	}

	wg.Wait()
	return results, nil
}

func (s *ParallelScheduler) executeTask(ctx context.Context, task Task) *TaskResult {
	timeout := time.Duration(task.Timeout) * time.Second
	if timeout == 0 {
		timeout = 10 * time.Minute
	}

	assignment := &agent.TaskAssignment{
		TaskID:  task.ID,
		Prompt:  task.Prompt,
		Timeout: timeout,
	}

	s.bus.Publish(&protocol.Message{
		Type:      protocol.MsgTaskAssign,
		FromAgent: "parallel-scheduler",
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
