package agent

import (
	"testing"
	"time"
	"context"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/config"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

func newTestPool(t *testing.T, agents []config.AgentSpec) (*Pool, *bus.CommunicationBus) {
	t.Helper()
	b := bus.New(t.TempDir(), 100)
	cfg := &config.TeamConfig{
		Team: config.TeamSpec{
			Name:   "test",
			Mode:   protocol.ModeParallel,
			Agents: agents,
		},
	}
	pool := NewPool(cfg, b, t.TempDir())
	return pool, b
}

func TestNewPool_RegistersAgents(t *testing.T) {
	pool, b := newTestPool(t, []config.AgentSpec{
		{ID: "a1", Name: "Agent 1", Type: "claude-code", Skills: []string{"hero"}},
		{ID: "a2", Name: "Agent 2", Type: "codex", Skills: []string{"copy"}},
	})
	defer b.Shutdown()
	defer pool.Shutdown()

	runtimes := pool.ListRuntimes()
	if len(runtimes) != 2 {
		t.Errorf("runtimes = %d, want 2", len(runtimes))
	}
}

func TestGetRuntime(t *testing.T) {
	pool, b := newTestPool(t, []config.AgentSpec{
		{ID: "a1", Name: "Agent 1", Type: "claude-code"},
	})
	defer b.Shutdown()
	defer pool.Shutdown()

	rt, err := pool.GetRuntime("a1")
	if err != nil {
		t.Fatalf("GetRuntime: %v", err)
	}
	if rt.ID != "a1" {
		t.Errorf("ID = %q, want %q", rt.ID, "a1")
	}
	if rt.Status != protocol.AgentIdle {
		t.Errorf("Status = %q, want %q", rt.Status, protocol.AgentIdle)
	}
	if rt.Capability.Name != "Agent 1" {
		t.Errorf("Capability.Name = %q, want %q", rt.Capability.Name, "Agent 1")
	}
}

func TestGetRuntime_NotFound(t *testing.T) {
	pool, b := newTestPool(t, []config.AgentSpec{
		{ID: "a1", Name: "Agent 1", Type: "claude-code"},
	})
	defer b.Shutdown()
	defer pool.Shutdown()

	_, err := pool.GetRuntime("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent agent")
	}
}

func TestAssignTask_NotFound(t *testing.T) {
	pool, b := newTestPool(t, []config.AgentSpec{
		{ID: "a1", Name: "Agent 1", Type: "claude-code"},
	})
	defer b.Shutdown()
	defer pool.Shutdown()

	err := pool.AssignTask("nonexistent", &TaskAssignment{
		TaskID:  "t1",
		Prompt:  "test",
		Timeout: time.Second,
	})
	if err == nil {
		t.Error("expected error for nonexistent agent")
	}
}

func TestWaitResult_Timeout(t *testing.T) {
	pool, b := newTestPool(t, []config.AgentSpec{
		{ID: "a1", Name: "Agent 1", Type: "claude-code"},
	})
	defer b.Shutdown()
	defer pool.Shutdown()

	// 不实际分配任务，直接等待应超时
	_, err := pool.WaitResult("a1", 50*time.Millisecond)
	if err == nil {
		t.Error("expected timeout error")
	}
}

func TestWaitResult_NotFound(t *testing.T) {
	pool, b := newTestPool(t, []config.AgentSpec{
		{ID: "a1", Name: "Agent 1", Type: "claude-code"},
	})
	defer b.Shutdown()
	defer pool.Shutdown()

	_, err := pool.WaitResult("nonexistent", time.Second)
	if err == nil {
		t.Error("expected error for nonexistent agent")
	}
}

func TestListRuntimes(t *testing.T) {
	pool, b := newTestPool(t, []config.AgentSpec{
		{ID: "a1", Name: "Agent 1", Type: "claude-code"},
		{ID: "a2", Name: "Agent 2", Type: "codex"},
		{ID: "a3", Name: "Agent 3", Type: "cursor"},
	})
	defer b.Shutdown()
	defer pool.Shutdown()

	runtimes := pool.ListRuntimes()
	if len(runtimes) != 3 {
		t.Errorf("runtimes = %d, want 3", len(runtimes))
	}

	ids := make(map[string]bool)
	for _, rt := range runtimes {
		ids[rt.ID] = true
	}
	for _, want := range []string{"a1", "a2", "a3"} {
		if !ids[want] {
			t.Errorf("missing agent %s", want)
		}
	}
}

func TestShutdown(t *testing.T) {
	pool, b := newTestPool(t, []config.AgentSpec{
		{ID: "a1", Name: "Agent 1", Type: "claude-code"},
	})
	defer b.Shutdown()

	pool.Shutdown()

	// shutdown 后获取 runtime 仍应正常（map 未清除）
	rt, err := pool.GetRuntime("a1")
	if err != nil {
		t.Fatalf("GetRuntime after shutdown: %v", err)
	}
	if rt == nil {
		t.Error("runtime is nil after shutdown")
	}
}

func TestContextSnapshot(t *testing.T) {
	cs := &ContextSnapshot{
		AgentID:     "parent-agent",
		ParentTask:  "task-1",
		Skills:      []string{"hero", "copy"},
		Designs:     []string{"minimal"},
		Memory:      map[string]any{"key": "value"},
		ArtifactIDs: []string{"art-1", "art-2"},
	}

	if cs.AgentID != "parent-agent" {
		t.Errorf("AgentID = %q", cs.AgentID)
	}
	if len(cs.Skills) != 2 {
		t.Errorf("Skills len = %d, want 2", len(cs.Skills))
	}
	if len(cs.ArtifactIDs) != 2 {
		t.Errorf("ArtifactIDs len = %d, want 2", len(cs.ArtifactIDs))
	}
}

func TestBuildChatRequest(t *testing.T) {
	ctx := context.Background()
	ma := &ManagedAgent{
		Spec: config.AgentSpec{
			ID:      "a1",
			Name:    "Test Agent",
			Type:    "claude-code",
			Skills:  []string{"hero-section", "pricing-table"},
			Designs: []string{"minimal-light"},
			Role:    "designer",
		},
		ctx:     ctx,
		workDir: t.TempDir(),
	}

	task := &TaskAssignment{
		TaskID:  "t1",
		Prompt:  "design a dashboard",
		Context: &ContextSnapshot{
			AgentID:     "parent-agent",
			ArtifactIDs: []string{"art-1"},
			Memory:      map[string]any{"key": "value"},
		},
	}

	req := ma.buildChatRequest(task)
	if req.Message != "design a dashboard" {
		t.Errorf("Message = %q, want %q", req.Message, "design a dashboard")
	}
	if !req.Stream {
		t.Error("expected stream=true")
	}

	// 验证技能和设计系统
	if len(req.Skills) != 2 {
		t.Errorf("Skills = %v, want 2 skills", req.Skills)
	}
	if len(req.Designs) != 1 {
		t.Errorf("Designs = %v, want 1 design", req.Designs)
	}

	// 验证继承上下文注入
	if req.Context == nil {
		t.Fatal("expected context in request")
	}

	_ = ctx
}
