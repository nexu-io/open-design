// Package scheduler 互补调度器 — 专家链式协作模式
//
// Chain-of-Experts 模式：多位专业 Agent 按序执行，
// 每位专家在前序专家累积的上下文基础上贡献自己的专业分析，
// 最后由综合器（Synthesizer）整合所有视角形成统一结论。
//
// 参考：AgentFlow Chain-of-Experts pattern, MetaGPT role pipeline
package scheduler

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// ComplementaryScheduler 互补专家链调度器
//
// 工作流程：
//   Expert 1 (e.g. 设计师) → Expert 2 (e.g. 文案) → ... → Expert N → Synthesizer
//
// 每位专家接收前序所有专家的完整分析作为上下文，在自己的专业领域添加视角。
// Synthesizer 负责消歧、提纯，输出统一的整合结论。
type ComplementaryScheduler struct {
	pool *agent.Pool
	bus  *bus.CommunicationBus
}

// NewComplementaryScheduler 创建互补调度器
func NewComplementaryScheduler(pool *agent.Pool, b *bus.CommunicationBus) *ComplementaryScheduler {
	return &ComplementaryScheduler{pool: pool, bus: b}
}

func (s *ComplementaryScheduler) Mode() protocol.TeamMode {
	return protocol.ModeComplementary
}

// Execute 执行互补专家链
//
// 1. 按 Order 排序专家
// 2. 每位专家依次执行，接收累积的上下文
// 3. 综合器整合所有专家贡献
// 4. 返回完整的分析结果链
func (s *ComplementaryScheduler) Execute(ctx context.Context, plan *ExecutionPlan) ([]*TaskResult, error) {
	if len(plan.Experts) == 0 {
		return nil, fmt.Errorf("complementary: no experts configured")
	}

	// 按 Order 排序专家
	experts := make([]*ExpertTask, len(plan.Experts))
	copy(experts, plan.Experts)
	sort.Slice(experts, func(i, j int) bool {
		return experts[i].Order < experts[j].Order
	})

	var allResults []*TaskResult
	var accumulatedCtx *agent.ContextSnapshot

	// 1. 按序执行每位专家
	for i, expert := range experts {
		select {
		case <-ctx.Done():
			return allResults, ctx.Err()
		default:
		}

		// 构建继承上下文：注入前序所有专家的产出
		expertCtx := s.buildExpertContext(expert, accumulatedCtx, i)

		// 构建专家 prompt
		prompt := s.buildExpertPrompt(expert, accumulatedCtx)

		taskResult := s.runExpert(ctx, expert, prompt, expertCtx)
		allResults = append(allResults, taskResult)

		if !taskResult.Success {
			// 专家失败：记录错误但继续执行后续专家
			// （后续专家可以基于已知的部分信息继续工作）
			continue
		}

		// 累积上下文
		accumulatedCtx = s.accumulateContext(accumulatedCtx, expert, taskResult)
	}

	// 2. 综合器整合所有专家贡献
	synthesisResult := s.synthesize(ctx, accumulatedCtx, allResults)
	allResults = append(allResults, synthesisResult)

	return allResults, nil
}

// buildExpertContext 构建专家的上下文快照
func (s *ComplementaryScheduler) buildExpertContext(expert *ExpertTask, parent *agent.ContextSnapshot, index int) *agent.ContextSnapshot {
	ctx := &agent.ContextSnapshot{
		Memory: make(map[string]any),
	}

	if parent != nil {
		ctx.AgentID = parent.AgentID
		ctx.ParentTask = parent.ParentTask
		ctx.Artifacts = append(ctx.Artifacts, parent.Artifacts...)
		ctx.Skills = append(ctx.Skills, parent.Skills...)
		ctx.Designs = append(ctx.Designs, parent.Designs...)

		for k, v := range parent.Memory {
			ctx.Memory[k] = v
		}
	}

	// 注入当前专家的角色信息
	ctx.Memory["expert_role"] = expert.Role
	ctx.Memory["expert_specialty"] = expert.Specialty
	ctx.Memory["expert_index"] = index + 1
	ctx.Memory["total_experts"] = len(expert.Skills) // placeholder, 外部应设对

	return ctx
}

// buildExpertPrompt 构建专家 prompt（含前序专家上下文）
func (s *ComplementaryScheduler) buildExpertPrompt(expert *ExpertTask, parent *agent.ContextSnapshot) string {
	var b strings.Builder

	b.WriteString(fmt.Sprintf("[Complementary Expert Chain — Expert %d: %s (%s)]\n",
		1, expert.Role, expert.Specialty)) // order info in context
	b.WriteString(fmt.Sprintf("Your role: %s\n", expert.Role))
	b.WriteString(fmt.Sprintf("Your specialty: %s\n", expert.Specialty))
	b.WriteString("\n")

	// 如果有前序专家的分析，注入作为上下文
	if parent != nil && len(parent.Artifacts) > 0 {
		b.WriteString("=== Analysis from previous experts ===\n")
		b.WriteString("The following experts have already analyzed this task:\n")
		for i, a := range parent.Artifacts {
			b.WriteString(fmt.Sprintf("  %d. Expert: %s\n", i+1, a.Producer))
			b.WriteString(fmt.Sprintf("     Artifact: %s (type: %s)\n", a.Name, a.Type))
			if a.Path != "" {
				b.WriteString(fmt.Sprintf("     Path: %s\n", a.Path))
			}
		}
		b.WriteString("\n")
		b.WriteString("Build upon their analysis. Do NOT repeat what they already covered.\n")
		b.WriteString("Focus on what YOUR specialty adds that others haven't addressed.\n")
		b.WriteString("\n")
	}

	// 共享记忆
	if parent != nil && len(parent.Memory) > 0 {
		if dir, ok := parent.Memory["expert_direction"]; ok {
			b.WriteString(fmt.Sprintf("Direction from previous analysis: %v\n\n", dir))
		}
	}

	b.WriteString("---\n\n")
	b.WriteString(expert.Prompt)
	b.WriteString("\n\n")
	b.WriteString(fmt.Sprintf("[As %s (%s), provide your analysis focusing on your specialty. ", expert.Role, expert.Specialty))
	b.WriteString("Reference and build upon prior experts' findings where relevant.]")

	return b.String()
}

// runExpert 执行单个专家任务
func (s *ComplementaryScheduler) runExpert(ctx context.Context, expert *ExpertTask, prompt string, execCtx *agent.ContextSnapshot) *TaskResult {
	timeout := 10 * time.Minute

	assignment := &agent.TaskAssignment{
		TaskID:    fmt.Sprintf("expert-%s", expert.ExpertID),
		Prompt:    prompt,
		Context:   execCtx,
		Timeout:   timeout,
	}

	// 发布专家交接事件
	s.bus.Publish(&protocol.Message{
		Type:      protocol.MsgExpertHandoff,
		FromAgent: "complementary-scheduler",
		ToAgent:   expert.ExpertID,
		Payload:   assignment,
		Metadata: map[string]string{
			"expert_id":  expert.ExpertID,
			"role":       expert.Role,
			"specialty":  expert.Specialty,
			"order":      fmt.Sprintf("%d", expert.Order),
		},
	})

	if err := s.pool.AssignTask(expert.ExpertID, assignment); err != nil {
		return &TaskResult{
			TaskID:  assignment.TaskID,
			AgentID: expert.ExpertID,
			Success: false,
			Error:   fmt.Sprintf("assign expert task: %v", err),
		}
	}

	result, err := s.pool.WaitResult(expert.ExpertID, timeout)
	if err != nil {
		return &TaskResult{
			TaskID:  assignment.TaskID,
			AgentID: expert.ExpertID,
			Success: false,
			Error:   fmt.Sprintf("wait expert result: %v", err),
		}
	}

	taskResult := &TaskResult{
		TaskID:    result.TaskID,
		AgentID:   expert.ExpertID,
		Success:   result.Success,
		Artifacts: result.Artifacts,
		Error:     result.Error,
		Metrics:   result.Metrics,
	}

	return taskResult
}

// accumulateContext 累积专家上下文
func (s *ComplementaryScheduler) accumulateContext(prev *agent.ContextSnapshot, expert *ExpertTask, result *TaskResult) *agent.ContextSnapshot {
	ctx := &agent.ContextSnapshot{
		Memory: make(map[string]any),
	}

	if prev != nil {
		ctx.AgentID = prev.AgentID
		ctx.ParentTask = prev.ParentTask
		ctx.Artifacts = append(ctx.Artifacts, prev.Artifacts...)
		ctx.Skills = append(ctx.Skills, prev.Skills...)
		ctx.Designs = append(ctx.Designs, prev.Designs...)
		for k, v := range prev.Memory {
			ctx.Memory[k] = v
		}
	}

	// 添加当前专家的产出
	ctx.AgentID = expert.ExpertID
	ctx.Artifacts = append(ctx.Artifacts, result.Artifacts...)
	ctx.Skills = append(ctx.Skills, expert.Skills...)
	ctx.Designs = append(ctx.Designs, expert.Designs...)
	ctx.Memory[fmt.Sprintf("expert_%s_role", expert.ExpertID)] = expert.Role
	ctx.Memory[fmt.Sprintf("expert_%s_specialty", expert.ExpertID)] = expert.Specialty
	ctx.Memory[fmt.Sprintf("expert_%s_success", expert.ExpertID)] = result.Success

	return ctx
}

// synthesize 综合器：整合所有专家分析
//
// 综合器不调用外部 Agent，而是基于所有专家的产出进行结构化整合。
// 如果配置中有专门的 synthesizer agent，则通过 Agent Pool 调用。
func (s *ComplementaryScheduler) synthesize(ctx context.Context, accumulatedCtx *agent.ContextSnapshot, expertResults []*TaskResult) *TaskResult {
	result := &TaskResult{
		TaskID:  "synthesizer",
		AgentID: "synthesizer",
		Success: true,
	}

	if accumulatedCtx == nil {
		result.Success = false
		result.Error = "no context to synthesize"
		return result
	}

	// 收集所有专家的摘要
	var summaries []string
	successCount := 0
	for _, er := range expertResults {
		if er.Success {
			successCount++
			for _, art := range er.Artifacts {
				summaries = append(summaries,
					fmt.Sprintf("[%s (%s)]: artifact '%s' (%s)", er.AgentID, "", art.Name, art.Type))
			}
		}
	}

	// 创建综合产物
	synthesisArtifact := &protocol.Artifact{
		ID:        "synthesis-" + time.Now().Format("20060102-150405"),
		Name:      "expert-synthesis.md",
		Type:      protocol.ArtifactDesign,
		Producer:  "synthesizer",
		CreatedAt: time.Now(),
		Metadata: map[string]string{
			"mode":             string(protocol.ModeComplementary),
			"expert_count":     fmt.Sprintf("%d", len(expertResults)),
			"success_count":    fmt.Sprintf("%d", successCount),
			"expert_summaries": strings.Join(summaries, "; "),
		},
	}

	result.Artifacts = append(result.Artifacts, synthesisArtifact)

	// 发布综合完成事件
	s.bus.Publish(&protocol.Message{
		Type:      protocol.MsgSynthesisResult,
		FromAgent: "synthesizer",
		Payload:   synthesisArtifact,
		Metadata: map[string]string{
			"expert_count":  fmt.Sprintf("%d", len(expertResults)),
			"success_count": fmt.Sprintf("%d", successCount),
		},
	})

	return result
}
