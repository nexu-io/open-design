package scheduler

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// GeneticScheduler 遗传调度器：多变体并行生成 + 适应度评估 + 选择/交叉/变异
// 适用场景：设计探索（多方案并行生成 → 评分 → 最优解）
type GeneticScheduler struct {
	pool           *agent.Pool
	bus            *bus.CommunicationBus
	populationSize int
	generations    int
}

func NewGeneticScheduler(pool *agent.Pool, b *bus.CommunicationBus) *GeneticScheduler {
	return &GeneticScheduler{
		pool:           pool,
		bus:            b,
		populationSize: 3,
		generations:    2,
	}
}

func (s *GeneticScheduler) Mode() protocol.TeamMode {
	return protocol.ModeGenetic
}

// SetParams 调整遗传算法参数
func (s *GeneticScheduler) SetParams(populationSize, generations int) {
	if populationSize > 0 {
		s.populationSize = populationSize
	}
	if generations > 0 {
		s.generations = generations
	}
}

func (s *GeneticScheduler) Execute(ctx context.Context, plan *ExecutionPlan) ([]*TaskResult, error) {
	if len(plan.Tasks) == 0 {
		return nil, fmt.Errorf("no tasks to execute")
	}

	basePrompt := plan.Tasks[0].Prompt
	assignedTo := plan.Tasks[0].AssignedTo
	if assignedTo == "" {
		runtimes := s.pool.ListRuntimes()
		if len(runtimes) == 0 {
			return nil, fmt.Errorf("no agents available")
		}
		assignedTo = runtimes[0].ID
	}

	var allResults []*TaskResult

	// 每一代生成 populationSize 个变体并并行执行
	for gen := 0; gen < s.generations; gen++ {
		var (
			mu       sync.Mutex
			genResults []*TaskResult
			wg       sync.WaitGroup
		)

		for i := 0; i < s.populationSize; i++ {
			wg.Add(1)
			go func(idx, generation int) {
				defer wg.Done()
				prompt := fmt.Sprintf("[Generation %d, Variant %d]\n%s", generation+1, idx+1, basePrompt)
				result := s.executeVariant(ctx, assignedTo, prompt, time.Duration(plan.Tasks[0].Timeout)*time.Second)
				mu.Lock()
				genResults = append(genResults, result)
				mu.Unlock()
			}(i, gen)
		}
		wg.Wait()

		allResults = append(allResults, genResults...)

		// 选择最优结果（根据 Success 和 Artifacts 数量排序）
		sort.Slice(genResults, func(i, j int) bool {
			if genResults[i].Success != genResults[j].Success {
				return genResults[i].Success
			}
			return len(genResults[i].Artifacts) > len(genResults[j].Artifacts)
		})

		// 如果不是最后一代，将最优结果作为下一代的基础
		if gen < s.generations-1 && len(genResults) > 0 && genResults[0].Success {
			best := genResults[0]
			if len(best.Artifacts) > 0 {
				basePrompt = fmt.Sprintf("Improve upon the previous best design (artifact: %s).\n%s", best.Artifacts[0].Name, basePrompt)
			}
		}
	}

	return allResults, nil
}

func (s *GeneticScheduler) executeVariant(ctx context.Context, agentID, prompt string, timeout time.Duration) *TaskResult {
	if timeout == 0 {
		timeout = 10 * time.Minute
	}

	assignment := &agent.TaskAssignment{
		TaskID:  fmt.Sprintf("genetic-%d", time.Now().UnixNano()),
		Prompt:  prompt,
		Timeout: timeout,
	}

	if err := s.pool.AssignTask(agentID, assignment); err != nil {
		return &TaskResult{TaskID: assignment.TaskID, AgentID: agentID, Success: false, Error: err.Error()}
	}

	result, err := s.pool.WaitResult(agentID, timeout)
	if err != nil {
		return &TaskResult{TaskID: assignment.TaskID, AgentID: agentID, Success: false, Error: err.Error()}
	}

	return &TaskResult{
		TaskID:    result.TaskID,
		AgentID:   agentID,
		Success:   result.Success,
		Artifacts: result.Artifacts,
		Error:     result.Error,
		Metrics:   result.Metrics,
	}
}
