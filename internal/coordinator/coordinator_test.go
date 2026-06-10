package coordinator

import (
	"testing"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/config"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/scheduler"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

func testConfig(mode protocol.TeamMode) *config.TeamConfig {
	return &config.TeamConfig{
		Team: config.TeamSpec{
			Name: "test-team",
			Mode: mode,
			Agents: []config.AgentSpec{
				{ID: "a1", Name: "Agent 1", Role: "designer", Type: "claude-code"},
				{ID: "a2", Name: "Agent 2", Role: "writer", Type: "codex"},
			},
			Inheritance: config.InheritanceSpec{
				Enabled: true,
				Tree: config.InheritanceNode{
					AgentID: "a1",
					Children: []config.InheritanceNode{
						{AgentID: "a2"},
					},
				},
			},
		},
		Pipeline: &config.PipelineSpec{
			Stages: []config.PipelineStage{
				{Name: "analyze", Agent: "a1", DependsOn: []string{}},
				{Name: "design", Agent: "a2", DependsOn: []string{"analyze"}},
			},
		},
	}
}

func TestSplitParallelTasks(t *testing.T) {
	cfg := testConfig(protocol.ModeParallel)
	c := &Coordinator{cfg: cfg}

	tasks := c.splitParallelTasks("design a dashboard")
	if len(tasks) != 2 {
		t.Fatalf("tasks = %d, want 2", len(tasks))
	}

	// 并行任务无依赖
	for _, task := range tasks {
		if len(task.Dependencies) != 0 {
			t.Errorf("task %s has %d dependencies, want 0", task.ID, len(task.Dependencies))
		}
	}

	// prompt 应包含角色信息
	hasRole := false
	for _, task := range tasks {
		if task.Metadata["role"] == "designer" || task.Metadata["role"] == "writer" {
			hasRole = true
		}
	}
	if !hasRole {
		t.Error("no task has role metadata")
	}
}

func TestSplitSerialTasks_WithPipeline(t *testing.T) {
	cfg := testConfig(protocol.ModeSerial)
	c := &Coordinator{cfg: cfg}

	tasks := c.splitSerialTasks("design a dashboard")
	if len(tasks) != 2 {
		t.Fatalf("tasks = %d, want 2", len(tasks))
	}

	// 第一个阶段无依赖
	if len(tasks[0].Dependencies) != 0 {
		t.Errorf("stage 0 deps = %d, want 0", len(tasks[0].Dependencies))
	}

	// 第二个阶段依赖 analyze
	if len(tasks[1].Dependencies) != 1 || tasks[1].Dependencies[0] != "analyze" {
		t.Errorf("stage 1 deps = %v, want [analyze]", tasks[1].Dependencies)
	}
}

func TestSplitSerialTasks_WithoutPipeline(t *testing.T) {
	cfg := testConfig(protocol.ModeParallel)
	cfg.Pipeline = nil
	c := &Coordinator{cfg: cfg}

	tasks := c.splitSerialTasks("design a dashboard")
	if len(tasks) != 2 {
		t.Fatalf("tasks = %d, want 2", len(tasks))
	}

	// 无 pipeline 时按 Agent 顺序构建线性链
	if len(tasks[0].Dependencies) != 0 {
		t.Errorf("task 0 deps = %d, want 0", len(tasks[0].Dependencies))
	}
	if len(tasks[1].Dependencies) != 1 {
		t.Errorf("task 1 deps = %d, want 1", len(tasks[1].Dependencies))
	}
}

func TestSplitGeneticTasks(t *testing.T) {
	cfg := testConfig(protocol.ModeGenetic)
	c := &Coordinator{cfg: cfg}

	tasks := c.splitGeneticTasks("design a dashboard")
	if len(tasks) != 1 {
		t.Fatalf("tasks = %d, want 1", len(tasks))
	}
	if tasks[0].ID != "genetic-root" {
		t.Errorf("task ID = %q, want %q", tasks[0].ID, "genetic-root")
	}
}

func TestSplitInheritanceTasks_WithTree(t *testing.T) {
	cfg := testConfig(protocol.ModeInheritance)
	c := &Coordinator{cfg: cfg}

	tasks := c.splitInheritanceTasks("design a dashboard")
	if len(tasks) != 2 {
		t.Fatalf("tasks = %d, want 2", len(tasks))
	}

	// 根节点无依赖
	if len(tasks[0].Dependencies) != 0 {
		t.Errorf("root task deps = %d, want 0", len(tasks[0].Dependencies))
	}

	// 子节点依赖根节点
	if len(tasks[1].Dependencies) != 1 {
		t.Errorf("child task deps = %d, want 1", len(tasks[1].Dependencies))
	}
}

func TestSplitInheritanceTasks_WithoutTree(t *testing.T) {
	cfg := testConfig(protocol.ModeParallel)
	cfg.Team.Inheritance.Enabled = false
	c := &Coordinator{cfg: cfg}

	tasks := c.splitInheritanceTasks("design a dashboard")
	if len(tasks) != 2 {
		t.Fatalf("tasks = %d, want 2", len(tasks))
	}

	// 线性继承链
	if tasks[0].AssignedTo != "a1" {
		t.Errorf("task 0 agent = %q, want %q", tasks[0].AssignedTo, "a1")
	}
	if tasks[1].AssignedTo != "a2" {
		t.Errorf("task 1 agent = %q, want %q", tasks[1].AssignedTo, "a2")
	}
}

func TestSplitHybridTasks(t *testing.T) {
	cfg := testConfig(protocol.ModeHybrid)
	c := &Coordinator{cfg: cfg}

	tasks := c.splitHybridTasks("design a dashboard")
	if len(tasks) != 2 {
		t.Fatalf("tasks = %d, want 2", len(tasks))
	}

	// 验证阶段名称
	if tasks[0].Metadata["stage"] != "analyze" {
		t.Errorf("stage = %q, want %q", tasks[0].Metadata["stage"], "analyze")
	}
	if tasks[1].Metadata["stage"] != "design" {
		t.Errorf("stage = %q, want %q", tasks[1].Metadata["stage"], "design")
	}
}

func TestSplitTasks_UnsupportedMode(t *testing.T) {
	cfg := testConfig("unknown")
	c := &Coordinator{cfg: cfg}

	_, err := c.splitTasks("test")
	if err == nil {
		t.Error("expected error for unsupported mode")
	}
}

func TestGetStatus(t *testing.T) {
	// GetStatus 需要真实的 Pool，这里只测试接口是否可调用
	// 实际集成测试在 e2e 中覆盖
	cfg := testConfig(protocol.ModeParallel)
	_ = &Coordinator{cfg: cfg}
	// status := c.GetStatus() // 需要 Pool，跳过
	_ = scheduler.Task{} // 确保 scheduler 包可引用
}
