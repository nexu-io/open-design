package scheduler

import (
	"testing"
)

func TestTopologicalLayers_Simple(t *testing.T) {
	s := &ParallelScheduler{}
	tasks := []Task{
		{ID: "a", Dependencies: []string{}},
		{ID: "b", Dependencies: []string{"a"}},
		{ID: "c", Dependencies: []string{"a"}},
		{ID: "d", Dependencies: []string{"b", "c"}},
	}

	layers := s.topologicalLayers(tasks)
	if len(layers) != 3 {
		t.Fatalf("layers = %d, want 3", len(layers))
	}

	// Layer 0: a
	if len(layers[0]) != 1 || layers[0][0].ID != "a" {
		t.Errorf("layer 0 = %v, want [a]", layerIDs(layers[0]))
	}
	// Layer 1: b, c (顺序不保证)
	if len(layers[1]) != 2 {
		t.Errorf("layer 1 = %v, want [b,c]", layerIDs(layers[1]))
	}
	// Layer 2: d
	if len(layers[2]) != 1 || layers[2][0].ID != "d" {
		t.Errorf("layer 2 = %v, want [d]", layerIDs(layers[2]))
	}
}

func TestTopologicalLayers_NoDeps(t *testing.T) {
	s := &ParallelScheduler{}
	tasks := []Task{
		{ID: "x"},
		{ID: "y"},
		{ID: "z"},
	}

	layers := s.topologicalLayers(tasks)
	// 所有无依赖任务应在同一层
	if len(layers) != 1 {
		t.Fatalf("layers = %d, want 1", len(layers))
	}
	if len(layers[0]) != 3 {
		t.Errorf("layer 0 size = %d, want 3", len(layers[0]))
	}
}

func TestTopologicalLayers_Empty(t *testing.T) {
	s := &ParallelScheduler{}
	layers := s.topologicalLayers(nil)
	if len(layers) != 0 {
		t.Errorf("layers = %d, want 0", len(layers))
	}
}

func TestTopoSort_Linear(t *testing.T) {
	s := &SerialScheduler{}
	tasks := []Task{
		{ID: "c", Dependencies: []string{"b"}},
		{ID: "a", Dependencies: []string{}},
		{ID: "b", Dependencies: []string{"a"}},
	}

	sorted, err := s.topoSort(tasks)
	if err != nil {
		t.Fatalf("topoSort: %v", err)
	}

	// 应为 a → b → c
	expected := []string{"a", "b", "c"}
	for i, id := range expected {
		if sorted[i].ID != id {
			t.Errorf("sorted[%d] = %q, want %q", i, sorted[i].ID, id)
		}
	}
}

func TestTopoSort_NoDeps(t *testing.T) {
	s := &SerialScheduler{}
	tasks := []Task{
		{ID: "x"},
		{ID: "y"},
	}

	sorted, err := s.topoSort(tasks)
	if err != nil {
		t.Fatalf("topoSort: %v", err)
	}
	if len(sorted) != 2 {
		t.Errorf("sorted len = %d, want 2", len(sorted))
	}
}

func layerIDs(tasks []Task) []string {
	var ids []string
	for _, t := range tasks {
		ids = append(ids, t.ID)
	}
	return ids
}
