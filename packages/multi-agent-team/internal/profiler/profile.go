// Package profiler Agent 能力画像与智能角色分配
// 根据 daemon 已识别的 Agent 运行时特性，自动评估能力偏向并映射到团队角色
package profiler

import (
	"strings"

	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// CapabilityDimension 能力维度
type CapabilityDimension string

const (
	DimCreativeDesign CapabilityDimension = "creative_design" // 创意设计能力
	DimCodeGen        CapabilityDimension = "code_gen"        // 代码生成能力
	DimContentWriting CapabilityDimension = "content_writing" // 内容写作能力
	DimCriticalReview CapabilityDimension = "critical_review" // 批判评审能力
	DimSystemOps      CapabilityDimension = "system_ops"      // 系统操作能力
	DimFastIteration  CapabilityDimension = "fast_iteration"  // 快速迭代能力
	DimDeepReasoning  CapabilityDimension = "deep_reasoning"  // 深度推理能力
	DimChineseContent CapabilityDimension = "chinese_content" // 中文内容能力
)

// AgentProfile Agent 能力画像
type AgentProfile struct {
	AgentType  string                          // daemon 运行时类型 (claude, codex, cursor-agent, ...)
	AgentName  string                          // 人类可读名称
	Scores     map[CapabilityDimension]float64 // 各维度能力评分 (0-100)
	Strengths  []CapabilityDimension           // 优势能力 (评分 >= 70)
	Weaknesses []CapabilityDimension           // 劣势能力 (评分 < 30)
	Traits     []string                        // 特征标签
}

// RoleSuitability 角色适配度
type RoleSuitability struct {
	Role  string  // 角色名
	Score float64 // 适配评分 (0-100)
}

// ProfileAgent 根据 daemon Agent 类型和能力信息生成能力画像
// agentType: daemon 运行时标识 (如 "claude", "codex", "cursor-agent")
// agentName: 人类可读名称
// capabilities: 来自 AgentRuntime.Capability 的能力信息
func ProfileAgent(agentType string, agentName string, capabilities protocol.AgentCapability) *AgentProfile {
	profile := &AgentProfile{
		AgentType: agentType,
		AgentName: agentName,
		Scores:    make(map[CapabilityDimension]float64),
	}

	// 基于运行时类型的已知特性进行评分
	profile.scoreByRuntimeType()

	// 基于已配置的 Skills 调整评分
	profile.adjustBySkills(capabilities.Skills)

	// 基于已配置的 Designs 调整评分
	profile.adjustByDesigns(capabilities.Designs)

	// 计算优势和劣势
	profile.categorize()

	return profile
}

// scoreByRuntimeType 基于 Agent 运行时类型的内置特性评分
func (p *AgentProfile) scoreByRuntimeType() {
	rt := strings.ToLower(p.AgentType)

	switch {
	// === Claude Code ===
	// 特性：stream-json 流式输出、会话恢复、MCP 注入、partial messages
	// 模型：sonnet/opus/haiku 系列，擅长创意设计、深度推理
	// 适用角色：designer, polisher, reviewer
	case rt == "claude" || rt == "claude-code":
		p.Scores[DimCreativeDesign] = 90
		p.Scores[DimCodeGen] = 75
		p.Scores[DimContentWriting] = 85
		p.Scores[DimCriticalReview] = 80
		p.Scores[DimSystemOps] = 65
		p.Scores[DimFastIteration] = 70
		p.Scores[DimDeepReasoning] = 85
		p.Scores[DimChineseContent] = 60
		p.Traits = []string{"session_resume", "mcp_injection", "partial_messages", "stream_json"}

	// === Codex CLI ===
	// 特性：7 级推理控制、沙箱权限、GPT-5.x/o3/o4 模型
	// 模型：GPT 系列，擅长代码生成、深度推理
	// 适用角色：developer, codegen, reviewer
	case rt == "codex":
		p.Scores[DimCreativeDesign] = 55
		p.Scores[DimCodeGen] = 95
		p.Scores[DimContentWriting] = 60
		p.Scores[DimCriticalReview] = 70
		p.Scores[DimSystemOps] = 90
		p.Scores[DimFastIteration] = 65
		p.Scores[DimDeepReasoning] = 90
		p.Scores[DimChineseContent] = 40
		p.Traits = []string{"reasoning_control", "sandbox", "code_specialized", "gpt_models"}

	// === Cursor Agent ===
	// 特性：--trust flag、会话恢复、sonnet-4/gpt-5 模型
	// 适用角色：developer, reviewer
	case rt == "cursor-agent":
		p.Scores[DimCreativeDesign] = 60
		p.Scores[DimCodeGen] = 85
		p.Scores[DimContentWriting] = 55
		p.Scores[DimCriticalReview] = 75
		p.Scores[DimSystemOps] = 70
		p.Scores[DimFastIteration] = 60
		p.Scores[DimDeepReasoning] = 75
		p.Scores[DimChineseContent] = 40
		p.Traits = []string{"trust_mode", "session_resume", "ide_integration"}

	// === GitHub Copilot CLI ===
	// 特性：30 分钟长超时、claude-sonnet-4.6/gpt-5.2 模型
	// 适用角色：developer（适合长时间的 deck 生成等任务）
	case rt == "copilot":
		p.Scores[DimCreativeDesign] = 55
		p.Scores[DimCodeGen] = 80
		p.Scores[DimContentWriting] = 55
		p.Scores[DimCriticalReview] = 60
		p.Scores[DimSystemOps] = 65
		p.Scores[DimFastIteration] = 50
		p.Scores[DimDeepReasoning] = 70
		p.Scores[DimChineseContent] = 40
		p.Traits = []string{"long_timeout", "deck_friendly"}

	// === Gemini CLI ===
	// 特性：工作区信任、Gemini 3 Pro/Flash/2.5 系列、多模态
	// 模型：gemini 系列，擅长多模态内容、长上下文处理
	// 适用角色：copywriter, reviewer
	case rt == "gemini":
		p.Scores[DimCreativeDesign] = 70
		p.Scores[DimCodeGen] = 60
		p.Scores[DimContentWriting] = 85
		p.Scores[DimCriticalReview] = 75
		p.Scores[DimSystemOps] = 55
		p.Scores[DimFastIteration] = 80
		p.Scores[DimDeepReasoning] = 70
		p.Scores[DimChineseContent] = 50
		p.Traits = []string{"multimodal", "large_context", "fast_inference"}

	// === Kimi CLI ===
	// 特性：-p 参数传递（限 30KB）、kimi-k2-turbo/moonshot 模型
	// 模型：Moonshot 系列，中文优化
	// 适用角色：copywriter (中文), reviewer (中文)
	case rt == "kimi":
		p.Scores[DimCreativeDesign] = 50
		p.Scores[DimCodeGen] = 50
		p.Scores[DimContentWriting] = 75
		p.Scores[DimCriticalReview] = 60
		p.Scores[DimSystemOps] = 40
		p.Scores[DimFastIteration] = 55
		p.Scores[DimDeepReasoning] = 50
		p.Scores[DimChineseContent] = 95
		p.Traits = []string{"chinese_optimized", "moonshot_models", "limited_prompt_size"}

	// === DeepSeek TUI ===
	// 模型：deepseek-chat/deepseek-reasoner，推理能力强
	// 适用角色：developer, reviewer
	case rt == "deepseek":
		p.Scores[DimCreativeDesign] = 55
		p.Scores[DimCodeGen] = 85
		p.Scores[DimContentWriting] = 60
		p.Scores[DimCriticalReview] = 70
		p.Scores[DimSystemOps] = 65
		p.Scores[DimFastIteration] = 60
		p.Scores[DimDeepReasoning] = 85
		p.Scores[DimChineseContent] = 85
		p.Traits = []string{"deep_reasoning", "chinese_support", "strong_code"}

	// === OpenCode ===
	// 特性：会话恢复、model list 探测
	// 适用角色：developer
	case rt == "opencode":
		p.Scores[DimCreativeDesign] = 45
		p.Scores[DimCodeGen] = 80
		p.Scores[DimContentWriting] = 45
		p.Scores[DimCriticalReview] = 55
		p.Scores[DimSystemOps] = 60
		p.Scores[DimFastIteration] = 55
		p.Scores[DimDeepReasoning] = 65
		p.Scores[DimChineseContent] = 35
		p.Traits = []string{"session_resume", "open_source"}

	// === Qwen CLI ===
	// 模型：通义千问系列，中文 + 代码都强
	// 适用角色：developer, copywriter (中文)
	case rt == "qwen":
		p.Scores[DimCreativeDesign] = 55
		p.Scores[DimCodeGen] = 80
		p.Scores[DimContentWriting] = 75
		p.Scores[DimCriticalReview] = 60
		p.Scores[DimSystemOps] = 55
		p.Scores[DimFastIteration] = 60
		p.Scores[DimDeepReasoning] = 70
		p.Scores[DimChineseContent] = 90
		p.Traits = []string{"chinese_optimized", "tongyi_models"}

	// === Hermes ===
	// 特性：ACP 协议、multi-agent 模型、Grok 系列
	// 适用角色：developer, system ops
	case rt == "hermes":
		p.Scores[DimCreativeDesign] = 50
		p.Scores[DimCodeGen] = 70
		p.Scores[DimContentWriting] = 50
		p.Scores[DimCriticalReview] = 55
		p.Scores[DimSystemOps] = 85
		p.Scores[DimFastIteration] = 65
		p.Scores[DimDeepReasoning] = 70
		p.Scores[DimChineseContent] = 35
		p.Traits = []string{"acp_protocol", "multi_agent_model", "mcp_merge"}

	// === Cline ===
	// 特性：会话恢复、VS Code 集成
	// 适用角色：developer
	case rt == "cline":
		p.Scores[DimCreativeDesign] = 50
		p.Scores[DimCodeGen] = 75
		p.Scores[DimContentWriting] = 45
		p.Scores[DimCriticalReview] = 55
		p.Scores[DimSystemOps] = 60
		p.Scores[DimFastIteration] = 55
		p.Scores[DimDeepReasoning] = 65
		p.Scores[DimChineseContent] = 40
		p.Traits = []string{"session_resume", "vscode_integration"}

	// === Trae ===
	// 适用角色：developer, copywriter (中文)
	case rt == "trae":
		p.Scores[DimCreativeDesign] = 55
		p.Scores[DimCodeGen] = 75
		p.Scores[DimContentWriting] = 70
		p.Scores[DimCriticalReview] = 55
		p.Scores[DimSystemOps] = 50
		p.Scores[DimFastIteration] = 55
		p.Scores[DimDeepReasoning] = 60
		p.Scores[DimChineseContent] = 85
		p.Traits = []string{"chinese_support", "byte_dance"}

	// === Pi Agent ===
	case rt == "pi-agent" || rt == "pi_agent":
		p.Scores[DimCreativeDesign] = 50
		p.Scores[DimCodeGen] = 70
		p.Scores[DimContentWriting] = 50
		p.Scores[DimCriticalReview] = 50
		p.Scores[DimSystemOps] = 55
		p.Scores[DimFastIteration] = 50
		p.Scores[DimDeepReasoning] = 55
		p.Scores[DimChineseContent] = 40
		p.Traits = []string{"general_purpose"}

	// === Mistral Vibe ===
	case rt == "mistral-vibe" || rt == "mistral":
		p.Scores[DimCreativeDesign] = 60
		p.Scores[DimCodeGen] = 65
		p.Scores[DimContentWriting] = 70
		p.Scores[DimCriticalReview] = 55
		p.Scores[DimSystemOps] = 50
		p.Scores[DimFastIteration] = 60
		p.Scores[DimDeepReasoning] = 60
		p.Scores[DimChineseContent] = 35
		p.Traits = []string{"european_models"}

	// === Qoder ===
	case rt == "qoder":
		p.Scores[DimCreativeDesign] = 45
		p.Scores[DimCodeGen] = 70
		p.Scores[DimContentWriting] = 45
		p.Scores[DimCriticalReview] = 50
		p.Scores[DimSystemOps] = 55
		p.Scores[DimFastIteration] = 50
		p.Scores[DimDeepReasoning] = 55
		p.Scores[DimChineseContent] = 35
		p.Traits = []string{"code_focused"}

	// === OpenClaw ===
	case rt == "openclaw":
		p.Scores[DimCreativeDesign] = 55
		p.Scores[DimCodeGen] = 70
		p.Scores[DimContentWriting] = 55
		p.Scores[DimCriticalReview] = 55
		p.Scores[DimSystemOps] = 60
		p.Scores[DimFastIteration] = 55
		p.Scores[DimDeepReasoning] = 60
		p.Scores[DimChineseContent] = 40
		p.Traits = []string{"open_source", "claude_compatible"}

	// 默认：未知 Agent 给中等评分
	default:
		p.Scores[DimCreativeDesign] = 50
		p.Scores[DimCodeGen] = 50
		p.Scores[DimContentWriting] = 50
		p.Scores[DimCriticalReview] = 50
		p.Scores[DimSystemOps] = 50
		p.Scores[DimFastIteration] = 50
		p.Scores[DimDeepReasoning] = 50
		p.Scores[DimChineseContent] = 50
		p.Traits = []string{"unknown"}
	}
}

// adjustBySkills 根据已绑定的 Skills 调整能力评分
func (p *AgentProfile) adjustBySkills(skills []string) {
	for _, skill := range skills {
		lower := strings.ToLower(skill)
		switch {
		case strings.Contains(lower, "design") || strings.Contains(lower, "layout") ||
			strings.Contains(lower, "ui") || strings.Contains(lower, "ux") ||
			strings.Contains(lower, "prototype") || strings.Contains(lower, "hero"):
			p.Scores[DimCreativeDesign] += 5
		case strings.Contains(lower, "code") || strings.Contains(lower, "tailwind") ||
			strings.Contains(lower, "css") || strings.Contains(lower, "html") ||
			strings.Contains(lower, "react") || strings.Contains(lower, "vue"):
			p.Scores[DimCodeGen] += 5
		case strings.Contains(lower, "copy") || strings.Contains(lower, "writing") ||
			strings.Contains(lower, "seo") || strings.Contains(lower, "brand"):
			p.Scores[DimContentWriting] += 5
		case strings.Contains(lower, "review") || strings.Contains(lower, "critique") ||
			strings.Contains(lower, "accessibility") || strings.Contains(lower, "audit"):
			p.Scores[DimCriticalReview] += 5
		}
	}
	// 限制上限 100
	p.clampScores()
}

// adjustByDesigns 根据已绑定的 Design Systems 调整评分
func (p *AgentProfile) adjustByDesigns(designs []string) {
	for _, design := range designs {
		lower := strings.ToLower(design)
		switch {
		case strings.Contains(lower, "chinese") || strings.Contains(lower, "wechat") ||
			strings.Contains(lower, "alipay") || strings.Contains(lower, "baidu"):
			p.Scores[DimChineseContent] += 5
		case strings.Contains(lower, "apple") || strings.Contains(lower, "ios") ||
			strings.Contains(lower, "material") || strings.Contains(lower, "google"):
			p.Scores[DimCreativeDesign] += 3
		}
	}
	p.clampScores()
}

// clampScores 限制评分在 0-100 范围内
func (p *AgentProfile) clampScores() {
	for k, v := range p.Scores {
		if v > 100 {
			p.Scores[k] = 100
		}
		if v < 0 {
			p.Scores[k] = 0
		}
	}
}

// categorize 计算优势能力和劣势能力
func (p *AgentProfile) categorize() {
	p.Strengths = nil
	p.Weaknesses = nil
	for dim, score := range p.Scores {
		if score >= 70 {
			p.Strengths = append(p.Strengths, dim)
		} else if score < 30 {
			p.Weaknesses = append(p.Weaknesses, dim)
		}
	}
}

// CapabilityLabels 将能力维度列表转为中文标签
func CapabilityLabels(dims []CapabilityDimension) []string {
	labels := make([]string, len(dims))
	for i, d := range dims {
		switch d {
		case DimCreativeDesign:
			labels[i] = "创意设计"
		case DimCodeGen:
			labels[i] = "代码生成"
		case DimContentWriting:
			labels[i] = "内容写作"
		case DimCriticalReview:
			labels[i] = "批判评审"
		case DimSystemOps:
			labels[i] = "系统操作"
		case DimFastIteration:
			labels[i] = "快速迭代"
		case DimDeepReasoning:
			labels[i] = "深度推理"
		case DimChineseContent:
			labels[i] = "中文内容"
		default:
			labels[i] = string(d)
		}
	}
	return labels
}

// TopStrengths 返回前 N 个优势能力（按评分降序）
func (p *AgentProfile) TopStrengths(n int) []CapabilityDimension {
	type dimScore struct {
		dim   CapabilityDimension
		score float64
	}
	var ranked []dimScore
	for _, s := range p.Strengths {
		ranked = append(ranked, dimScore{s, p.Scores[s]})
	}
	// Bubble sort by score desc (n is small, typically <= 3)
	for i := 0; i < len(ranked); i++ {
		for j := i + 1; j < len(ranked); j++ {
			if ranked[j].score > ranked[i].score {
				ranked[i], ranked[j] = ranked[j], ranked[i]
			}
		}
	}
	if len(ranked) > n {
		ranked = ranked[:n]
	}
	result := make([]CapabilityDimension, len(ranked))
	for i, ds := range ranked {
		result[i] = ds.dim
	}
	return result
}
