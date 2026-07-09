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
// SkipCh: 当用户在前端点击"跳过/继续"时，通过此 channel 通知调度器提前终止
// 剩余未完成的 Agent。已完成的 Agent 结果会作为共享意图呈现返回，避免用户
// 阻塞等待全部 Agent 完成。
type ParallelScheduler struct {
	pool   *agent.Pool
	bus    *bus.CommunicationBus
	skipCh <-chan struct{}
}

func NewParallelScheduler(pool *agent.Pool, b *bus.CommunicationBus) *ParallelScheduler {
	return &ParallelScheduler{pool: pool, bus: b}
}

// SetSkipChannel 设置跳过信号通道。当用户在前端点击跳过/继续时，
// daemon → odteam stdin → main goroutine → 此通道 → 调度器取消剩余任务。
func (s *ParallelScheduler) SetSkipChannel(ch <-chan struct{}) {
	s.skipCh = ch
}

func (s *ParallelScheduler) Mode() protocol.TeamMode {
	return protocol.ModeParallel
}

func (s *ParallelScheduler) Execute(ctx context.Context, plan *ExecutionPlan) ([]*TaskResult, error) {
	if len(plan.Tasks) == 0 {
		return nil, fmt.Errorf("no tasks to execute")
	}

	// 创建可取消的上下文：当 skip 信号到来时取消所有未完成的 goroutine
	execCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	var (
		mu      sync.Mutex
		results []*TaskResult
		wg      sync.WaitGroup
	)

	// 监听 skip 信号：一旦收到就取消所有正在执行的 agent
	if s.skipCh != nil {
		go func() {
			select {
			case <-s.skipCh:
				cancel()
			case <-execCtx.Done():
			}
		}()
	}

	for _, task := range plan.Tasks {
		wg.Add(1)
		go func(t Task) {
			defer wg.Done()
			// 启动前检查是否已被取消
			if execCtx.Err() != nil {
				mu.Lock()
				results = append(results, &TaskResult{
					TaskID:  t.ID,
					AgentID: t.AssignedTo,
					Success: false,
					Error:   "skipped: team proceeded before agent started",
				})
				mu.Unlock()
				return
			}
			result := s.executeTask(execCtx, t)
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
