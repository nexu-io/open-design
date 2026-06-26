package profiler

import (
	"testing"

	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

func TestProfileAgent(t *testing.T) {
	tests := []struct {
		agentType    string
		wantStrength CapabilityDimension
		wantScoreMin float64
	}{
		{"claude", DimCreativeDesign, 85},
		{"codex", DimCodeGen, 90},
		{"gemini", DimContentWriting, 80},
		{"kimi", DimChineseContent, 90},
		{"cursor-agent", DimCodeGen, 80},
		{"deepseek", DimDeepReasoning, 80},
		{"qwen", DimChineseContent, 85},
	}

	for _, tt := range tests {
		t.Run(tt.agentType, func(t *testing.T) {
			p := ProfileAgent(tt.agentType, tt.agentType, protocol.AgentCapability{})
			if p.Scores[tt.wantStrength] < tt.wantScoreMin {
				t.Errorf("%s: %s score = %.0f, want >= %.0f",
					tt.agentType, tt.wantStrength, p.Scores[tt.wantStrength], tt.wantScoreMin)
			}
		})
	}
}

func TestFindBestRole(t *testing.T) {
	// Claude 应该最适合 Designer
	claude := ProfileAgent("claude", "Claude Code", protocol.AgentCapability{})
	bestRole, score := claude.FindBestRole()
	if bestRole.ID != "designer" {
		t.Errorf("claude best role = %s, want designer", bestRole.ID)
	}
	if score < 70 {
		t.Errorf("claude designer score = %.0f, want >= 70", score)
	}

	// Codex 应该最适合 Developer
	codex := ProfileAgent("codex", "Codex CLI", protocol.AgentCapability{})
	bestRole2, score2 := codex.FindBestRole()
	if bestRole2.ID != "developer" {
		t.Errorf("codex best role = %s, want developer", bestRole2.ID)
	}
	if score2 < 70 {
		t.Errorf("codex developer score = %.0f, want >= 70", score2)
	}

	// Kimi 应该最适合 Copywriter（中文优化）
	kimi := ProfileAgent("kimi", "Kimi CLI", protocol.AgentCapability{})
	bestRole3, score3 := kimi.FindBestRole()
	if bestRole3.ID != "copywriter" {
		t.Errorf("kimi best role = %s, want copywriter", bestRole3.ID)
	}
	if score3 < 60 {
		t.Errorf("kimi copywriter score = %.0f, want >= 60", score3)
	}
}

func TestTeamBuilderAssignment(t *testing.T) {
	builder := NewTeamBuilder()

	// 注册几个 Agent
	builder.RegisterAgent("agent1", "claude", "Claude Code", protocol.AgentCapability{
		Name:   "Claude Code",
		Skills: []string{"hero-section", "layout-design"},
	})
	builder.RegisterAgent("agent2", "codex", "Codex CLI", protocol.AgentCapability{
		Name:   "Codex CLI",
		Skills: []string{"tailwind-css", "html-css"},
	})
	builder.RegisterAgent("agent3", "gemini", "Gemini CLI", protocol.AgentCapability{
		Name:   "Gemini CLI",
		Skills: []string{"brand-copywriting"},
	})
	builder.RegisterAgent("agent4", "kimi", "Kimi CLI", protocol.AgentCapability{
		Name:   "Kimi CLI",
		Skills: []string{"copy-review"},
	})

	// 测试互补团队构建
	assignments := builder.BuildComplementaryTeam()
	if len(assignments) != 4 {
		t.Fatalf("complementary team size = %d, want 4", len(assignments))
	}

	// designer 应该是 claude
	if assignments[0].Role != "designer" || assignments[0].AgentType != "claude" {
		t.Errorf("designer = %s(%s), want designer(claude)", assignments[0].Role, assignments[0].AgentType)
	}

	// developer 应该是 codex
	if assignments[2].Role != "developer" || assignments[2].AgentType != "codex" {
		t.Errorf("developer = %s(%s), want developer(codex)", assignments[2].Role, assignments[2].AgentType)
	}

	// 测试循环团队构建
	cycleAssignments := builder.BuildCycleTeam()
	if len(cycleAssignments) != 2 {
		t.Fatalf("cycle team size = %d, want 2", len(cycleAssignments))
	}

	// generator 和 reviewer 必须不同
	if cycleAssignments[0].AgentID == cycleAssignments[1].AgentID {
		t.Error("generator and reviewer must be different agents")
	}

	// 测试遗传团队
	geneticAssigment := builder.BuildGeneticTeam()
	if geneticAssigment.AgentID == "" {
		t.Error("genetic team must have an assignment")
	}
}

func TestRoleByName(t *testing.T) {
	tests := []struct {
		input    string
		wantRole string
	}{
		{"设计师", "designer"},
		{"设计师", "designer"},
		{"UI Designer", "designer"},
		{"前端开发", "developer"},
		{"代码生成", "developer"},
		{"文案写手", "copywriter"},
		{"内容创作", "copywriter"},
		{"评审", "reviewer"},
		{"质量审查", "reviewer"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			role := RoleByName(tt.input)
			if role.ID != tt.wantRole {
				t.Errorf("RoleByName(%q) = %s, want %s", tt.input, role.ID, tt.wantRole)
			}
		})
	}
}

func TestCapabilityLabels(t *testing.T) {
	dims := []CapabilityDimension{DimCreativeDesign, DimCodeGen}
	labels := CapabilityLabels(dims)
	if len(labels) != 2 {
		t.Fatalf("labels length = %d, want 2", len(labels))
	}
	if labels[0] != "创意设计" {
		t.Errorf("labels[0] = %s, want 创意设计", labels[0])
	}
	if labels[1] != "代码生成" {
		t.Errorf("labels[1] = %s, want 代码生成", labels[1])
	}
}

func TestRoleAssignmentAffectsExecution(t *testing.T) {
	// 验证智能组队结果真正影响角色分配：
	// 即使 YAML 里把 kimi 配成 designer、claude 配成 developer，
	// 智能组队后 designer 应该由 claude 执行，developer 由 codex 执行
	builder := NewTeamBuilder()
	builder.RegisterAgent("agent-kimi", "kimi", "Kimi", protocol.AgentCapability{})
	builder.RegisterAgent("agent-claude", "claude", "Claude", protocol.AgentCapability{})
	builder.RegisterAgent("agent-codex", "codex", "Codex", protocol.AgentCapability{})

	// 互补模式：designer 应映射到 claude（不是 kimi）
	assignments := builder.BuildComplementaryTeam()
	roleMap := make(map[string]string)
	for _, a := range assignments {
		roleMap[a.Role] = a.AgentID
	}

	if roleMap["designer"] != "agent-claude" {
		t.Errorf("designer assigned to %s, want agent-claude (claude 设计能力最强)", roleMap["designer"])
	}
	if roleMap["developer"] != "agent-codex" {
		t.Errorf("developer assigned to %s, want agent-codex (codex 代码能力最强)", roleMap["developer"])
	}
}

func TestFindBestAgentType(t *testing.T) {
	builder := NewTeamBuilder()

	// designer 角色应该匹配到 claude
	bestType := builder.FindBestAgentType(RoleDesigner, map[string]bool{})
	if bestType != "claude" {
		t.Errorf("designer best type = %s, want claude", bestType)
	}

	// developer 角色应该匹配到 codex
	bestType = builder.FindBestAgentType(RoleDeveloper, map[string]bool{})
	if bestType != "codex" {
		t.Errorf("developer best type = %s, want codex", bestType)
	}

	// 如果 claude 已被占用，designer 应该退而求其次
	bestType = builder.FindBestAgentType(RoleDesigner, map[string]bool{"claude": true})
	if bestType == "claude" {
		t.Error("designer should not reuse claude when it's already used")
	}
	if bestType == "" {
		t.Error("designer should still find an alternative when claude is used")
	}
}
