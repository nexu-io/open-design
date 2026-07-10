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

// HybridPool 混合调度器所需的最小池接口。
// *agent.Pool 实现了此接口，调用方无需修改。
type HybridPool interface {
	AssignTask(agentID string, task *agent.TaskAssignment) error
	WaitResult(agentID string, timeout time.Duration) (*agent.TaskResult, error)
}

// HybridScheduler 混合调度器：串行主干 + 阶段内并行
// 适用场景：复杂项目（研究阶段并行 → 设计阶段并行 → 开发阶段串行）
type HybridScheduler struct {
	pool HybridPool
	bus  *bus.CommunicationBus
}

func NewHybridScheduler(pool HybridPool, b *bus.CommunicationBus) *HybridScheduler {
	return &HybridScheduler{pool: pool, bus: b}
}

func (s *HybridScheduler) Mode() protocol.TeamMode {
	return protocol.ModeHybrid
}

func (s *HybridScheduler) Execute(ctx context.Context, plan *ExecutionPlan) ([]*TaskResult, error) {
	if len(plan.Tasks) == 0 {
		return nil, fmt.Errorf("no tasks to execute")
	}

	// 按依赖层级分组：无依赖的任务为同一层，同层并行执行
	layers := s.groupByDependencyLayers(plan.Tasks)

	var allResults []*TaskResult
	var prevLayerArtifacts []*protocol.Artifact

	for _, layer := range layers {
		var (
			mu         sync.Mutex
			layerRes   []*TaskResult
			wg         sync.WaitGroup
		)

		for _, task := range layer {
			wg.Add(1)
			go func(t Task) {
				defer wg.Done()
				result := s.executeTask(ctx, t, prevLayerArtifacts)
				mu.Lock()
				layerRes = append(layerRes, result)
				mu.Unlock()
			}(task)
		}
		wg.Wait()

		allResults = append(allResults, layerRes...)

		// 收集本层所有 artifacts 作为下一层的输入
		for _, r := range layerRes {
			prevLayerArtifacts = append(prevLayerArtifacts, r.Artifacts...)
		}
	}

	return allResults, nil
}

// groupByDependencyLayers 按依赖关系将任务分层
// 无依赖的任务为第 0 层，依赖第 0 层的为第 1 层，以此类推
func (s *HybridScheduler) groupByDependencyLayers(tasks []Task) [][]Task {
	taskMap := make(map[string]*Task)
	for i := range tasks {
		taskMap[tasks[i].ID] = &tasks[i]
	}

	// 计算每个任务的层级
	layerMap := make(map[string]int)
	var computeLayer func(t *Task) int
	computeLayer = func(t *Task) int {
		if layer, ok := layerMap[t.ID]; ok {
			return layer
		}
		maxDepLayer := -1
		for _, dep := range t.Dependencies {
			if depTask, ok := taskMap[dep]; ok {
				l := computeLayer(depTask)
				if l > maxDepLayer {
					maxDepLayer = l
				}
			}
		}
		layerMap[t.ID] = maxDepLayer + 1
		return layerMap[t.ID]
	}

	maxLayer := 0
	for i := range tasks {
		l := computeLayer(&tasks[i])
		if l > maxLayer {
			maxLayer = l
		}
	}

	layers := make([][]Task, maxLayer+1)
	for i := range tasks {
		l := layerMap[tasks[i].ID]
		layers[l] = append(layers[l], tasks[i])
	}

	return layers
}

func (s *HybridScheduler) executeTask(ctx context.Context, task Task, prevArtifacts []*protocol.Artifact) *TaskResult {
	timeout := time.Duration(task.Timeout) * time.Second
	if timeout == 0 {
		timeout = 10 * time.Minute
	}

	assignment := &agent.TaskAssignment{
		TaskID:  task.ID,
		Prompt:  task.Prompt,
		Timeout: timeout,
	}

	// 将前一层的 artifacts 作为继承上下文传递
	if len(prevArtifacts) > 0 {
		assignment.Context = &agent.ContextSnapshot{
			Artifacts: prevArtifacts,
		}
	}

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
