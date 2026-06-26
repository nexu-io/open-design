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
	pool           GeneticPool
	bus            *bus.CommunicationBus
	populationSize int
	generations    int
}

// GeneticPool 遗传调度器所需的 pool 接口（便于测试注入 fake pool）
type GeneticPool interface {
	AssignTask(agentID string, task *agent.TaskAssignment) error
	WaitResult(agentID string, timeout time.Duration) (*agent.TaskResult, error)
	ListRuntimes() []protocol.AgentRuntime
}

func NewGeneticScheduler(pool GeneticPool, b *bus.CommunicationBus) *GeneticScheduler {
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
	timeout := time.Duration(plan.Tasks[0].Timeout) * time.Second

	// 收集所有可用 agent：优先用 plan.Tasks 里显式分配的，再补充池里空闲的
	// 这样变体可以分散到多个 agent 真正并行执行，而不是全塞给同一个 agent
	// （ManagedAgent.MaxParallel=1，单 agent 的变体会串行排队导致超时）
	agentPool := s.collectAgents(plan)
	if len(agentPool) == 0 {
		return nil, fmt.Errorf("no agents available for genetic execution")
	}

	var allResults []*TaskResult

	// 每一代生成 populationSize 个变体
	// 多 agent：并行分发，每个 agent 最多执行 1 个变体，WaitResult 计时精确
	// 单 agent：串行执行，避免变体在 taskCh 排队时 WaitResult 已开始计时导致超时
	serial := len(agentPool) == 1
	for gen := 0; gen < s.generations; gen++ {
		var (
			mu         sync.Mutex
			genResults []*TaskResult
			wg         sync.WaitGroup
		)

		for i := 0; i < s.populationSize; i++ {
			idx, generation := i, gen
			prompt := fmt.Sprintf("[Generation %d, Variant %d]\n%s", generation+1, idx+1, basePrompt)
			agentID := agentPool[idx%len(agentPool)]

			if serial {
				// 单 agent：串行执行，WaitResult 不会因排队而被计时
				result := s.executeVariant(ctx, agentID, prompt, timeout)
				genResults = append(genResults, result)
			} else {
				wg.Add(1)
				go func(agent string, p string) {
					defer wg.Done()
					result := s.executeVariant(ctx, agent, p, timeout)
					mu.Lock()
					genResults = append(genResults, result)
					mu.Unlock()
				}(agentID, prompt)
			}
		}
		if !serial {
			wg.Wait()
		}

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

// collectAgents 收集可用于执行变体的 agent 列表
// 优先用 plan.Tasks 中显式 AssignedTo 的 agent（去重），再补充池中空闲 agent
// 确保变体能分散到多个 agent 并行执行
func (s *GeneticScheduler) collectAgents(plan *ExecutionPlan) []string {
	seen := make(map[string]bool)
	var agents []string

	// 1. 收集 plan 里显式分配的 agent
	for _, t := range plan.Tasks {
		if t.AssignedTo != "" && !seen[t.AssignedTo] {
			seen[t.AssignedTo] = true
			agents = append(agents, t.AssignedTo)
		}
	}

	// 2. 补充池中空闲 agent，扩大并行度
	for _, rt := range s.pool.ListRuntimes() {
		if !seen[rt.ID] {
			seen[rt.ID] = true
			agents = append(agents, rt.ID)
		}
	}

	return agents
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
