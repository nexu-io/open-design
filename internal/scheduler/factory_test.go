package scheduler

import (
	"testing"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

func TestNew_Parallel(t *testing.T) {
	b := bus.New(t.TempDir(), 100)
	defer b.Shutdown()
	pool := &agent.Pool{}

	s, err := New(protocol.ModeParallel, pool, b, nil)
	if err != nil {
		t.Fatalf("New parallel: %v", err)
	}
	if s.Mode() != protocol.ModeParallel {
		t.Errorf("Mode = %q, want %q", s.Mode(), protocol.ModeParallel)
	}
}

func TestNew_Serial(t *testing.T) {
	b := bus.New(t.TempDir(), 100)
	defer b.Shutdown()
	pool := &agent.Pool{}

	s, err := New(protocol.ModeSerial, pool, b, nil)
	if err != nil {
		t.Fatalf("New serial: %v", err)
	}
	if s.Mode() != protocol.ModeSerial {
		t.Errorf("Mode = %q, want %q", s.Mode(), protocol.ModeSerial)
	}
}

func TestNew_Genetic(t *testing.T) {
	b := bus.New(t.TempDir(), 100)
	defer b.Shutdown()
	pool := &agent.Pool{}

	s, err := New(protocol.ModeGenetic, pool, b, nil)
	if err != nil {
		t.Fatalf("New genetic: %v", err)
	}
	if s.Mode() != protocol.ModeGenetic {
		t.Errorf("Mode = %q, want %q", s.Mode(), protocol.ModeGenetic)
	}
}

func TestNew_Inheritance(t *testing.T) {
	b := bus.New(t.TempDir(), 100)
	defer b.Shutdown()
	pool := &agent.Pool{}

	s, err := New(protocol.ModeInheritance, pool, b, nil)
	if err != nil {
		t.Fatalf("New inheritance: %v", err)
	}
	if s.Mode() != protocol.ModeInheritance {
		t.Errorf("Mode = %q, want %q", s.Mode(), protocol.ModeInheritance)
	}
}

func TestNew_Hybrid(t *testing.T) {
	b := bus.New(t.TempDir(), 100)
	defer b.Shutdown()
	pool := &agent.Pool{}

	s, err := New(protocol.ModeHybrid, pool, b, nil)
	if err != nil {
		t.Fatalf("New hybrid: %v", err)
	}
	// hybrid 回退到 parallel
	if s.Mode() != protocol.ModeParallel {
		t.Errorf("Mode = %q, want %q", s.Mode(), protocol.ModeParallel)
	}
}

func TestNew_Unsupported(t *testing.T) {
	b := bus.New(t.TempDir(), 100)
	defer b.Shutdown()
	pool := &agent.Pool{}

	_, err := New("unknown", pool, b, nil)
	if err == nil {
		t.Error("expected error for unsupported mode")
	}
}

func TestTaskResult_Fields(t *testing.T) {
	tr := &TaskResult{
		TaskID:  "t1",
		AgentID: "a1",
		Success: true,
		Error:   "",
	}

	if tr.TaskID != "t1" {
		t.Errorf("TaskID = %q", tr.TaskID)
	}
	if !tr.Success {
		t.Error("Success should be true")
	}
}

func TestExecutionPlan_Fields(t *testing.T) {
	plan := &ExecutionPlan{
		TeamID: "team-1",
		Tasks: []Task{
			{ID: "t1", Prompt: "test"},
		},
		Mode: protocol.ModeParallel,
	}

	if plan.TeamID != "team-1" {
		t.Errorf("TeamID = %q", plan.TeamID)
	}
	if len(plan.Tasks) != 1 {
		t.Errorf("Tasks len = %d, want 1", len(plan.Tasks))
	}
}
