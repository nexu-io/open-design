package scheduler

import (
	"context"
	"fmt"
	"math/rand"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// GeneticScheduler 遗传进化调度器：多代演化，保留最优解
type GeneticScheduler struct {
	pool       *agent.Pool
	bus        *bus.CommunicationBus
	store      protocol.ArtifactStore
	population []Candidate // 当前种群
}

// Candidate 候选解（单个 Agent 的设计变体）
type Candidate struct {
	TaskID     string
	AgentID    string
	Prompt     string // 原始 prompt 变体
	Artifacts  []*protocol.Artifact
	Fitness    float64 // 适应度评分
	Generation int
}

// NewGeneticScheduler 创建遗传调度器
func NewGeneticScheduler(pool *agent.Pool, b *bus.CommunicationBus, store protocol.ArtifactStore) *GeneticScheduler {
	return &GeneticScheduler{
		pool:  pool,
		bus:   b,
		store: store,
	}
}

func (s *GeneticScheduler) Mode() protocol.TeamMode {
	return protocol.ModeGenetic
}

// Execute 执行遗传进化调度
func (s *GeneticScheduler) Execute(ctx context.Context, plan *ExecutionPlan) ([]*TaskResult, error) {
	if len(plan.Tasks) == 0 {
		return nil, fmt.Errorf("no tasks to execute")
	}

	task := plan.Tasks[0] // 遗传模式通常针对单个复杂设计任务

	// 默认遗传参数
	popSize := 4
	generations := 3
	mutationRate := 0.3
	elitism := 1

	// 初始化种群：基于原始 prompt 生成变体
	s.population = s.initPopulation(task, popSize)

	var bestResult *TaskResult
	bestFitness := -1.0

	for gen := 0; gen < generations; gen++ {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		// 评估当前种群
		results, err := s.evaluatePopulation(ctx, task)
		if err != nil {
			return nil, fmt.Errorf("evaluate generation %d: %w", gen, err)
		}

		// 更新适应度
		for i, c := range s.population {
			for _, r := range results {
				if r.TaskID == c.TaskID {
					s.population[i].Artifacts = r.Artifacts
					// 适应度基于成功与否和工件数量
					s.population[i].Fitness = s.computeFitness(r)
					break
				}
			}
		}

		// 找当前代最优
		for _, c := range s.population {
			if c.Fitness > bestFitness {
				bestFitness = c.Fitness
				bestResult = &TaskResult{
					TaskID:    c.TaskID,
					AgentID:   c.AgentID,
					Success:   true,
					Artifacts: c.Artifacts,
				}
			}
		}

		// 发布进化事件
		s.bus.Publish(&protocol.Message{
			Type:      protocol.MsgContextSync,
			FromAgent: "genetic-scheduler",
			Payload: map[string]any{
				"generation": gen,
				"best_score": bestFitness,
				"pop_size":   len(s.population),
			},
		})

		// 最后一代不再做交叉变异
		if gen < generations-1 {
			s.population = s.evolve(task, popSize, mutationRate, elitism)
		}
	}

	if bestResult == nil {
		return nil, fmt.Errorf("no valid candidate found after %d generations", generations)
	}

	return []*TaskResult{bestResult}, nil
}

// initPopulation 初始化种群（基于 prompt 变体）
func (s *GeneticScheduler) initPopulation(task Task, popSize int) []Candidate {
	population := make([]Candidate, popSize)
	runtimes := s.pool.ListRuntimes()

	for i := 0; i < popSize; i++ {
		agentID := ""
		if len(runtimes) > 0 {
			agentID = runtimes[i%len(runtimes)].ID
		}

		variant := s.mutatePrompt(task.Prompt, 0.3)

		population[i] = Candidate{
			TaskID:     fmt.Sprintf("%s-gen0-c%d", task.ID, i),
			AgentID:    agentID,
			Prompt:     variant,
			Generation: 0,
		}
	}

	return population
}

// evaluatePopulation 评估种群中的所有候选解
func (s *GeneticScheduler) evaluatePopulation(ctx context.Context, task Task) ([]*TaskResult, error) {
	results := make([]*TaskResult, len(s.population))

	for i, c := range s.population {
		timeout := 5 * time.Minute
		if task.Timeout > 0 {
			timeout = time.Duration(task.Timeout) * time.Second
		}

		assignment := &agent.TaskAssignment{
			TaskID:  c.TaskID,
			Prompt:  c.Prompt,
			Timeout: timeout,
			Context: &agent.ContextSnapshot{
				Memory: map[string]any{"generation": c.Generation},
			},
		}

		if err := s.pool.AssignTask(c.AgentID, assignment); err != nil {
			results[i] = &TaskResult{
				TaskID:  c.TaskID,
				Success: false,
				Error:   err.Error(),
			}
			continue
		}

		result, err := s.pool.WaitResult(c.AgentID, timeout)
		if err != nil {
			results[i] = &TaskResult{
				TaskID:  c.TaskID,
				Success: false,
				Error:   err.Error(),
			}
			continue
		}

		results[i] = &TaskResult{
			TaskID:    result.TaskID,
			AgentID:   c.AgentID,
			Success:   result.Success,
			Artifacts: result.Artifacts,
			Error:     result.Error,
			Metrics:   result.Metrics,
		}
	}

	return results, nil
}

// computeFitness 计算候选解适应度
func (s *GeneticScheduler) computeFitness(r *TaskResult) float64 {
	if !r.Success {
		return 0.0
	}
	// 基础分：成功=50，工件数量加分，时间效率加分
	fitness := 50.0
	fitness += float64(len(r.Artifacts)) * 10.0
	if r.Metrics.Duration > 0 && r.Metrics.Duration < 2*time.Minute {
		fitness += 20.0 // 快速完成加分
	}
	return fitness
}

// evolve 进化：选择 + 交叉 + 变异
func (s *GeneticScheduler) evolve(task Task, popSize int, mutationRate float64, elitism int) []Candidate {
	// 排序：按适应度降序
	sorted := make([]Candidate, len(s.population))
	copy(sorted, s.population)
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].Fitness > sorted[i].Fitness {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	newPop := make([]Candidate, popSize)
	gen := sorted[0].Generation + 1

	// 精英保留
	for i := 0; i < elitism && i < len(sorted); i++ {
		newPop[i] = sorted[i]
		newPop[i].Generation = gen
		newPop[i].TaskID = fmt.Sprintf("%s-gen%d-c%d", task.ID, gen, i)
	}

	// 交叉 + 变异填充剩余
	for i := elitism; i < popSize; i++ {
		parent1 := s.tournamentSelect(sorted, 3)
		parent2 := s.tournamentSelect(sorted, 3)

		child := s.crossover(parent1, parent2, task.ID, gen, i)

		if rand.Float64() < mutationRate {
			child.Prompt = s.mutatePrompt(child.Prompt, 0.2)
		}

		newPop[i] = child
	}

	return newPop
}

// tournamentSelect 锦标赛选择
func (s *GeneticScheduler) tournamentSelect(pop []Candidate, tournamentSize int) Candidate {
	best := pop[rand.Intn(len(pop))]
	for i := 1; i < tournamentSize; i++ {
		c := pop[rand.Intn(len(pop))]
		if c.Fitness > best.Fitness {
			best = c
		}
	}
	return best
}

// crossover 交叉两个候选解的 prompt
func (s *GeneticScheduler) crossover(a, b Candidate, taskID string, gen, idx int) Candidate {
	// 简单交叉：取 prompt 的前半段和后半段
	promptA := a.Prompt
	promptB := b.Prompt

	if len(promptA) == 0 {
		promptA = promptB
	}
	if len(promptB) == 0 {
		promptB = promptA
	}

	midA := len(promptA) / 2
	midB := len(promptB) / 2

	newPrompt := promptA[:midA] + promptB[midB:]

	return Candidate{
		TaskID:     fmt.Sprintf("%s-gen%d-c%d", taskID, gen, idx),
		AgentID:    a.AgentID,
		Prompt:     newPrompt,
		Generation: gen,
		Fitness:    0,
	}
}

// mutatePrompt 对 prompt 进行变异
func (s *GeneticScheduler) mutatePrompt(prompt string, intensity float64) string {
	mutations := []string{
		" in a minimalist style",
		" with warm color palette",
		" using modern flat design",
		" with smooth gradients",
		" in a bold and dramatic style",
		" following Material Design principles",
		" with glassmorphism effects",
		" in a retro-futuristic aesthetic",
		" with dark theme",
		" using organic shapes and soft edges",
	}

	n := int(float64(len(mutations)) * intensity)
	if n < 1 {
		n = 1
	}

	result := prompt
	for i := 0; i < n; i++ {
		result += mutations[rand.Intn(len(mutations))]
	}

	return result
}
