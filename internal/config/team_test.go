package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoad_ParallelMode(t *testing.T) {
	yaml := `
version: "1.0"
team:
  name: "test-parallel"
  description: "test"
  mode: parallel
  agents:
    - id: agent-a
      name: "Agent A"
      role: designer
      type: claude-code
      skills: [hero-section]
      designs: [minimal-light]
    - id: agent-b
      name: "Agent B"
      role: writer
      type: codex
      skills: [copywriting]
`
	path := writeTemp(t, yaml)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if cfg.Team.Name != "test-parallel" {
		t.Errorf("team name = %q, want %q", cfg.Team.Name, "test-parallel")
	}
	if cfg.Team.Mode != "parallel" {
		t.Errorf("mode = %q, want %q", cfg.Team.Mode, "parallel")
	}
	if len(cfg.Team.Agents) != 2 {
		t.Errorf("agents = %d, want 2", len(cfg.Team.Agents))
	}
}

func TestLoad_SerialMode(t *testing.T) {
	yaml := `
version: "1.0"
team:
  name: "test-serial"
  mode: serial
  agents:
    - id: a1
      name: "A1"
      type: claude-code
      skills: []
pipeline:
  stages:
    - name: stage-1
      agent: a1
      depends_on: []
      input_from: ""
      output_as: result-1
`
	path := writeTemp(t, yaml)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if len(cfg.Pipeline.Stages) != 1 {
		t.Errorf("stages = %d, want 1", len(cfg.Pipeline.Stages))
	}
	if cfg.Pipeline.Stages[0].Agent != "a1" {
		t.Errorf("stage agent = %q, want %q", cfg.Pipeline.Stages[0].Agent, "a1")
	}
}

func TestLoad_GeneticMode(t *testing.T) {
	yaml := `
version: "1.0"
team:
  name: "test-genetic"
  mode: genetic
  agents:
    - id: g1
      name: "G1"
      type: claude-code
      skills: []
genetic:
  population_size: 4
  generations: 3
  mutation_rate: 0.3
  crossover_rate: 0.7
  elitism: 1
`
	path := writeTemp(t, yaml)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if cfg.Genetic == nil {
		t.Fatal("genetic config is nil")
	}
	if cfg.Genetic.PopulationSize != 4 {
		t.Errorf("population_size = %d, want 4", cfg.Genetic.PopulationSize)
	}
	if cfg.Genetic.MutationRate != 0.3 {
		t.Errorf("mutation_rate = %f, want 0.3", cfg.Genetic.MutationRate)
	}
}

func TestLoad_InheritanceMode(t *testing.T) {
	yaml := `
version: "1.0"
team:
  name: "test-inh"
  mode: inheritance
  inheritance:
    enabled: true
    tree:
      agent_id: root
      children:
        - agent_id: child1
        - agent_id: child2
    share_scope: [skill, design]
  agents:
    - id: root
      name: "Root"
      type: claude-code
      skills: []
    - id: child1
      name: "Child1"
      type: codex
      skills: []
    - id: child2
      name: "Child2"
      type: cursor
      skills: []
`
	path := writeTemp(t, yaml)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if !cfg.Team.Inheritance.Enabled {
		t.Error("inheritance not enabled")
	}
	if cfg.Team.Inheritance.Tree.AgentID != "root" {
		t.Errorf("tree root = %q, want %q", cfg.Team.Inheritance.Tree.AgentID, "root")
	}
	if len(cfg.Team.Inheritance.Tree.Children) != 2 {
		t.Errorf("children = %d, want 2", len(cfg.Team.Inheritance.Tree.Children))
	}
}

func TestValidate_NoTeamName(t *testing.T) {
	cfg := &TeamConfig{
		Team: TeamSpec{
			Agents: []AgentSpec{{ID: "a1"}},
		},
	}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for missing team name")
	}
}

func TestValidate_NoAgents(t *testing.T) {
	cfg := &TeamConfig{
		Team: TeamSpec{Name: "test"},
	}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for missing agents")
	}
}

func TestValidate_DuplicateAgentID(t *testing.T) {
	cfg := &TeamConfig{
		Team: TeamSpec{
			Name: "test",
			Agents: []AgentSpec{
				{ID: "a1"},
				{ID: "a1"},
			},
		},
	}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for duplicate agent ID")
	}
}

func TestValidate_GeneticRequiresConfig(t *testing.T) {
	cfg := &TeamConfig{
		Team: TeamSpec{
			Name: "test",
			Mode: "genetic",
			Agents: []AgentSpec{{ID: "a1"}},
		},
	}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for genetic mode without config")
	}
}

func TestValidate_GeneticMinPopulation(t *testing.T) {
	cfg := &TeamConfig{
		Team: TeamSpec{
			Name: "test",
			Mode: "genetic",
			Agents: []AgentSpec{{ID: "a1"}},
		},
		Genetic: &GeneticSpec{PopulationSize: 1},
	}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for population_size < 2")
	}
}

func TestValidate_SerialRequiresPipeline(t *testing.T) {
	cfg := &TeamConfig{
		Team: TeamSpec{
			Name: "test",
			Mode: "serial",
			Agents: []AgentSpec{{ID: "a1"}},
		},
	}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for serial mode without pipeline")
	}
}

func TestGetAgent(t *testing.T) {
	cfg := &TeamConfig{
		Team: TeamSpec{
			Name: "test",
			Agents: []AgentSpec{
				{ID: "a1", Name: "Agent 1"},
				{ID: "a2", Name: "Agent 2"},
			},
		},
	}
	a, err := cfg.GetAgent("a2")
	if err != nil {
		t.Fatalf("GetAgent failed: %v", err)
	}
	if a.Name != "Agent 2" {
		t.Errorf("name = %q, want %q", a.Name, "Agent 2")
	}

	_, err = cfg.GetAgent("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent agent")
	}
}

func TestValidate_PipelineUnknownAgent(t *testing.T) {
	cfg := &TeamConfig{
		Team: TeamSpec{
			Name: "test",
			Mode: "serial",
			Agents: []AgentSpec{{ID: "a1"}},
		},
		Pipeline: &PipelineSpec{
			Stages: []PipelineStage{
				{Name: "s1", Agent: "nonexistent"},
			},
		},
	}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for unknown agent in pipeline")
	}
}

func TestValidate_InheritanceUnknownAgent(t *testing.T) {
	cfg := &TeamConfig{
		Team: TeamSpec{
			Name: "test",
			Agents: []AgentSpec{
				{ID: "a1"},
			},
			Inheritance: InheritanceSpec{
				Enabled: true,
				Tree: InheritanceNode{
					AgentID: "a1",
					Children: []InheritanceNode{
						{AgentID: "nonexistent"},
					},
				},
			},
		},
	}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for unknown agent in inheritance tree")
	}
}

func TestValidate_InheritsUnknownAgent(t *testing.T) {
	cfg := &TeamConfig{
		Team: TeamSpec{
			Name: "test",
			Agents: []AgentSpec{
				{ID: "a1"},
				{ID: "a2", Inherits: "nonexistent"},
			},
		},
	}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for unknown agent in inherits field")
	}
}

func TestValidateInheritanceTree_UnknownRoot(t *testing.T) {
	cfg := &TeamConfig{
		Team: TeamSpec{
			Name: "test",
			Agents: []AgentSpec{{ID: "a1"}},
			Inheritance: InheritanceSpec{
				Enabled: true,
				Tree:    InheritanceNode{AgentID: "unknown"},
			},
		},
	}
	if err := cfg.Validate(); err == nil {
		t.Error("expected error for unknown root in inheritance tree")
	}
}

func TestValidate_ValidInheritanceTree(t *testing.T) {
	cfg := &TeamConfig{
		Team: TeamSpec{
			Name: "test",
			Agents: []AgentSpec{
				{ID: "root"},
				{ID: "child1"},
				{ID: "child2"},
			},
			Inheritance: InheritanceSpec{
				Enabled: true,
				Tree: InheritanceNode{
					AgentID: "root",
					Children: []InheritanceNode{
						{AgentID: "child1"},
						{AgentID: "child2"},
					},
				},
			},
		},
	}
	if err := cfg.Validate(); err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func writeTemp(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "team.yaml")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("write temp file: %v", err)
	}
	return path
}
