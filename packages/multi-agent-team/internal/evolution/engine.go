// Package evolution 自递归进化引擎
// 基于历史任务执行结果，自动优化 prompt 模板和调度参数，
// 使多 Agent 系统在使用中越用越好。
package evolution

import (
	"fmt"
	"math"
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// Engine 进化引擎
type Engine struct {
	mu       sync.RWMutex
	states   map[string]*protocol.EvolutionState // taskType → 进化状态
	rng      *rand.Rand
}

// NewEngine 创建进化引擎
func NewEngine() *Engine {
	return &Engine{
		states: make(map[string]*protocol.EvolutionState),
		rng:    rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// GetState 获取指定任务类型的进化状态
func (e *Engine) GetState(taskType string) *protocol.EvolutionState {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.states[taskType]
}

// RecordResult 记录一次任务执行结果，自动评估并尝试进化
// 返回值：本次是否产生了进化（生成了更优的 prompt）
func (e *Engine) RecordResult(taskType, prompt string, score float64, artifactIDs []string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()

	state, exists := e.states[taskType]
	if !exists {
		state = &protocol.EvolutionState{
			TaskType:    taskType,
			Generation:  1,
			BestPrompt:  prompt,
			Score:       score,
			ParamTuning: defaultParamTuning(),
		}
		e.states[taskType] = state
		return false // 第一代，没有进化
	}

	// 记录本次结果
	record := protocol.EvolutionRecord{
		Generation:  state.Generation,
		Prompt:      prompt,
		Score:       score,
		ArtifactIDs: artifactIDs,
		CreatedAt:   time.Now(),
	}
	state.History = append(state.History, record)
	state.Generation++

	// 评估是否需要进化
	evolved := false

	// 如果本次评分显著高于历史最佳，采纳为新基线
	improvement := (score - state.Score) / state.Score
	if score > state.Score && improvement > 0.05 {
		state.BestPrompt = prompt
		state.Score = score
		evolved = true
	}

	// 自适应参数调优
	e.autoTuneParams(state, record)

	// 定期做 prompt 变异尝试（每 5 代一次探索性变异）
	if state.Generation%5 == 0 && state.Generation > 0 {
		mutated := e.mutatePrompt(state.BestPrompt, state.ParamTuning.MutationRate)
		// 变异后的 prompt 会在下一轮执行中被评估
		state.History = append(state.History, protocol.EvolutionRecord{
			Generation: state.Generation,
			Prompt:     mutated,
			Mutations:  []string{"exploration"},
			CreatedAt:  time.Now(),
		})
	}

	// 更新适应度地形（最近10代评分变化）
	if len(state.History) > 0 {
		recent := min(10, len(state.History))
		state.FitnessLandscape = make([]float64, recent)
		for i := 0; i < recent; i++ {
			idx := len(state.History) - recent + i
			state.FitnessLandscape[i] = state.History[idx].Score
		}
	}

	return evolved
}

// BestPrompt 获取当前最优 prompt 模板
func (e *Engine) BestPrompt(taskType, defaultPrompt string) string {
	e.mu.RLock()
	defer e.mu.RUnlock()

	state, exists := e.states[taskType]
	if !exists || state.Generation == 0 {
		return defaultPrompt
	}
	return state.BestPrompt
}

// EvolvePrompt 基于进化状态优化给定 prompt
// 如果已知更好的历史 prompt，返回优化版本；否则返回原版
func (e *Engine) EvolvePrompt(taskType, prompt string) string {
	e.mu.RLock()
	defer e.mu.RUnlock()

	state, exists := e.states[taskType]
	if !exists || state.Generation < 3 {
		return prompt // 样本不足，不优化
	}

	// 如果有显著更优的历史 prompt，替换为改进版
	if state.Score > 2.0 && state.BestPrompt != prompt {
		// 将历史经验注入当前 prompt
		return injectEvolutionContext(state, prompt)
	}
	return prompt
}

// AutoTuneParams 获取自动调优后的调度参数
func (e *Engine) AutoTuneParams(taskType string) protocol.ParamTuning {
	e.mu.RLock()
	defer e.mu.RUnlock()

	state, exists := e.states[taskType]
	if !exists {
		return defaultParamTuning()
	}
	return state.ParamTuning
}

// ===== 内部方法 =====

func defaultParamTuning() protocol.ParamTuning {
	return protocol.ParamTuning{
		PopulationSize:    3,
		Generations:       2,
		MutationRate:      0.15,
		CrossoverRate:     0.7,
		SelectionPressure: 1.5,
	}
}

// autoTuneParams 根据历史表现自适应调优参数
func (e *Engine) autoTuneParams(state *protocol.EvolutionState, latest protocol.EvolutionRecord) {
	pt := &state.ParamTuning

	// 评分趋势判断
	if len(state.History) >= 3 {
		recent := state.History[len(state.History)-3:]
		avgRecent := 0.0
		for _, r := range recent {
			avgRecent += r.Score
		}
		avgRecent /= float64(len(recent))

		// 如果近期评分上升，降低变异率（收敛）；如果下降，提高变异率（探索）
		if avgRecent > state.Score*1.1 {
			pt.MutationRate = math.Max(0.05, pt.MutationRate*0.9)
			pt.PopulationSize = min(10, pt.PopulationSize+1)
		} else if avgRecent < state.Score*0.9 {
			pt.MutationRate = math.Min(0.5, pt.MutationRate*1.2)
			pt.SelectionPressure = math.Min(3.0, pt.SelectionPressure*1.1)
		}
	}

	// 如果最近几次都在提升，可以增加 generation 深度
	if len(state.History) >= 2 {
		last2 := state.History[len(state.History)-2:]
		if last2[0].Score < last2[1].Score && last2[1].Score > state.Score {
			pt.Generations = min(5, pt.Generations+1)
		}
	}
}

// mutatePrompt 对 prompt 做可控变异
func (e *Engine) mutatePrompt(base string, rate float64) string {
	words := strings.Fields(base)
	if len(words) < 5 || rate <= 0 {
		return base
	}

	// 随机选择变异类型
	switch e.rng.Intn(3) {
	case 0:
		// 语义增强：添加优化指令
		enhancements := []string{
			"Focus on exceptional visual impact and user engagement.",
			"Prioritize accessibility and inclusive design patterns.",
			"Incorporate data-driven design decisions.",
			"Emphasize responsive and mobile-first approaches.",
			"Apply modern design system principles.",
		}
		return base + " [Evolution directive: " + enhancements[e.rng.Intn(len(enhancements))] + "]"
	case 1:
		// 结构重组：调整 prompt 结构
		if e.rng.Float64() < rate {
			return "Based on successful historical designs:\n" + base
		}
	default:
		// 上下文注入：加入进化经验
		return base
	}
	return base
}

// injectEvolutionContext 向 prompt 注入进化上下文
func injectEvolutionContext(state *protocol.EvolutionState, prompt string) string {
	if len(state.History) == 0 {
		return prompt
	}

	// 提取历史最佳记录的经验
	var parts []string
	parts = append(parts, fmt.Sprintf("[Evolution v%d — fitness: %.1f/10]", state.Generation, state.Score))

	// 总结哪些模式有效
	if state.ParamTuning.PopulationSize > 3 {
		parts = append(parts, "✓ Higher population diversity found beneficial")
	}
	if len(state.History) >= 3 {
		// 检查是否有持续的评分提升
		ascending := true
		for i := 1; i < min(3, len(state.History)); i++ {
			if state.History[len(state.History)-i].Score <= state.History[len(state.History)-i-1].Score {
				ascending = false
				break
			}
		}
		if ascending {
			parts = append(parts, "✓ Iterative refinement trajectory: positive")
		}
	}

	return strings.Join(parts, "\n") + "\n\n" + prompt
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
