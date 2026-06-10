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

// ParallelScheduler 并行调度器：所有无依赖任务同时执行
type ParallelScheduler struct {
	pool *agent.Pool
	bus  *bus.CommunicationBus
}

// NewParallelScheduler 创建并行调度器
func NewParallelScheduler(pool *agent.Pool, b *bus.CommunicationBus) *ParallelScheduler {
	return &ParallelScheduler{pool: pool, bus: b}
}

func (s *ParallelScheduler) Mode() protocol.TeamMode {
	return protocol.ModeParallel
}

// Execute 并行执行：按拓扑层级分批，同层任务并行
func (s *ParallelScheduler) Execute(ctx context.Context, plan *ExecutionPlan) ([]*TaskResult, error) {
	// 构建依赖图，计算拓扑层级
	layers := s.topologicalLayers(plan.Tasks)
	if len(layers) == 0 {
		return nil, fmt.Errorf("no tasks to execute")
	}

	// 检查结果表（用于依赖传递）
	resultsMu := sync.Mutex{}
	allResults := make(map[string]*TaskResult)

	var finalResults []*TaskResult

	for _, layer := range layers {
		// 检查上下文取消
		select {
		case <-ctx.Done():
			return finalResults, ctx.Err()
		default:
		}

		// 并行执行当前层所有任务
		layerResults := s.executeLayer(ctx, layer, allResults)
		finalResults = append(finalResults, layerResults...)

		// 收集结果到全局表
		resultsMu.Lock()
		for _, r := range layerResults {
			allResults[r.TaskID] = r
		}
		resultsMu.Unlock()

		// 检查是否有失败任务需要中止
		for _, r := range layerResults {
			if !r.Success {
				return finalResults, fmt.Errorf("task %s failed: %s", r.TaskID, r.Error)
			}
		}
	}

	return finalResults, nil
}

// executeLayer 并行执行同一层的任务
func (s *ParallelScheduler) executeLayer(ctx context.Context, tasks []Task, prevResults map[string]*TaskResult) []*TaskResult {
	var wg sync.WaitGroup
	results := make([]*TaskResult, len(tasks))

	for i, task := range tasks {
		wg.Add(1)
		go func(idx int, t Task) {
			defer wg.Done()

			// 合并依赖结果到上下文
			if t.Context == nil {
				t.Context = &agent.ContextSnapshot{
					Memory: make(map[string]any),
				}
			}
			s.mergeDependencies(t, prevResults)

			// 分配任务
			assignment := &agent.TaskAssignment{
				TaskID:    t.ID,
				Prompt:    t.Prompt,
				Context:   t.Context,
				Timeout:   time.Duration(t.Timeout) * time.Second,
			}

			timeout := time.Duration(t.Timeout) * time.Second
			if t.Timeout == 0 {
				timeout = 10 * time.Minute
			}

			agentID := t.AssignedTo
			if agentID == "" {
				agentID = s.pickAgent(t)
			}

			if err := s.pool.AssignTask(agentID, assignment); err != nil {
				results[idx] = &TaskResult{
					TaskID:  t.ID,
					AgentID: agentID,
					Success: false,
					Error:   err.Error(),
				}
				return
			}

			// 发布任务分配事件
			s.bus.Publish(&protocol.Message{
				Type:      protocol.MsgTaskAssign,
				FromAgent: "scheduler",
				ToAgent:   agentID,
				Payload:   assignment,
				Metadata:  map[string]string{"task_id": t.ID},
			})

			// 等待结果
			result, err := s.pool.WaitResult(agentID, timeout)
			if err != nil {
				results[idx] = &TaskResult{
					TaskID:  t.ID,
					AgentID: agentID,
					Success: false,
					Error:   err.Error(),
				}
				return
			}

			// 发布完成事件
			s.bus.Publish(&protocol.Message{
				Type:      protocol.MsgTaskComplete,
				FromAgent: agentID,
				Payload:   result,
				Metadata:  map[string]string{"task_id": t.ID},
			})

			results[idx] = &TaskResult{
				TaskID:    result.TaskID,
				AgentID:   agentID,
				Success:   result.Success,
				Artifacts: result.Artifacts,
				Error:     result.Error,
				Metrics:   result.Metrics,
			}
		}(i, task)
	}

	wg.Wait()
	return results
}

// pickAgent 根据任务需求选择合适的 Agent
func (s *ParallelScheduler) pickAgent(task Task) string {
	runtimes := s.pool.ListRuntimes()
	for _, rt := range runtimes {
		if rt.Status == protocol.AgentIdle {
			return rt.ID
		}
	}
	// 回退到第一个 Agent
	if len(runtimes) > 0 {
		return runtimes[0].ID
	}
	return ""
}

// mergeDependencies 将依赖任务结果合并到当前任务上下文
func (s *ParallelScheduler) mergeDependencies(task Task, prevResults map[string]*TaskResult) {
	if task.Context.Memory == nil {
		task.Context.Memory = make(map[string]any)
	}
	for _, depID := range task.Dependencies {
		if r, ok := prevResults[depID]; ok && r.Success {
			// 传递工件 ID
			for _, a := range r.Artifacts {
				task.Context.ArtifactIDs = append(task.Context.ArtifactIDs, a.ID)
			}
			// 传递 Agent ID 信息
			if task.Context.Memory["dep_results"] == nil {
				task.Context.Memory["dep_results"] = make(map[string][]string)
			}
			depMap := task.Context.Memory["dep_results"].(map[string][]string)
			var artIDs []string
			for _, a := range r.Artifacts {
				artIDs = append(artIDs, a.ID)
			}
			depMap[depID] = artIDs
		}
	}
}

// topologicalLayers 将任务按拓扑层级分组（用于并行调度）
func (s *ParallelScheduler) topologicalLayers(tasks []Task) [][]Task {
	taskMap := make(map[string]*Task)
	inDegree := make(map[string]int)
	for i := range tasks {
		taskMap[tasks[i].ID] = &tasks[i]
		inDegree[tasks[i].ID] = len(tasks[i].Dependencies)
	}

	// 用 map 按层级分组
	levels := make(map[int][]string)
	var queue []string

	// 找入度为 0 的节点
	for id, deg := range inDegree {
		if deg == 0 {
			levels[0] = append(levels[0], id)
			queue = append(queue, id)
		}
	}

	level := 0
	for len(queue) > 0 {
		var nextQueue []string
		for _, id := range queue {
			// 找所有依赖当前任务的下游节点
			for _, other := range tasks {
				for _, dep := range other.Dependencies {
					if dep == id {
						inDegree[other.ID]--
						if inDegree[other.ID] == 0 {
							nextLevel := level + 1
							levels[nextLevel] = append(levels[nextLevel], other.ID)
							nextQueue = append(nextQueue, other.ID)
						}
					}
				}
			}
		}
		queue = nextQueue
		level++
	}

	// 转换为 Task 切片
	var result [][]Task
	for i := 0; i <= level; i++ {
		if ids, ok := levels[i]; ok && len(ids) > 0 {
			var layer []Task
			for _, id := range ids {
				layer = append(layer, *taskMap[id])
			}
			result = append(result, layer)
		}
	}

	return result
}
