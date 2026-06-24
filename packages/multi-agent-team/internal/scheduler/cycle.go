// Package scheduler 循环调度器 — 迭代求精模式
//
// Reflection 模式：Generator（产出） ↔ Reviewer（评审） 形成闭环，
// 每轮评审打分后，Generator 结合反馈修改，直到质量达标或达到最大轮次。
//
// 参考：
//   AgentFlow Reflection pattern (Write → Review loop)
//   plan-refine Claude Code skill (reflect → critique → improve)
//   Self-Refine / Reflexion literature (iterative self-improvement)
package scheduler

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// CycleScheduler 循环求精调度器
//
// 工作流程：
//   Generator 产出初稿
//       ↓
//   Reviewer 评审打分 (0-10)
//       ↓
//   Score >= threshold 或 iteration >= max?
//       ├── 是 → 结束，返回最优版本
//       └── 否 → Generator 结合反馈修改 → 回到评审
//
// 防退化机制：
//   - 每轮必须从新角度攻击
//   - 连续两轮无实质变化 → 提前终止
//   - 炒冷饭（重复旧点）→ 收敛信号，停止
type CycleScheduler struct {
	pool *agent.Pool
	bus  *bus.CommunicationBus
}

// NewCycleScheduler 创建循环调度器
func NewCycleScheduler(pool *agent.Pool, b *bus.CommunicationBus) *CycleScheduler {
	return &CycleScheduler{pool: pool, bus: b}
}

func (s *CycleScheduler) Mode() protocol.TeamMode {
	return protocol.ModeCycle
}

// Execute 执行循环求精
func (s *CycleScheduler) Execute(ctx context.Context, plan *ExecutionPlan) ([]*TaskResult, error) {
	if plan.Cycle == nil {
		return nil, fmt.Errorf("cycle: no cycle config provided")
	}

	cfg := plan.Cycle
	if cfg.MaxIterations <= 0 {
		cfg.MaxIterations = 5
	}
	if cfg.ScoreThreshold <= 0 {
		cfg.ScoreThreshold = 8.0
	}

	state := &protocol.CycleState{
		MaxIterations:  cfg.MaxIterations,
		ScoreThreshold: cfg.ScoreThreshold,
		History:        make([]protocol.CycleFeedback, 0, cfg.MaxIterations),
	}

	var allResults []*TaskResult

	// Phase 1: 生成初稿
	initialResult := s.generateDraft(ctx, cfg.Topic, cfg.GeneratorID)
	allResults = append(allResults, initialResult)

	if !initialResult.Success {
		return allResults, fmt.Errorf("cycle: initial generation failed: %s", initialResult.Error)
	}

	state.Iteration = 1
	state.Draft = s.extractArtifactContent(initialResult)

	// Phase 2: 评审 → 改进循环
	for state.Iteration <= state.MaxIterations {
		select {
		case <-ctx.Done():
			return allResults, ctx.Err()
		default:
		}

		// Step 2a: 评审
		feedback := s.reviewDraft(ctx, state, cfg.ReviewerID)
		state.History = append(state.History, feedback)
		state.Score = feedback.Score
		state.Feedback = feedback.Feedback

		reviewResult := &TaskResult{
			TaskID:  fmt.Sprintf("review-cycle-%d", state.Iteration),
			AgentID: cfg.ReviewerID,
			Success: true,
			Metrics: agent.TaskMetrics{
				StartTime: time.Now(),
				EndTime:   time.Now(),
			},
		}
		allResults = append(allResults, reviewResult)

		// Step 2b: 停止检查
		if s.shouldStop(state, feedback) {
			break
		}

		// Step 2c: 改进
		revised := s.improveDraft(ctx, state, cfg.GeneratorID)
		if revised.Success {
			state.Draft = s.extractArtifactContent(revised)
			state.Iteration++
		}
		allResults = append(allResults, revised)

		if !revised.Success {
			// 改进失败但已有评审通过的版本，不算致命错误
			if state.Score >= state.ScoreThreshold {
				break
			}
		}
	}

	// Phase 3: 构建最终结果
	finalResult := s.buildFinalResult(state, cfg, allResults)
	allResults = append(allResults, finalResult)

	return allResults, nil
}

// generateDraft 生成初稿
func (s *CycleScheduler) generateDraft(ctx context.Context, topic, generatorID string) *TaskResult {
	genCtx := &agent.ContextSnapshot{
		Memory: map[string]any{
			"phase":    "initial_generation",
			"topic":    topic,
		},
	}

	prompt := fmt.Sprintf(
		"[CYCLE MODE — Initial Draft Generation]\n"+
			"Topic: %s\n\n"+
			"Generate an initial draft. This will go through an iterative review-and-improve cycle.\n"+
			"Focus on getting a solid first version — don't try to make it perfect.\n"+
			"The reviewer will provide specific feedback for improvement.",
		topic,
	)

	assignment := &agent.TaskAssignment{
		TaskID:  fmt.Sprintf("generate-v1"),
		Prompt:  prompt,
		Context: genCtx,
		Timeout: 10 * time.Minute,
	}

	s.bus.Publish(&protocol.Message{
		Type:      protocol.MsgTaskAssign,
		FromAgent: "cycle-scheduler",
		ToAgent:   generatorID,
		Payload:   assignment,
		Metadata:  map[string]string{"phase": "generate", "cycle": "v1"},
	})

	if err := s.pool.AssignTask(generatorID, assignment); err != nil {
		return &TaskResult{
			TaskID:  assignment.TaskID,
			AgentID: generatorID,
			Success: false,
			Error:   fmt.Sprintf("assign generator: %v", err),
		}
	}

	result, err := s.pool.WaitResult(generatorID, 10*time.Minute)
	if err != nil {
		return &TaskResult{
			TaskID:  assignment.TaskID,
			AgentID: generatorID,
			Success: false,
			Error:   fmt.Sprintf("wait generator: %v", err),
		}
	}

	return &TaskResult{
		TaskID:    result.TaskID,
		AgentID:   generatorID,
		Success:   result.Success,
		Artifacts: result.Artifacts,
		Error:     result.Error,
	}
}

// reviewDraft 评审当前草稿
func (s *CycleScheduler) reviewDraft(ctx context.Context, state *protocol.CycleState, reviewerID string) protocol.CycleFeedback {
	// 构建防退化提示：要求从新角度攻击
	reviewPrompt := s.buildReviewPrompt(state)

	reviewCtx := &agent.ContextSnapshot{
		Memory: map[string]any{
			"phase":          "review",
			"iteration":      state.Iteration,
			"max_iterations": state.MaxIterations,
			"threshold":      state.ScoreThreshold,
		},
	}

	assignment := &agent.TaskAssignment{
		TaskID:  fmt.Sprintf("review-cycle-%d", state.Iteration),
		Prompt:  reviewPrompt,
		Context: reviewCtx,
		Timeout: 5 * time.Minute,
	}

	// 评审只做质量判断，不阻塞主流程
	feedback := protocol.CycleFeedback{
		Cycle:      state.Iteration,
		Draft:      state.Draft,
		Score:      0,
		Feedback:   "Review did not complete",
		ShouldStop: true,
	}

	s.bus.Publish(&protocol.Message{
		Type:      protocol.MsgCycleFeedback,
		FromAgent: "cycle-scheduler",
		ToAgent:   reviewerID,
		Payload:   assignment,
		Metadata: map[string]string{
			"cycle":     fmt.Sprintf("%d", state.Iteration),
			"threshold": fmt.Sprintf("%.1f", state.ScoreThreshold),
		},
	})

	if err := s.pool.AssignTask(reviewerID, assignment); err != nil {
		feedback.Feedback = fmt.Sprintf("Reviewer assignment failed: %v", err)
		return feedback
	}

	result, err := s.pool.WaitResult(reviewerID, 5*time.Minute)
	if err != nil {
		feedback.Feedback = fmt.Sprintf("Reviewer timeout: %v", err)
		return feedback
	}

	if !result.Success {
		feedback.Feedback = fmt.Sprintf("Reviewer failed: %s", result.Error)
		return feedback
	}

	// 从结果中提取评审信息
	feedback = s.parseFeedback(result, state)
	return feedback
}

// buildReviewPrompt 构建评审 prompt（含防退化指导）
func (s *CycleScheduler) buildReviewPrompt(state *protocol.CycleState) string {
	var b strings.Builder

	b.WriteString(fmt.Sprintf("[CYCLE MODE — Review Cycle %d/%d]\n", state.Iteration, state.MaxIterations))
	b.WriteString("You are the Reviewer. Critically evaluate the draft below.\n\n")

	// 注入历史反馈，要求换角度
	if len(state.History) > 0 {
		b.WriteString("=== Previous review cycles ===\n")
		for _, h := range state.History {
			truncLen := 100
			if len(h.Feedback) < truncLen {
				truncLen = len(h.Feedback)
			}
			b.WriteString(fmt.Sprintf("Cycle %d: Score=%.1f/10 — %s\n", h.Cycle, h.Score, h.Feedback[:truncLen]))
		}
		b.WriteString("\n")
		b.WriteString("⚠️  DEGENERATION GUARD: Previous cycles already addressed specific points.\n")
		b.WriteString("You MUST attack from a NEW angle that hasn't been covered yet.\n")
		b.WriteString("If you can only find the same issues as before, state 'NO_NEW_ANGLES' — this is a valid stop signal.\n\n")
	}

	b.WriteString(fmt.Sprintf("=== Draft to review (Cycle %d) ===\n", state.Iteration))
	b.WriteString(state.Draft)
	b.WriteString("\n\n")
	b.WriteString("=== Review Format ===\n")
	b.WriteString("SCORE: <0-10>\n")
	b.WriteString(fmt.Sprintf("THRESHOLD: %.1f (meet or exceed this to stop)\n", state.ScoreThreshold))
	b.WriteString("STRENGTHS: <comma-separated list of strengths>\n")
	b.WriteString("WEAKNESSES: <comma-separated list of weaknesses>\n")
	b.WriteString("FEEDBACK: <detailed, actionable improvement suggestions>\n")
	b.WriteString("SHOULD_STOP: YES or NO\n")
	b.WriteString("\n")
	b.WriteString("Rules:\n")
	b.WriteString("- Be specific: point to exact sections that need improvement\n")
	b.WriteString("- Be actionable: suggest concrete changes, not vague opinions\n")
	b.WriteString("- Be honest: if the draft is genuinely excellent, give a high score\n")
	b.WriteString("- Cosmetic-only issues (typos, whitespace) without substance → SHOULD_STOP: YES\n")
	b.WriteString("- If NO_NEW_ANGLES: set SCORE to current score or higher, SHOULD_STOP: YES\n")

	return b.String()
}

// improveDraft 基于反馈改进草稿
func (s *CycleScheduler) improveDraft(ctx context.Context, state *protocol.CycleState, generatorID string) *TaskResult {
	var b strings.Builder

	b.WriteString(fmt.Sprintf("[CYCLE MODE — Revision Cycle %d]\n", state.Iteration+1))
	b.WriteString(fmt.Sprintf("Goal: Score >= %.1f/10\n\n", state.ScoreThreshold))

	b.WriteString("=== Reviewer Feedback ===\n")
	b.WriteString(fmt.Sprintf("Score: %.1f/10\n", state.Score))
	b.WriteString(fmt.Sprintf("Feedback: %s\n\n", state.Feedback))

	b.WriteString("=== Current Draft ===\n")
	b.WriteString(state.Draft)
	b.WriteString("\n\n")
	b.WriteString("=== Instructions ===\n")
	b.WriteString("1. Address ALL actionable points in the feedback\n")
	b.WriteString("2. Do NOT weaken parts the reviewer praised\n")
	b.WriteString("3. If feedback suggests removing something added in a previous cycle, do it — removing bloat is progress\n")
	b.WriteString("4. Return the COMPLETE revised draft (not just the changes)\n")
	b.WriteString("5. At the end, append:\n")
	b.WriteString("   --- REVISION NOTES (Cycle %d) ---\n")
	b.WriteString("   What was changed and why:\n")

	improveCtx := &agent.ContextSnapshot{
		Memory: map[string]any{
			"phase":    "improve",
			"cycle":    state.Iteration + 1,
			"feedback": state.Feedback,
			"score":    state.Score,
		},
	}

	assignment := &agent.TaskAssignment{
		TaskID:  fmt.Sprintf("improve-cycle-%d", state.Iteration+1),
		Prompt:  b.String(),
		Context: improveCtx,
		Timeout: 10 * time.Minute,
	}

	s.bus.Publish(&protocol.Message{
		Type:      protocol.MsgTaskAssign,
		FromAgent: "cycle-scheduler",
		ToAgent:   generatorID,
		Payload:   assignment,
		Metadata:  map[string]string{"phase": "improve", "cycle": fmt.Sprintf("%d", state.Iteration+1)},
	})

	if err := s.pool.AssignTask(generatorID, assignment); err != nil {
		return &TaskResult{
			TaskID:  assignment.TaskID,
			AgentID: generatorID,
			Success: false,
			Error:   fmt.Sprintf("assign improver: %v", err),
		}
	}

	result, err := s.pool.WaitResult(generatorID, 10*time.Minute)
	if err != nil {
		return &TaskResult{
			TaskID:  assignment.TaskID,
			AgentID: generatorID,
			Success: false,
			Error:   fmt.Sprintf("wait improver: %v", err),
		}
	}

	return &TaskResult{
		TaskID:    result.TaskID,
		AgentID:   generatorID,
		Success:   result.Success,
		Artifacts: result.Artifacts,
		Error:     result.Error,
	}
}

// shouldStop 判断是否应终止循环
func (s *CycleScheduler) shouldStop(state *protocol.CycleState, feedback protocol.CycleFeedback) bool {
	// 条件 1: 评审明确标记应停止
	if feedback.ShouldStop {
		return true
	}

	// 条件 2: 评分达标
	if feedback.Score >= state.ScoreThreshold {
		return true
	}

	// 条件 3: 达到最大轮次
	if state.Iteration >= state.MaxIterations {
		return true
	}

	// 条件 4: 防退化 — 连续两轮无实质变化
	if len(state.History) >= 2 {
		prev := state.History[len(state.History)-1]
		prevPrev := state.History[len(state.History)-2]
		// 连续两轮分数相近且无新角度 → 收敛
		if abs(prev.Score-prevPrev.Score) < 0.5 && abs(feedback.Score-prev.Score) < 0.5 {
			// 检查是否在炒旧点
			if strings.Contains(feedback.Feedback, "NO_NEW_ANGLES") {
				return true
			}
		}
	}

	// 条件 5: 轮次超过 max 的 1.5 倍（安全阀）
	if state.Iteration > state.MaxIterations*3/2 {
		return true
	}

	return false
}

// parseFeedback 从 Agent 结果中解析评审反馈
func (s *CycleScheduler) parseFeedback(result *agent.TaskResult, state *protocol.CycleState) protocol.CycleFeedback {
	feedback := protocol.CycleFeedback{
		Cycle: state.Iteration,
		Draft: state.Draft,
		Score: 5.0, // 默认中等评分，不预设极端值
	}

	// 尝试从 artifacts 中提取反馈文本
	var reviewText string
	for _, art := range result.Artifacts {
		if art.Name == "review" || strings.Contains(art.Name, "review") {
			// 如果能直接读取 artifact 内容
			reviewText = fmt.Sprintf("Artifact: %s (path: %s)", art.Name, art.Path)
		}
	}

	// 尝试从 result 的 Error 字段获取评审输出（部分 Agent 将输出放在这里）
	if reviewText == "" && result.Error != "" {
		// 有些 Agent 设计将「非错误」输出放在 Error 字段
		reviewText = result.Error
		feedback.Feedback = reviewText
	}

	// 尝试从 artifacts 元数据获取评分
	for _, art := range result.Artifacts {
		if scoreStr, ok := art.Metadata["score"]; ok {
			var s float64
			if _, err := fmt.Sscanf(scoreStr, "%f", &s); err == nil {
				feedback.Score = s
			}
		}
		if stopStr, ok := art.Metadata["should_stop"]; ok {
			feedback.ShouldStop = stopStr == "true" || stopStr == "YES"
		}
	}

	// 使用评审结果作为反馈
	if feedback.Feedback == "" && len(result.Artifacts) > 0 {
		feedback.Feedback = fmt.Sprintf("Reviewer produced %d artifact(s)", len(result.Artifacts))
	}

	// 如果评审成功但无具体内容，给出中性评分
	if result.Success && feedback.Feedback == "" {
		feedback.Score = 6.0
		feedback.Feedback = "Review completed but no structured feedback extracted; continuing."
		feedback.ShouldStop = false
	}

	return feedback
}

// buildFinalResult 构建最终结果（含循环历史）
func (s *CycleScheduler) buildFinalResult(state *protocol.CycleState, cfg *CycleConfig, allResults []*TaskResult) *TaskResult {
	result := &TaskResult{
		TaskID:  "cycle-final",
		AgentID: cfg.GeneratorID,
		Success: state.Score >= cfg.ScoreThreshold,
		Metrics: agent.TaskMetrics{
			StartTime: time.Now(),
			EndTime:   time.Now(),
		},
	}

	// 收集最优质版本
	var bestArtifact *protocol.Artifact
	for _, r := range allResults {
		if r.Success && len(r.Artifacts) > 0 {
			bestArtifact = r.Artifacts[len(r.Artifacts)-1]
		}
	}

	if bestArtifact != nil {
		// 追加循环元数据
		bestArtifact.Metadata["mode"] = string(protocol.ModeCycle)
		bestArtifact.Metadata["total_cycles"] = fmt.Sprintf("%d", state.Iteration)
		bestArtifact.Metadata["final_score"] = fmt.Sprintf("%.1f", state.Score)
		bestArtifact.Metadata["threshold"] = fmt.Sprintf("%.1f", state.ScoreThreshold)
		result.Artifacts = append(result.Artifacts, bestArtifact)
	}

	if !result.Success {
		result.Error = fmt.Sprintf("cycle did not reach threshold %.1f (final score: %.1f after %d iterations)",
			state.ScoreThreshold, state.Score, state.Iteration)
	}

	return result
}

// extractArtifactContent 从任务结果中提取产出内容（文本形式）
func (s *CycleScheduler) extractArtifactContent(result *TaskResult) string {
	if len(result.Artifacts) > 0 {
		art := result.Artifacts[0]
		return fmt.Sprintf("[%s] %s (type: %s, path: %s)", art.Name, "artifact-content", art.Type, art.Path)
	}
	return result.Error
}

// abs 绝对值（float64）
func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
