package scheduler

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"sync"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// SwarmScheduler 分身集群调度器：遗传算法统筹多个子 Agent（分身）
// 动态创建/销毁分身，利用种群进化找到最优 Agent 配置和分工。
type SwarmScheduler struct {
	pool          *agent.Pool
	bus           *bus.CommunicationBus
	rng           *rand.Rand
	swarmState    *protocol.SwarmState
	mu            sync.RWMutex
	clonePoolSize int
	maxGenerations int
	mutationRate  float64
	crossoverRate float64
}

func NewSwarmScheduler(pool *agent.Pool, b *bus.CommunicationBus) *SwarmScheduler {
	return &SwarmScheduler{
		pool:           pool,
		bus:            b,
		rng:            rand.New(rand.NewSource(time.Now().UnixNano())),
		clonePoolSize:  6,
		maxGenerations: 3,
		mutationRate:   0.2,
		crossoverRate:  0.6,
	}
}

func (s *SwarmScheduler) Mode() protocol.TeamMode { return protocol.ModeSwarm }

func (s *SwarmScheduler) Execute(ctx context.Context, plan *ExecutionPlan) ([]*TaskResult, error) {
	if len(plan.Tasks) == 0 {
		return nil, fmt.Errorf("no tasks to execute")
	}

	population := s.spawnClones(s.clonePoolSize)
	s.mu.Lock()
	s.swarmState = &protocol.SwarmState{
		Generation:    0,
		Population:    population,
		FitnessScores: make(map[string]float64),
	}
	s.mu.Unlock()

	var allResults []*TaskResult
	basePrompt := plan.Tasks[0].Prompt
	timeoutSec := plan.Tasks[0].Timeout

	for gen := 0; gen < s.maxGenerations; gen++ {
		select {
		case <-ctx.Done():
			return allResults, ctx.Err()
		default:
		}

		genResults := s.executeGeneration(ctx, basePrompt, timeoutSec, population, gen)
		s.evaluateFitness(genResults)
		allResults = append(allResults, genResults...)

		if gen < s.maxGenerations-1 {
			population = s.evolvePopulation(population, genResults)
			s.mu.Lock()
			s.swarmState.Generation = gen + 1
			s.swarmState.Population = population
			s.mu.Unlock()
		}
	}

	return allResults, nil
}

// spawnClones 基于 Agent 池创建初始分身种群
func (s *SwarmScheduler) spawnClones(size int) []*protocol.CloneSpec {
	runtimes := s.pool.ListRuntimes()
	if len(runtimes) == 0 {
		return nil
	}

	clones := make([]*protocol.CloneSpec, size)
	for i := 0; i < size; i++ {
		parent := runtimes[i%len(runtimes)]
		clone := &protocol.CloneSpec{
			ID:       fmt.Sprintf("clone-%d", i),
			ParentID: parent.ID,
			Role:     "worker",
			Depth:    1,
			Capability: protocol.AgentCapability{
				Name:        fmt.Sprintf("%s-clone-%d", parent.Capability.Name, i),
				Skills:      append([]string{}, parent.Capability.Skills...),
				Designs:     append([]string{}, parent.Capability.Designs...),
				MaxParallel: 1,
				ModelType:   parent.Capability.ModelType,
				ModelName:   parent.Capability.ModelName,
			},
			Inheritance: &protocol.CloneInheritance{
				InheritSkills:  true,
				InheritDesigns: true,
				InheritMemory:  true,
				DivergenceRate: 0.0,
			},
		}

		// 初始多样性
		if i > 0 && s.rng.Float64() < 0.3 {
			clone.Inheritance.DivergenceRate = s.mutationRate
			if len(clone.Capability.Skills) > 1 && s.rng.Float64() < 0.5 {
				dropIdx := s.rng.Intn(len(clone.Capability.Skills))
				clone.Capability.Skills = append(
					clone.Capability.Skills[:dropIdx],
					clone.Capability.Skills[dropIdx+1:]...,
				)
			}
		}
		clones[i] = clone
	}
	return clones
}

// executeGeneration 执行一代种群
func (s *SwarmScheduler) executeGeneration(ctx context.Context, basePrompt string, timeoutSec int, clones []*protocol.CloneSpec, gen int) []*TaskResult {
	timeout := time.Duration(timeoutSec) * time.Second
	if timeout == 0 {
		timeout = 10 * time.Minute
	}

	var (
		mu      sync.Mutex
		results []*TaskResult
		wg      sync.WaitGroup
	)

	for _, clone := range clones {
		wg.Add(1)
		go func(c *protocol.CloneSpec) {
			defer wg.Done()
			prompt := fmt.Sprintf("[Clone %s | Gen %d | Role: %s]\n%s", c.ID, gen, c.Role, basePrompt)

			assignment := &agent.TaskAssignment{
				TaskID:  fmt.Sprintf("swarm-%s-%d", c.ID, time.Now().UnixNano()),
				Prompt:  prompt,
				Timeout: timeout,
			}

			if err := s.pool.AssignTask(c.ParentID, assignment); err != nil {
				mu.Lock()
				results = append(results, &TaskResult{TaskID: assignment.TaskID, AgentID: c.ParentID, Success: false, Error: err.Error()})
				mu.Unlock()
				return
			}

			result, err := s.pool.WaitResult(c.ParentID, timeout)
			mu.Lock()
			if err != nil {
				results = append(results, &TaskResult{TaskID: assignment.TaskID, AgentID: c.ParentID, Success: false, Error: err.Error()})
			} else {
				results = append(results, &TaskResult{
					TaskID: result.TaskID, AgentID: c.ParentID, Success: result.Success,
					Artifacts: result.Artifacts, Error: result.Error, Metrics: result.Metrics,
				})
			}
			mu.Unlock()
		}(clone)
	}
	wg.Wait()
	return results
}

// evaluateFitness 评估适应度
func (s *SwarmScheduler) evaluateFitness(results []*TaskResult) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.swarmState.FitnessScores = make(map[string]float64)
	for _, r := range results {
		fitness := 0.0
		if r.Success {
			fitness += 5.0 + float64(len(r.Artifacts))*1.5
			if r.Metrics.Duration > 0 {
				fitness += math.Min(10.0/r.Metrics.Duration.Seconds(), 3.0)
			}
		}
		for _, c := range s.swarmState.Population {
			if c.ID == r.AgentID || r.AgentID == c.ParentID {
				s.swarmState.FitnessScores[c.ID] = fitness
			}
		}
	}
	var bestID string
	bestScore := -1.0
	for id, score := range s.swarmState.FitnessScores {
		if score > bestScore {
			bestScore, bestID = score, id
		}
	}
	s.swarmState.BestClone = bestID
}

// evolvePopulation 进化到下一代
func (s *SwarmScheduler) evolvePopulation(population []*protocol.CloneSpec, results []*TaskResult) []*protocol.CloneSpec {
	if len(population) == 0 {
		return population
	}
	type scored struct {
		idx   int
		score float64
	}
	var ranked []scored
	for i, c := range population {
		ranked = append(ranked, scored{i, s.swarmState.FitnessScores[c.ID]})
	}
	sort.Slice(ranked, func(i, j int) bool { return ranked[i].score > ranked[j].score })

	nextGen := make([]*protocol.CloneSpec, len(population))
	eliteCount := minInt(2, len(population))
	for i := 0; i < eliteCount; i++ {
		nextGen[i] = s.cloneSpec(population[ranked[i].idx])
	}
	s.swarmState.Elite = append(s.swarmState.Elite, nextGen[0].ID, nextGen[1].ID)

	for i := eliteCount; i < len(population); i += 2 {
		parent1 := population[ranked[s.rng.Intn(len(ranked)/2)].idx]
		parent2 := population[ranked[s.rng.Intn(len(ranked)/2)].idx]
		if i+1 < len(population) && s.rng.Float64() < s.crossoverRate {
			child1, child2 := s.crossover(parent1, parent2)
			nextGen[i], nextGen[i+1] = s.mutateClone(child1), s.mutateClone(child2)
		} else {
			nextGen[i] = s.mutateClone(s.cloneSpec(parent1))
			if i+1 < len(population) {
				nextGen[i+1] = s.mutateClone(s.cloneSpec(parent2))
			}
		}
		s.swarmState.Crossovers++
	}
	return nextGen
}

func (s *SwarmScheduler) crossover(a, b *protocol.CloneSpec) (*protocol.CloneSpec, *protocol.CloneSpec) {
	child1, child2 := s.cloneSpec(a), s.cloneSpec(b)
	if len(a.Capability.Skills) > 0 && len(b.Capability.Skills) > 0 {
		midA, midB := len(a.Capability.Skills)/2, len(b.Capability.Skills)/2
		child1.Capability.Skills = uniqueStrings(append(a.Capability.Skills[:midA], b.Capability.Skills[midB:]...))
		child2.Capability.Skills = uniqueStrings(append(b.Capability.Skills[:midB], a.Capability.Skills[midA:]...))
	}
	return child1, child2
}

func (s *SwarmScheduler) mutateClone(c *protocol.CloneSpec) *protocol.CloneSpec {
	if s.rng.Float64() >= s.mutationRate {
		return c
	}
	s.swarmState.Mutations++
	switch s.rng.Intn(4) {
	case 0:
		roles := []string{"worker", "explorer", "specialist", "synthesizer"}
		c.Role = roles[s.rng.Intn(len(roles))]
	case 1:
		if len(c.Capability.Skills) > 1 {
			s.rng.Shuffle(len(c.Capability.Skills), func(i, j int) {
				c.Capability.Skills[i], c.Capability.Skills[j] = c.Capability.Skills[j], c.Capability.Skills[i]
			})
		}
	case 2:
		if c.Inheritance != nil {
			c.Inheritance.DivergenceRate = math.Min(1.0, c.Inheritance.DivergenceRate+s.rng.Float64()*0.1)
		}
	case 3:
		c.Depth = maxInt(0, c.Depth+s.rng.Intn(3)-1)
	}
	return c
}

func (s *SwarmScheduler) cloneSpec(src *protocol.CloneSpec) *protocol.CloneSpec {
	return &protocol.CloneSpec{
		ID:       fmt.Sprintf("%s-c%d", src.ParentID, time.Now().UnixNano()%10000),
		ParentID: src.ParentID,
		Role:     src.Role,
		Depth:    src.Depth + 1,
		Capability: protocol.AgentCapability{
			Name: src.Capability.Name, Skills: append([]string{}, src.Capability.Skills...),
			Designs: append([]string{}, src.Capability.Designs...),
			MaxParallel: src.Capability.MaxParallel, ModelType: src.Capability.ModelType, ModelName: src.Capability.ModelName,
		},
		Inheritance: &protocol.CloneInheritance{
			InheritSkills: src.Inheritance.InheritSkills, InheritDesigns: src.Inheritance.InheritDesigns,
			InheritMemory: src.Inheritance.InheritMemory, DivergenceRate: src.Inheritance.DivergenceRate,
		},
	}
}

func (s *SwarmScheduler) GetSwarmState() *protocol.SwarmState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.swarmState
}

func uniqueStrings(items []string) []string {
	seen := make(map[string]bool)
	var result []string
	for _, item := range items {
		if !seen[item] {
			seen[item] = true
			result = append(result, item)
		}
	}
	return result
}

func minInt(a, b int) int {
	if a < b { return a }
	return b
}

func maxInt(a, b int) int {
	if a > b { return a }
	return b
}
