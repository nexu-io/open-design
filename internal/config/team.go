// Package config 团队配置文件解析与管理
package config

import (
	"fmt"
	"os"

	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
	"gopkg.in/yaml.v3"
)

// TeamConfig 团队配置定义
type TeamConfig struct {
	Version  string          `yaml:"version"`
	Team     TeamSpec        `yaml:"team"`
	Pipeline *PipelineSpec    `yaml:"pipeline,omitempty"`
	Genetic  *GeneticSpec     `yaml:"genetic,omitempty"`
}

// TeamSpec 团队规格
type TeamSpec struct {
	Name         string              `yaml:"name"`
	Description  string              `yaml:"description"`
	Mode         protocol.TeamMode   `yaml:"mode"`
	MaxRetries   int                 `yaml:"max_retries"`
	Timeout      string              `yaml:"timeout"` // 如 "30m"
	Agents       []AgentSpec         `yaml:"agents"`
	Inheritance  InheritanceSpec     `yaml:"inheritance,omitempty"`
}

// AgentSpec 团队内 Agent 规格
type AgentSpec struct {
	ID          string                   `yaml:"id"`
	Name        string                   `yaml:"name"`
	Role        string                   `yaml:"role"`        // 角色描述
	Type        string                   `yaml:"type"`        // Agent 类型 (claude-code, codex, cursor, ...)
	Skills      []string                 `yaml:"skills"`      // 技能路径或名称
	Designs     []string                 `yaml:"designs"`     // 设计系统
	Config      map[string]any           `yaml:"config"`      // Agent 特有配置
	Inherits    string                   `yaml:"inherits"`    // 继承自哪个 Agent
}

// PipelineSpec 串行管线规格（serial 模式）
type PipelineSpec struct {
	Stages []PipelineStage `yaml:"stages"`
}

// PipelineStage 管线阶段
type PipelineStage struct {
	Name       string   `yaml:"name"`
	Agent      string   `yaml:"agent"`      // 执行 Agent ID
	DependsOn  []string `yaml:"depends_on"` // 依赖的前置阶段
	InputFrom  string   `yaml:"input_from"` // 从哪个阶段获取输入
	OutputAs   string   `yaml:"output_as"`  // 输出工件命名
}

// GeneticSpec 遗传算法配置
type GeneticSpec struct {
	PopulationSize int     `yaml:"population_size"` // 种群大小
	Generations    int     `yaml:"generations"`      // 最大代数
	MutationRate   float64 `yaml:"mutation_rate"`    // 变异率 (0-1)
	CrossoverRate  float64 `yaml:"crossover_rate"`   // 交叉率 (0-1)
	Elitism        int     `yaml:"elitism"`          // 精英保留数
	SelectionMode  string  `yaml:"selection_mode"`   // tournament / roulette / rank
	FitnessFunc    string  `yaml:"fitness_func"`     // 适应度函数名
	StopEarly      int     `yaml:"stop_early"`       // 连续 N 代无改进则提前终止
	ParallelEval   bool    `yaml:"parallel_eval"`    // 并行评估
}

// InheritanceSpec 继承链配置
type InheritanceSpec struct {
	Enabled    bool     `yaml:"enabled"`
	Tree       InheritanceNode   `yaml:"tree"`
	ShareScope []string `yaml:"share_scope"` // skill / design / context / artifact
}

// InheritanceNode 继承树节点
type InheritanceNode struct {
	AgentID  string             `yaml:"agent_id"`
	Children []InheritanceNode  `yaml:"children,omitempty"`
}

// Load 从文件加载团队配置
func Load(path string) (*TeamConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config file: %w", err)
	}

	var cfg TeamConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("validate config: %w", err)
	}

	return &cfg, nil
}

// Validate 校验配置合法性
func (c *TeamConfig) Validate() error {
	if c.Team.Name == "" {
		return fmt.Errorf("team name is required")
	}
	if len(c.Team.Agents) == 0 {
		return fmt.Errorf("at least one agent is required")
	}

	// 检查 Agent ID 唯一性
	ids := make(map[string]bool)
	for _, a := range c.Team.Agents {
		if a.ID == "" {
			return fmt.Errorf("agent ID is required")
		}
		if ids[a.ID] {
			return fmt.Errorf("duplicate agent ID: %s", a.ID)
		}
		ids[a.ID] = true
	}

	// 模式特定校验
	switch c.Team.Mode {
	case protocol.ModeGenetic:
		if c.Genetic == nil {
			return fmt.Errorf("genetic mode requires genetic config")
		}
		if c.Genetic.PopulationSize < 2 {
			return fmt.Errorf("population_size must be >= 2")
		}
	case protocol.ModeSerial:
		if c.Pipeline == nil || len(c.Pipeline.Stages) == 0 {
			return fmt.Errorf("serial mode requires pipeline stages")
		}
		// 校验 pipeline 中引用的 Agent ID 是否存在
		for _, stage := range c.Pipeline.Stages {
			if !ids[stage.Agent] {
				return fmt.Errorf("pipeline stage %q references unknown agent: %s", stage.Name, stage.Agent)
			}
		}
	}

	// 校验继承链中引用的 Agent ID
	if c.Team.Inheritance.Enabled {
		if err := c.validateInheritanceTree(c.Team.Inheritance.Tree, ids); err != nil {
			return err
		}
	}

	// 校验 Agent inherits 字段引用
	for _, a := range c.Team.Agents {
		if a.Inherits != "" && !ids[a.Inherits] {
			return fmt.Errorf("agent %q inherits unknown agent: %s", a.ID, a.Inherits)
		}
	}

	return nil
}

// GetAgent 按 ID 获取 Agent 配置
func (c *TeamConfig) GetAgent(id string) (*AgentSpec, error) {
	for _, a := range c.Team.Agents {
		if a.ID == id {
			return &a, nil
		}
	}
	return nil, fmt.Errorf("agent not found: %s", id)
}

// validateInheritanceTree 递归校验继承树中引用的 Agent ID
func (c *TeamConfig) validateInheritanceTree(node InheritanceNode, validIDs map[string]bool) error {
	if !validIDs[node.AgentID] {
		return fmt.Errorf("inheritance tree references unknown agent: %s", node.AgentID)
	}
	for _, child := range node.Children {
		if err := c.validateInheritanceTree(child, validIDs); err != nil {
			return err
		}
	}
	return nil
}
