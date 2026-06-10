package context

import (
	"encoding/json"
	"testing"
)

func TestCreate(t *testing.T) {
	m := NewManager()
	s := m.Create("s1", "agent-1")

	if s.ID != "s1" {
		t.Errorf("ID = %q, want %q", s.ID, "s1")
	}
	if s.AgentID != "agent-1" {
		t.Errorf("AgentID = %q, want %q", s.AgentID, "agent-1")
	}
	if s.Version != 1 {
		t.Errorf("Version = %d, want 1", s.Version)
	}
	if s.Memory == nil {
		t.Error("Memory should not be nil")
	}
}

func TestInherit(t *testing.T) {
	m := NewManager()

	// 创建父会话
	parent := m.Create("parent", "designer")
	parent.Skills = []string{"hero", "pricing"}
	parent.Designs = []string{"minimal"}
	parent.ArtifactIDs = []string{"art-1", "art-2"}
	parent.Memory["brand"] = "acme"

	// 继承
	child, err := m.Inherit("parent", "child", "writer")
	if err != nil {
		t.Fatalf("Inherit: %v", err)
	}

	// 验证继承的技能
	if len(child.Skills) != 2 {
		t.Errorf("Skills len = %d, want 2", len(child.Skills))
	}
	if child.Skills[0] != "hero" {
		t.Errorf("Skills[0] = %q, want hero", child.Skills[0])
	}

	// 验证继承的工件引用
	if len(child.ArtifactIDs) != 2 {
		t.Errorf("ArtifactIDs len = %d, want 2", len(child.ArtifactIDs))
	}

	// 验证继承的记忆
	if child.Memory["brand"] != "acme" {
		t.Errorf("Memory[brand] = %v, want acme", child.Memory["brand"])
	}

	// 验证继承深度
	depth, ok := child.Memory["inheritance_depth"].(int)
	if !ok || depth != 1 {
		t.Errorf("inheritance_depth = %v, want 1", child.Memory["inheritance_depth"])
	}

	// 验证父会话指针
	if child.ParentID != "parent" {
		t.Errorf("ParentID = %q, want parent", child.ParentID)
	}

	// 验证深拷贝（修改子不影响父）
	child.Memory["brand"] = "changed"
	got, _ := m.ReadMemory("parent", "brand")
	if got != "acme" {
		t.Error("child modification leaked to parent - deep copy failed")
	}
}

func TestInherit_NotFound(t *testing.T) {
	m := NewManager()
	_, err := m.Inherit("nonexistent", "child", "agent")
	if err == nil {
		t.Error("expected error for nonexistent parent")
	}
}

func TestInherit_MultiLevel(t *testing.T) {
	m := NewManager()

	m.Create("root", "a1")
	root, _ := m.Get("root")
	root.Skills = []string{"skill-a"}
	root.Memory["level"] = 0

	child1, _ := m.Inherit("root", "child1", "a2")
	child1.Memory["level"] = 1

	child2, _ := m.Inherit("child1", "child2", "a3")
	depth, _ := child2.Memory["inheritance_depth"].(int)
	if depth != 2 {
		t.Errorf("depth = %d, want 2", depth)
	}
}

func TestMerge(t *testing.T) {
	m := NewManager()

	m.Create("s1", "a1")
	m.Create("s2", "a2")

	m.AddArtifacts("s1", []string{"art-1"})

	err := m.Merge("s1", "s2", []string{"art-1", "art-2"}, map[string]any{"source": "s1"})
	if err != nil {
		t.Fatalf("Merge: %v", err)
	}

	s2, _ := m.Get("s2")
	if len(s2.ArtifactIDs) != 2 {
		t.Errorf("ArtifactIDs = %d, want 2 (no duplicates)", len(s2.ArtifactIDs))
	}
	if s2.Memory["source"] != "s1" {
		t.Errorf("Memory[source] = %v, want s1", s2.Memory["source"])
	}
}

func TestAddArtifacts(t *testing.T) {
	m := NewManager()
	m.Create("s1", "a1")

	err := m.AddArtifacts("s1", []string{"art-1", "art-2"})
	if err != nil {
		t.Fatalf("AddArtifacts: %v", err)
	}

	// 重复添加
	err = m.AddArtifacts("s1", []string{"art-2", "art-3"})
	if err != nil {
		t.Fatalf("AddArtifacts dedup: %v", err)
	}

	s, _ := m.Get("s1")
	if len(s.ArtifactIDs) != 3 {
		t.Errorf("ArtifactIDs = %d, want 3 (deduped)", len(s.ArtifactIDs))
	}
}

func TestWriteReadMemory(t *testing.T) {
	m := NewManager()
	m.Create("s1", "a1")

	err := m.WriteMemory("s1", "key", "value")
	if err != nil {
		t.Fatalf("WriteMemory: %v", err)
	}

	val, ok := m.ReadMemory("s1", "key")
	if !ok || val != "value" {
		t.Errorf("ReadMemory = %v, %v, want value, true", val, ok)
	}

	// 读取不存在的 key
	_, ok = m.ReadMemory("s1", "nonexistent")
	if ok {
		t.Error("expected false for nonexistent key")
	}
}

func TestSnapshot(t *testing.T) {
	m := NewManager()
	s := m.Create("s1", "a1")
	s.Skills = []string{"hero"}
	s.Memory["key"] = "val"

	data, err := m.Snapshot("s1")
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}

	var snap map[string]any
	if err := json.Unmarshal(data, &snap); err != nil {
		t.Fatalf("unmarshal snapshot: %v", err)
	}

	if snap["session_id"] != "s1" {
		t.Errorf("session_id = %v, want s1", snap["session_id"])
	}
	if snap["agent_id"] != "a1" {
		t.Errorf("agent_id = %v, want a1", snap["agent_id"])
	}
}

func TestDelete(t *testing.T) {
	m := NewManager()
	m.Create("s1", "a1")
	m.Delete("s1")

	_, ok := m.Get("s1")
	if ok {
		t.Error("expected session to be deleted")
	}
}

func TestChecksum(t *testing.T) {
	m := NewManager()
	s := m.Create("s1", "a1")
	checksum1 := s.Checksum

	// 修改版本号会改变 checksum
	s.Version++
	s.Checksum = m.computeChecksum(s)
	if s.Checksum == checksum1 {
		t.Error("checksum should change after version bump")
	}
}
