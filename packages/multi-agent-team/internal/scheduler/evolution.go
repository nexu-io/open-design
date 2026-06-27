package scheduler

import (
	"context"
	"fmt"
	"sync"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/evolution"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// EvolutionScheduler 自递归进化调度器
// 基于历史任务结果自动优化 prompt、模型选择和调度参数，
// 使每次执行都比上一次更好。
type EvolutionScheduler struct {
	pool    *agent.Pool
	bus     *bus.CommunicationBus
	engine  *evolution.Engine
	mu      sync.RWMutex

	// 可选的内嵌遗传调度器（用于 prompt 变体探索）
	innerGenetic *GeneticScheduler
}

// NewEvolutionScheduler 创建进化调度器
func NewEvolutionScheduler(pool *agent.Pool, b *bus.CommunicationBus) *EvolutionScheduler {
	s := &EvolutionScheduler{
		pool:         pool,
		bus:          b,
		engine:       evolution.NewEngine(),
		innerGenetic: NewGeneticScheduler(pool, b),
	}
	return s
}

func (s *EvolutionScheduler) Mode() protocol.TeamMode {
	return protocol.ModeEvolution
}

// Execute 执行进化优化调度
func (s *EvolutionScheduler) Execute(ctx context.Context, plan *ExecutionPlan) ([]*TaskResult, error) {
	if len(plan.Tasks) == 0 {
		return nil, fmt.Errorf("no tasks to execute")
	}

	basePrompt := plan.Tasks[0].Prompt
	taskType := s.inferTaskType(basePrompt)

	// 1. 获取进化后的最优 prompt
	evolvedPrompt := s.engine.BestPrompt(taskType, basePrompt)
	if evolvedPrompt != basePrompt {
		// 将进化上下文注入
		evolvedPrompt = s.engine.EvolvePrompt(taskType, evolvedPrompt)
	}

	// 2. 自调优遗传算法参数
	params := s.engine.AutoTuneParams(taskType)
	s.innerGenetic.SetParams(params.PopulationSize, params.Generations)

	// 3. 用优化后的 prompt + 参数执行
	optimizedPlan := *plan
	optimizedPlan.Tasks = make([]Task, len(plan.Tasks))
	copy(optimizedPlan.Tasks, plan.Tasks)
	optimizedPlan.Tasks[0].Prompt = evolvedPrompt

	results, err := s.innerGenetic.Execute(ctx, &optimizedPlan)
	if err != nil {
		return results, err
	}

	// 4. 记录结果，驱动进化
	artifactIDs := collectArtifactIDs(results)
	score := computeScore(results)
	s.engine.RecordResult(taskType, evolvedPrompt, score, artifactIDs)

	return results, nil
}

// GetEvolutionState 获取指定任务类型的进化状态
func (s *EvolutionScheduler) GetEvolutionState(taskType string) *protocol.EvolutionState {
	return s.engine.GetState(taskType)
}

// GetEngine 获取底层进化引擎（供外部查询）
func (s *EvolutionScheduler) GetEngine() *evolution.Engine {
	return s.engine
}

// inferTaskType 从 prompt 推断任务类型
func (s *EvolutionScheduler) inferTaskType(prompt string) string {
	if len(prompt) == 0 {
		return "unknown"
	}
	keywords := map[string]string{
		"landing":   "landing_page",
		"dashboard": "dashboard",
		"component": "component",
		"hero":      "hero_section",
		"form":      "form",
		"modal":     "modal",
		"table":     "table",
		"card":      "card",
		"nav":       "navigation",
		"layout":    "layout",
		"design":    "design",
		"page":      "page",
		"ui":        "ui",
		"brand":     "brand",
		"illustration": "illustration",
		"icon":      "icon",
		"typography": "typography",
		"responsive": "responsive",
	}
	for kw, taskType := range keywords {
		if len(prompt) >= len(kw) {
			for i := 0; i <= len(prompt)-len(kw); i++ {
				if prompt[i] == ' ' || i == 0 {
					end := i + len(kw)
					if end <= len(prompt) && matchWord(prompt, i, kw) {
						return taskType
					}
				}
			}
		}
	}
	return "generic"
}

func matchWord(str string, start int, word string) bool {
	if start+len(word) > len(str) {
		return false
	}
	for i := 0; i < len(word); i++ {
		c1 := str[start+i]
		c2 := word[i]
		if c1 >= 'A' && c1 <= 'Z' {
			c1 += 32
		}
		if c2 >= 'A' && c2 <= 'Z' {
			c2 += 32
		}
		if c1 != c2 {
			return false
		}
	}
	return true
}

// collectArtifactIDs 从结果中收集所有 artifact ID
func collectArtifactIDs(results []*TaskResult) []string {
	var ids []string
	for _, r := range results {
		for _, a := range r.Artifacts {
			ids = append(ids, a.ID)
		}
	}
	return ids
}

// computeScore 根据执行结果计算质量评分 (0-10)
func computeScore(results []*TaskResult) float64 {
	if len(results) == 0 {
		return 0
	}

	score := 0.0
	total := 0.0
	for _, r := range results {
		total++
		if r.Success {
			score += 3.0 // 基础成功分

			// artifacts 数量加分
			artifactCount := float64(len(r.Artifacts))
			if artifactCount > 0 {
				artifactScore := minFloat(artifactCount*1.5, 4.0)
				score += artifactScore
			}

			// 效率加分（快速完成更好）
			if r.Metrics.Duration > 0 {
				efficiency := 3.0 / r.Metrics.Duration.Minutes()
				score += minFloat(efficiency, 2.0)
			}

			// 文件产出加分
			if r.Metrics.FilesCreated > 0 {
				score += minFloat(float64(r.Metrics.FilesCreated)*0.5, 1.0)
			}
		}
	}

	if total == 0 {
		return 0
	}
	return minFloat(score/total, 10.0) / 10.0 * 10.0
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
