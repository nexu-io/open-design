// Package profiler 角色-能力映射引擎
// 为 7 种团队协作模式提供智能角色分配策略
package profiler

import (
	"fmt"
	"sort"
	"strings"

	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// TeamRole 团队角色定义
type TeamRole struct {
	ID            string                // 角色 ID (designer, developer, copywriter, reviewer, polisher, generator)
	Name          string                // 中文名称
	RequiredCaps  []CapabilityDimension // 必需的能力维度（权重最高）
	PreferredCaps []CapabilityDimension // 偏好能力维度
	MinScore      float64               // 最低适配评分 (0-100)
}

// 预定义团队角色
var (
	RoleDesigner = TeamRole{
		ID:            "designer",
		Name:          "设计师",
		RequiredCaps:  []CapabilityDimension{DimCreativeDesign},
		PreferredCaps: []CapabilityDimension{DimContentWriting, DimFastIteration},
		MinScore:      60,
	}
	RoleDeveloper = TeamRole{
		ID:            "developer",
		Name:          "开发者",
		RequiredCaps:  []CapabilityDimension{DimCodeGen},
		PreferredCaps: []CapabilityDimension{DimSystemOps, DimDeepReasoning},
		MinScore:      60,
	}
	RoleCopywriter = TeamRole{
		ID:            "copywriter",
		Name:          "文案写手",
		RequiredCaps:  []CapabilityDimension{DimContentWriting},
		PreferredCaps: []CapabilityDimension{DimChineseContent, DimCreativeDesign},
		MinScore:      60,
	}
	RoleReviewer = TeamRole{
		ID:            "reviewer",
		Name:          "评审者",
		RequiredCaps:  []CapabilityDimension{DimCriticalReview, DimDeepReasoning},
		PreferredCaps: []CapabilityDimension{DimCodeGen, DimCreativeDesign},
		MinScore:      55,
	}
	RolePolisher = TeamRole{
		ID:            "polisher",
		Name:          "精修者",
		RequiredCaps:  []CapabilityDimension{DimCreativeDesign},
		PreferredCaps: []CapabilityDimension{DimContentWriting, DimFastIteration},
		MinScore:      55,
	}
	RoleGenerator = TeamRole{
		ID:            "generator",
		Name:          "生成器",
		RequiredCaps:  []CapabilityDimension{DimCreativeDesign, DimContentWriting},
		PreferredCaps: []CapabilityDimension{DimFastIteration, DimChineseContent},
		MinScore:      55,
	}
	RoleSynthesizer = TeamRole{
		ID:            "synthesizer",
		Name:          "综合器",
		RequiredCaps:  []CapabilityDimension{DimDeepReasoning, DimCriticalReview},
		PreferredCaps: []CapabilityDimension{DimContentWriting, DimCodeGen},
		MinScore:      55,
	}
)

// CalculateRoleScore 计算 Agent 对某个角色的适配评分
func (p *AgentProfile) CalculateRoleScore(role TeamRole) float64 {
	if len(role.RequiredCaps) == 0 {
		return 50
	}

	// 必需能力权重 60%，偏好能力权重 40%
	var requiredScore, preferredScore float64

	// 必需能力评分（不达标直接大幅扣分）
	requiredCount := 0
	for _, cap := range role.RequiredCaps {
		score := p.Scores[cap]
		requiredScore += score
		requiredCount++
		if score < role.MinScore {
			// 关键能力不足，惩罚
			requiredScore -= (role.MinScore - score) * 1.5
		}
	}
	if requiredCount > 0 {
		requiredScore = requiredScore / float64(requiredCount)
	}

	// 偏好能力评分
	if len(role.PreferredCaps) > 0 {
		for _, cap := range role.PreferredCaps {
			preferredScore += p.Scores[cap]
		}
		preferredScore = preferredScore / float64(len(role.PreferredCaps))
	}

	total := requiredScore*0.6 + preferredScore*0.4
	if total < 0 {
		total = 0
	}
	if total > 100 {
		total = 100
	}
	return total
}

// FindBestRole 找到 Agent 最适合的角色
func (p *AgentProfile) FindBestRole() (TeamRole, float64) {
	roles := []TeamRole{
		RoleDesigner, RoleDeveloper, RoleCopywriter,
		RoleReviewer, RolePolisher, RoleGenerator, RoleSynthesizer,
	}

	var bestRole TeamRole
	bestScore := -1.0
	for _, role := range roles {
		score := p.CalculateRoleScore(role)
		if score > bestScore {
			bestScore = score
			bestRole = role
		}
	}
	return bestRole, bestScore
}

// RankRoles 按适配度从高到低排列所有角色
func (p *AgentProfile) RankRoles() []RoleSuitability {
	roles := []TeamRole{
		RoleDesigner, RoleDeveloper, RoleCopywriter,
		RoleReviewer, RolePolisher, RoleGenerator, RoleSynthesizer,
	}

	var rankings []RoleSuitability
	for _, role := range roles {
		score := p.CalculateRoleScore(role)
		rankings = append(rankings, RoleSuitability{Role: role.ID, Score: score})
	}

	sort.Slice(rankings, func(i, j int) bool {
		return rankings[i].Score > rankings[j].Score
	})

	return rankings
}

// === 7 种协作模式的智能组队策略 ===

// TeamAssignment 组队分配结果
type TeamAssignment struct {
	AgentID   string  // Agent ID (YAML 中的 id)
	AgentType string  // daemon 运行时类型
	Role      string  // 分配的角色
	Score     float64 // 角色适配评分
	Reason    string  // 分配理由
}

// AssignmentStrategy 组队策略类型
type AssignmentStrategy string

const (
	StrategyBestFit      AssignmentStrategy = "best_fit"      // 最佳匹配（默认）
	StrategyDiverseRoles AssignmentStrategy = "diverse_roles" // 角色多样化，每个 Agent 只用一个角色
	StrategyChainExperts AssignmentStrategy = "chain_experts" // 专家链，按序分配不重叠
	StrategySpecialized  AssignmentStrategy = "specialized"   // 专精分配，必需能力不达标则跳过
	StrategyLayered      AssignmentStrategy = "layered"       // 分层分配
)

// TeamBuilder 团队构建器
type TeamBuilder struct {
	profiles   map[string]*AgentProfile // agentID -> profile
	agentTypes map[string]string        // agentID -> daemon type
}

// NewTeamBuilder 创建团队构建器
func NewTeamBuilder() *TeamBuilder {
	return &TeamBuilder{
		profiles:   make(map[string]*AgentProfile),
		agentTypes: make(map[string]string),
	}
}

// RegisterAgent 注册 Agent 及其能力画像
func (tb *TeamBuilder) RegisterAgent(agentID, agentType, agentName string, capabilities protocol.AgentCapability) {
	profile := ProfileAgent(agentType, agentName, capabilities)
	tb.profiles[agentID] = profile
	tb.agentTypes[agentID] = agentType
}

// GetProfile 获取 Agent 画像
func (tb *TeamBuilder) GetProfile(agentID string) *AgentProfile {
	return tb.profiles[agentID]
}

// BuildParallelTeam 构建并行模式团队
// 策略：根据任务需求，为每个任务分配最匹配的 Agent
// 如果有 N 个 Agent 和 M 个角色需求，为每个角色找最佳匹配
func (tb *TeamBuilder) BuildParallelTeam(requiredRoles []string) []TeamAssignment {
	return tb.assignByStrategy(requiredRoles, StrategyBestFit)
}

// BuildSerialTeam 构建串行模式团队
// 策略：按阶段顺序，每个阶段分配最专精的 Agent
// 前一阶段产出作为后一阶段输入，需要 Agent 能理解上游成果
func (tb *TeamBuilder) BuildSerialTeam(requiredRoles []string) []TeamAssignment {
	return tb.assignByStrategy(requiredRoles, StrategyChainExperts)
}

// BuildGeneticTeam 构建遗传模式团队
// 策略：选择一个综合能力最强的 Agent 作为"变异引擎"
// 需要强代码+设计+推理能力来生成和评估多个变体
func (tb *TeamBuilder) BuildGeneticTeam() TeamAssignment {
	// 遗传模式只需要一个 Agent 来生成多个变体
	// 优先选择 DeepReasoning + CreativeDesign 都高的
	var bestAgent string
	bestScore := -1.0

	for id, profile := range tb.profiles {
		// 综合评分：深度推理 40% + 创意设计 30% + 代码 30%
		score := profile.Scores[DimDeepReasoning]*0.4 +
			profile.Scores[DimCreativeDesign]*0.3 +
			profile.Scores[DimCodeGen]*0.3
		if score > bestScore {
			bestScore = score
			bestAgent = id
		}
	}

	if bestAgent != "" {
		profile := tb.profiles[bestAgent]
		bestRole, roleScore := profile.FindBestRole()
		return TeamAssignment{
			AgentID:   bestAgent,
			AgentType: tb.agentTypes[bestAgent],
			Role:      bestRole.ID,
			Score:     roleScore,
			Reason: fmt.Sprintf("综合能力最强 (推理:%.0f 设计:%.0f 代码:%.0f)，适合多代进化",
				profile.Scores[DimDeepReasoning], profile.Scores[DimCreativeDesign], profile.Scores[DimCodeGen]),
		}
	}

	return TeamAssignment{}
}

// BuildInheritanceTeam 构建继承模式团队
// 策略：按继承链从粗到细分配
//
//	Root: 创意设计最强的 Agent（打草稿）
//	Child: 精修能力最强的 Agent（细化优化）
//	Leaf: 代码能力最强的 Agent（生成最终代码）
func (tb *TeamBuilder) BuildInheritanceTeam() []TeamAssignment {
	roles := []string{"designer", "polisher", "developer"}
	return tb.assignByStrategy(roles, StrategyChainExperts)
}

// BuildHybridTeam 构建混合模式团队
// 策略：按任务层级分层，每层内用 BestFit
// Layer 0 (并行): 多样角色各自发挥
// Layer 1+ (串行): 根据前层产物选择后续角色
func (tb *TeamBuilder) BuildHybridTeam(requiredRoles []string) []TeamAssignment {
	return tb.assignByStrategy(requiredRoles, StrategyLayered)
}

// BuildComplementaryTeam 构建互补模式团队
// 策略：专家链，每阶段确保不重叠
// 设计师 → 文案 → 开发者 → 评审者
// 每位专家只做自己专长的事，不重复前人的工作
func (tb *TeamBuilder) BuildComplementaryTeam() []TeamAssignment {
	roles := []string{"designer", "copywriter", "developer", "reviewer"}
	return tb.assignByStrategy(roles, StrategyDiverseRoles)
}

// BuildCycleTeam 构建循环模式团队
// 策略：配对角色，Generator 需要创意+内容能力，Reviewer 需要批判+推理能力
func (tb *TeamBuilder) BuildCycleTeam() []TeamAssignment {
	var assignments []TeamAssignment

	// Generator: 创意内容生成
	genRole := RoleGenerator
	var genAgent string
	genBest := -1.0
	for id, profile := range tb.profiles {
		score := profile.CalculateRoleScore(genRole)
		if score > genBest {
			genBest = score
			genAgent = id
		}
	}

	// Reviewer: 批判评审（排除 Generator 使用的 Agent）
	revRole := RoleReviewer
	var revAgent string
	revBest := -1.0
	for id, profile := range tb.profiles {
		if id == genAgent {
			continue // 确保不同 Agent
		}
		score := profile.CalculateRoleScore(revRole)
		if score > revBest {
			revBest = score
			revAgent = id
		}
	}

	if genAgent != "" {
		assignments = append(assignments, TeamAssignment{
			AgentID:   genAgent,
			AgentType: tb.agentTypes[genAgent],
			Role:      "generator",
			Score:     genBest,
			Reason:    fmt.Sprintf("创意生成能力最强，适合产出初稿"),
		})
	}
	if revAgent != "" {
		assignments = append(assignments, TeamAssignment{
			AgentID:   revAgent,
			AgentType: tb.agentTypes[revAgent],
			Role:      "reviewer",
			Score:     revBest,
			Reason:    fmt.Sprintf("批判评审能力最强，适合质量把关"),
		})
	}

	return assignments
}

// assignByStrategy 通用角色分配方法
func (tb *TeamBuilder) assignByStrategy(requiredRoles []string, strategy AssignmentStrategy) []TeamAssignment {
	available := make(map[string]*AgentProfile)
	for id, p := range tb.profiles {
		available[id] = p
	}

	var assignments []TeamAssignment
	usedAgents := make(map[string]bool)

	for _, roleID := range requiredRoles {
		targetRole := roleByName(roleID)
		if targetRole == nil {
			continue
		}

		bestAgent, bestScore := tb.findBestForRole(*targetRole, available, usedAgents, strategy)
		if bestAgent == "" {
			continue
		}

		profile := available[bestAgent]
		assignments = append(assignments, TeamAssignment{
			AgentID:   bestAgent,
			AgentType: tb.agentTypes[bestAgent],
			Role:      roleID,
			Score:     bestScore,
			Reason: fmt.Sprintf("在「%s」角色上评分最高 (%.0f/100)，优势: %s",
				targetRole.Name, bestScore, formatStrengths(profile.TopStrengths(2))),
		})

		// 根据策略决定是否允许 Agent 被复用
		if strategy == StrategyDiverseRoles || strategy == StrategyChainExperts {
			usedAgents[bestAgent] = true
			delete(available, bestAgent)
		}
	}

	return assignments
}

// findBestForRole 为指定角色找到最佳 Agent
func (tb *TeamBuilder) findBestForRole(role TeamRole, available map[string]*AgentProfile, used map[string]bool, strategy AssignmentStrategy) (string, float64) {
	var bestAgent string
	bestScore := -1.0

	for id, profile := range available {
		if used[id] {
			continue
		}
		score := profile.CalculateRoleScore(role)

		// 策略调整
		switch strategy {
		case StrategyDiverseRoles:
			// 偏好使用不同 Agent，增加多样性
			// 不做额外调整，通过 usedAgents 实现
		case StrategySpecialized:
			// 专精策略：更看重必需能力
			requiredAvg := 0.0
			for _, cap := range role.RequiredCaps {
				requiredAvg += profile.Scores[cap]
			}
			if len(role.RequiredCaps) > 0 {
				requiredAvg /= float64(len(role.RequiredCaps))
			}
			if requiredAvg < role.MinScore {
				continue // 必需能力不达标，跳过
			}
		}

		if score > bestScore {
			bestScore = score
			bestAgent = id
		}
	}

	return bestAgent, bestScore
}

// roleByName 根据角色 ID 查找角色定义
func roleByName(roleID string) *TeamRole {
	switch strings.ToLower(roleID) {
	case "designer", "initial_designer":
		return &RoleDesigner
	case "developer", "codegen":
		return &RoleDeveloper
	case "copywriter", "writer":
		return &RoleCopywriter
	case "reviewer":
		return &RoleReviewer
	case "polisher":
		return &RolePolisher
	case "generator":
		return &RoleGenerator
	case "synthesizer":
		return &RoleSynthesizer
	default:
		return nil
	}
}

// formatStrengths 格式化优势能力列表
func formatStrengths(strengths []CapabilityDimension) string {
	labels := make([]string, len(strengths))
	for i, s := range strengths {
		labels[i] = capLabel(s)
	}
	return strings.Join(labels, "、")
}

// capLabel 能力维度中文标签
func capLabel(dim CapabilityDimension) string {
	switch dim {
	case DimCreativeDesign:
		return "创意设计"
	case DimCodeGen:
		return "代码生成"
	case DimContentWriting:
		return "内容写作"
	case DimCriticalReview:
		return "批判评审"
	case DimSystemOps:
		return "系统操作"
	case DimFastIteration:
		return "快速迭代"
	case DimDeepReasoning:
		return "深度推理"
	case DimChineseContent:
		return "中文内容"
	default:
		return string(dim)
	}
}

// RoleByName 导出：根据角色名称（如 "设计师"、"视觉设计"）查找角色定义
func RoleByName(roleName string) TeamRole {
	lower := strings.ToLower(roleName)

	// 先尝试精确匹配角色 ID
	if r := roleByName(lower); r != nil {
		return *r
	}

	// 模糊匹配：检查角色名称是否包含关键字
	switch {
	case strings.Contains(lower, "设计") || strings.Contains(lower, "design"):
		return RoleDesigner
	case strings.Contains(lower, "开发") || strings.Contains(lower, "dev") || strings.Contains(lower, "代码") || strings.Contains(lower, "code"):
		return RoleDeveloper
	case strings.Contains(lower, "文案") || strings.Contains(lower, "写作") || strings.Contains(lower, "创作") || strings.Contains(lower, "内容") || strings.Contains(lower, "copy") || strings.Contains(lower, "write"):
		return RoleCopywriter
	case strings.Contains(lower, "评审") || strings.Contains(lower, "审查") || strings.Contains(lower, "review"):
		return RoleReviewer
	case strings.Contains(lower, "精修") || strings.Contains(lower, "打磨") || strings.Contains(lower, "polish"):
		return RolePolisher
	case strings.Contains(lower, "生成") || strings.Contains(lower, "generat"):
		return RoleGenerator
	case strings.Contains(lower, "综合") || strings.Contains(lower, "synthes"):
		return RoleSynthesizer
	default:
		return RoleDeveloper // 默认返回开发者角色
	}
}

// FindBestAgentType 为指定角色找到最佳 Agent 运行时类型
// 遍历已知 Agent 类型，用临时画像计算角色适配度，排除已使用的类型
func (tb *TeamBuilder) FindBestAgentType(role TeamRole, usedTypes map[string]bool) string {
	bestType := ""
	bestScore := -1.0

	knownTypes := []string{
		"claude", "codex", "cursor-agent", "copilot", "gemini", "kimi",
		"deepseek", "opencode", "qwen", "hermes", "cline", "trae",
	}

	for _, at := range knownTypes {
		if usedTypes[at] {
			continue
		}
		// 为每种类型创建临时画像来计算角色适配度
		p := ProfileAgent(at, at, protocol.AgentCapability{})
		score := p.CalculateRoleScore(role)
		if score > bestScore {
			bestScore = score
			bestType = at
		}
	}

	return bestType
}

// ProfileSummary 返回 Agent 画像的可读摘要
func (p *AgentProfile) ProfileSummary() string {
	var parts []string
	parts = append(parts, fmt.Sprintf("%s (%s)", p.AgentName, p.AgentType))

	bestRole, score := p.FindBestRole()
	parts = append(parts, fmt.Sprintf("最佳角色: %s (%.0f/100)", bestRole.Name, score))

	if len(p.Strengths) > 0 {
		var sList []string
		for _, s := range p.Strengths[:min(3, len(p.Strengths))] {
			sList = append(sList, capLabel(s))
		}
		parts = append(parts, fmt.Sprintf("优势: %s", strings.Join(sList, "、")))
	}

	if len(p.Traits) > 0 {
		parts = append(parts, fmt.Sprintf("特征: %s", strings.Join(p.Traits, ", ")))
	}

	return strings.Join(parts, " | ")
}
