package store

import (
	"testing"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

func newTestStore(t *testing.T) *HistoryStore {
	t.Helper()
	s, err := NewHistoryStore(t.TempDir() + "/test.db")
	if err != nil {
		t.Fatalf("NewHistoryStore: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestSaveAndGetExecution(t *testing.T) {
	s := newTestStore(t)

	now := time.Now()
	rec := &ExecutionRecord{
		ID:        "exec-1",
		TeamID:    "team-a",
		Mode:      "parallel",
		TaskDesc:  "design a dashboard",
		Status:    "completed",
		StartedAt: now,
		Duration:  5 * time.Second,
	}

	if err := s.SaveExecution(rec); err != nil {
		t.Fatalf("SaveExecution: %v", err)
	}

	got, err := s.GetExecution("exec-1")
	if err != nil {
		t.Fatalf("GetExecution: %v", err)
	}

	if got.TeamID != "team-a" {
		t.Errorf("TeamID = %q, want %q", got.TeamID, "team-a")
	}
	if got.Mode != "parallel" {
		t.Errorf("Mode = %q, want %q", got.Mode, "parallel")
	}
	if got.Status != "completed" {
		t.Errorf("Status = %q, want %q", got.Status, "completed")
	}
}

func TestListExecutions(t *testing.T) {
	s := newTestStore(t)

	now := time.Now()
	for i := 0; i < 5; i++ {
		s.SaveExecution(&ExecutionRecord{
			ID:        "exec-" + string(rune('0'+i)),
			TeamID:    "team-a",
			Mode:      "parallel",
			Status:    "completed",
			StartedAt: now.Add(time.Duration(i) * time.Second),
			Duration:  time.Second,
		})
	}

	// 列出全部
	all, err := s.ListExecutions("", 10)
	if err != nil {
		t.Fatalf("ListExecutions: %v", err)
	}
	if len(all) != 5 {
		t.Errorf("ListExecutions all = %d, want 5", len(all))
	}

	// 按团队过滤
	filtered, err := s.ListExecutions("team-a", 10)
	if err != nil {
		t.Fatalf("ListExecutions filtered: %v", err)
	}
	if len(filtered) != 5 {
		t.Errorf("ListExecutions filtered = %d, want 5", len(filtered))
	}

	// limit
	limited, err := s.ListExecutions("", 3)
	if err != nil {
		t.Fatalf("ListExecutions limited: %v", err)
	}
	if len(limited) != 3 {
		t.Errorf("ListExecutions limited = %d, want 3", len(limited))
	}
}

func TestSaveAndGetArtifact(t *testing.T) {
	s := newTestStore(t)

	// 先保存执行记录
	s.SaveExecution(&ExecutionRecord{
		ID:        "exec-1",
		TeamID:    "team-a",
		Mode:      "parallel",
		Status:    "completed",
		StartedAt: time.Now(),
	})

	a := &protocol.Artifact{
		ID:        "art-1",
		Name:      "dashboard.html",
		Type:      protocol.ArtifactDesign,
		Path:      "/tmp/artifacts/art-1/dashboard.html",
		Size:      1024,
		Checksum:  "abc123",
		Producer:  "designer-1",
		CreatedAt: time.Now(),
	}

	if err := s.SaveArtifact(a, "exec-1"); err != nil {
		t.Fatalf("SaveArtifact: %v", err)
	}

	artifacts, err := s.ListArtifacts("exec-1")
	if err != nil {
		t.Fatalf("ListArtifacts: %v", err)
	}

	if len(artifacts) != 1 {
		t.Fatalf("ListArtifacts = %d, want 1", len(artifacts))
	}
	if artifacts[0].Name != "dashboard.html" {
		t.Errorf("Name = %q, want %q", artifacts[0].Name, "dashboard.html")
	}
	if artifacts[0].Type != protocol.ArtifactDesign {
		t.Errorf("Type = %q, want %q", artifacts[0].Type, protocol.ArtifactDesign)
	}
}

func TestSaveTeamSnapshot(t *testing.T) {
	s := newTestStore(t)

	if err := s.SaveTeamSnapshot("team-a", []byte(`{"name":"team-a"}`)); err != nil {
		t.Fatalf("SaveTeamSnapshot: %v", err)
	}
}

func TestGetExecution_NotFound(t *testing.T) {
	s := newTestStore(t)

	_, err := s.GetExecution("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent execution")
	}
}
