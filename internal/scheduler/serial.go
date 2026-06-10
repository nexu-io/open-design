package scheduler

import (
	"context"
	"fmt"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// SerialScheduler 串行管线调度器：按阶段顺序执行，上一阶段输出作为下一阶段输入
type SerialScheduler struct {
	pool *agent.Pool
	bus  *bus.CommunicationBus
}

// NewSerialScheduler 创建串行调度器
func NewSerialScheduler(pool *agent.Pool, b *bus.CommunicationBus) *SerialScheduler {
	return &SerialScheduler{pool: pool, bus: b}
}

func (s *SerialScheduler) Mode() protocol.TeamMode {
	return protocol.ModeSerial
}

// Execute 串行执行：按顺序执行每个任务，前一个任务的结果传递给下一个
func (s *SerialScheduler) Execute(ctx context.Context, plan *ExecutionPlan) ([]*TaskResult, error) {
	if len(plan.Tasks) == 0 {
		return nil, fmt.Errorf("no tasks to execute")
	}

	// 拓扑排序（确保依赖关系正确）
	orderedTasks, err := s.topoSort(plan.Tasks)
	if err != nil {
		return nil, fmt.Errorf("topological sort: %w", err)
	}

	var results []*TaskResult
	accumulatedContext := &agent.ContextSnapshot{
		Memory: make(map[string]any),
	}

	for _, task := range orderedTasks {
		select {
		case <-ctx.Done():
			return results, ctx.Err()
		default:
		}

		// 将累积上下文注入任务
		task.Context = accumulatedContext

		// 选择 Agent
		agentID := task.AssignedTo
		if agentID == "" {
			agentID = s.pickAgent(task)
		}

		// 构建任务分配
		assignment := &agent.TaskAssignment{
			TaskID:    task.ID,
			Prompt:    task.Prompt,
			Context:   task.Context,
			Timeout:   time.Duration(task.Timeout) * time.Second,
		}
		if task.Timeout == 0 {
			assignment.Timeout = 10 * time.Minute
		}

		// 发布分配事件
		s.bus.Publish(&protocol.Message{
			Type:      protocol.MsgTaskAssign,
			FromAgent: "scheduler",
			ToAgent:   agentID,
			Payload:   assignment,
			Metadata:  map[string]string{"task_id": task.ID},
		})

		// 分配并等待
		if err := s.pool.AssignTask(agentID, assignment); err != nil {
			taskResult := &TaskResult{
				TaskID:  task.ID,
				AgentID: agentID,
				Success: false,
				Error:   err.Error(),
			}
			results = append(results, taskResult)
			return results, fmt.Errorf("assign task %s: %w", task.ID, err)
		}

		result, err := s.pool.WaitResult(agentID, assignment.Timeout)
		if err != nil {
			taskResult := &TaskResult{
				TaskID:  task.ID,
				AgentID: agentID,
				Success: false,
				Error:   err.Error(),
			}
			results = append(results, taskResult)
			return results, fmt.Errorf("wait result for task %s: %w", task.ID, err)
		}

		taskResult := &TaskResult{
			TaskID:    result.TaskID,
			AgentID:   agentID,
			Success:   result.Success,
			Artifacts: result.Artifacts,
			Error:     result.Error,
			Metrics:   result.Metrics,
		}
		results = append(results, taskResult)

		// 发布完成事件
		s.bus.Publish(&protocol.Message{
			Type:      protocol.MsgTaskComplete,
			FromAgent: agentID,
			Payload:   result,
			Metadata:  map[string]string{"task_id": task.ID},
		})

		if !result.Success {
			return results, fmt.Errorf("task %s failed: %s", task.ID, result.Error)
		}

		// 将当前任务结果累积到上下文
		s.accumulateContext(accumulatedContext, task, taskResult)
	}

	return results, nil
}

// accumulateContext 将任务结果累积到共享上下文
func (s *SerialScheduler) accumulateContext(ctx *agent.ContextSnapshot, task Task, result *TaskResult) {
	// 累积工件 ID
	for _, a := range result.Artifacts {
		ctx.ArtifactIDs = append(ctx.ArtifactIDs, a.ID)
	}

	// 累积记忆
	if ctx.Memory == nil {
		ctx.Memory = make(map[string]any)
	}
	if ctx.Memory["pipeline_results"] == nil {
		ctx.Memory["pipeline_results"] = make(map[string]*TaskResult)
	}
	pipeline := ctx.Memory["pipeline_results"].(map[string]*TaskResult)
	pipeline[task.ID] = result

	// 记录当前执行的 Agent 信息
	ctx.AgentID = result.AgentID
	ctx.ParentTask = task.ID
}

// pickAgent 根据任务选择 Agent
func (s *SerialScheduler) pickAgent(task Task) string {
	runtimes := s.pool.ListRuntimes()
	for _, rt := range runtimes {
		if rt.Status == protocol.AgentIdle {
			return rt.ID
		}
	}
	if len(runtimes) > 0 {
		return runtimes[0].ID
	}
	return ""
}

// topoSort 拓扑排序
func (s *SerialScheduler) topoSort(tasks []Task) ([]Task, error) {
	taskMap := make(map[string]*Task)
	inDegree := make(map[string]int)
	for i := range tasks {
		taskMap[tasks[i].ID] = &tasks[i]
		inDegree[tasks[i].ID] = len(tasks[i].Dependencies)
	}

	var queue []string
	for id, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, id)
		}
	}

	var sorted []Task
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		sorted = append(sorted, *taskMap[id])

		for _, other := range tasks {
			for _, dep := range other.Dependencies {
				if dep == id {
					inDegree[other.ID]--
					if inDegree[other.ID] == 0 {
						queue = append(queue, other.ID)
					}
				}
			}
		}
	}

	if len(sorted) != len(tasks) {
		return nil, fmt.Errorf("cyclic dependency detected in task graph")
	}

	return sorted, nil
}
