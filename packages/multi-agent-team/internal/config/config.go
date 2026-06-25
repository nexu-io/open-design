// Package config YAML 团队配置解析与校验
package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// AgentSpec 单个 Agent 规格定义
// 对应 YAML 中 team.agents[] 节点
type AgentSpec struct {
	ID      string   `yaml:"id"`      // 团队内唯一标识（如 "designer"、"writer"）
	Name    string   `yaml:"name"`    // 人类可读名称
	Role    string   `yaml:"role"`    // 角色描述
	Type    string   `yaml:"type"`    // 运行时类型（如 "claude-code"、"codex"）
	Skills  []string `yaml:"skills"`  // 绑定的技能 ID 列表
	Designs []string `yaml:"designs"` // 绑定的设计系统 ID 列表
}

// TeamConfig 团队配置根结构
// 对应 YAML 文件顶级结构
type TeamConfig struct {
	Team        Team          `yaml:"team"`
	Inheritance InheritanceCfg `yaml:"inheritance"`
}

// Team 团队定义
type Team struct {
	Name      string             `yaml:"name"`
	Mode      string             `yaml:"mode"`      // parallel | serial | genetic | inheritance | hybrid | cycle | complementary
	Agents    []AgentSpec        `yaml:"agents"`
	Experts   []ExpertSpec       `yaml:"experts,omitempty"`    // 互补模式：专家链配置
	Cycle     *CycleSpec         `yaml:"cycle,omitempty"`      // 循环模式：循环参数
}

// InheritanceCfg 继承树配置
// 对应 YAML 中 inheritance: 节点
type InheritanceCfg struct {
	Enabled bool      `yaml:"enabled"`
	Tree    *TreeNode `yaml:"tree"`
}

// TreeNode 继承树节点
type TreeNode struct {
	AgentID  string     `yaml:"agent_id"`
	Children []*TreeNode `yaml:"children"`
}

// ExpertSpec 互补模式中的专家定义
type ExpertSpec struct {
	AgentID   string   `yaml:"agent_id"`
	Role      string   `yaml:"role"`
	Specialty string   `yaml:"specialty"`
	Skills    []string `yaml:"skills,omitempty"`
	Designs   []string `yaml:"designs,omitempty"`
	Order     int      `yaml:"order"`
}

// CycleSpec 循环模式的参数定义
type CycleSpec struct {
	MaxIterations  int     `yaml:"max_iterations"`  // 最大循环轮次 (默认 5)
	ScoreThreshold float64 `yaml:"score_threshold"` // 质量阈值 (0-10, 默认 8.0)
	GeneratorID    string  `yaml:"generator_id"`    // 生成器 Agent ID
	ReviewerID     string  `yaml:"reviewer_id"`     // 评审 Agent ID
}

// Load 从 YAML 文件加载团队配置
func Load(path string) (*TeamConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg TeamConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return &cfg, nil
}

// Validate 校验配置合法性
func (c *TeamConfig) Validate() error {
	supportedModes := map[string]bool{
		"inheritance":   true,
		"parallel":      true,
		"serial":        true,
		"genetic":       true,
		"hybrid":        true,
		"cycle":         true,
		"complementary": true,
	}
	if !supportedModes[c.Team.Mode] {
		return &ValidationError{fmt.Sprintf("unsupported mode %q — supported: inheritance, parallel, serial, genetic, hybrid, cycle, complementary", c.Team.Mode)}
	}

	// 互补模式必须配置 experts
	if c.Team.Mode == "complementary" && len(c.Team.Experts) == 0 {
		return &ValidationError{"complementary mode requires at least one expert in team.experts"}
	}
	if c.Team.Mode == "complementary" {
		orderMap := make(map[int]bool)
		for _, e := range c.Team.Experts {
			if e.AgentID == "" {
				return &ValidationError{"complementary mode: expert agent_id is required"}
			}
			if e.Order <= 0 {
				return &ValidationError{"complementary mode: expert order must be >= 1"}
			}
			if orderMap[e.Order] {
				return &ValidationError{fmt.Sprintf("complementary mode: duplicate expert order %d", e.Order)}
			}
			orderMap[e.Order] = true
		}
	}

	// 循环模式必须配置 cycle 参数
	if c.Team.Mode == "cycle" && c.Team.Cycle == nil {
		return &ValidationError{"cycle mode requires team.cycle configuration"}
	}
	if c.Team.Mode == "cycle" {
		if c.Team.Cycle.GeneratorID == "" {
			return &ValidationError{"cycle mode: generator_id is required"}
		}
		if c.Team.Cycle.ReviewerID == "" {
			return &ValidationError{"cycle mode: reviewer_id is required"}
		}
		if c.Team.Cycle.MaxIterations <= 0 {
			c.Team.Cycle.MaxIterations = 5 // 默认值
		}
		if c.Team.Cycle.ScoreThreshold <= 0 {
			c.Team.Cycle.ScoreThreshold = 8.0 // 默认值
		}
	}

	if len(c.Team.Agents) == 0 {
		return &ValidationError{"team must have at least one agent"}
	}
	seen := make(map[string]bool)
	for _, a := range c.Team.Agents {
		if a.ID == "" {
			return &ValidationError{"agent id is required"}
		}
		if seen[a.ID] {
			return &ValidationError{"duplicate agent id: " + a.ID}
		}
		seen[a.ID] = true
		if a.Type == "" {
			return &ValidationError{"agent type is required for " + a.ID}
		}
	}
	// 校验继承树引用的 agent id 都存在
	if c.Inheritance.Enabled && c.Inheritance.Tree != nil {
		if err := c.validateTree(c.Inheritance.Tree, seen); err != nil {
			return err
		}
	}
	return nil
}

// validateTree 递归校验继承树节点引用的 agent id 都在 agents 列表中
func (c *TeamConfig) validateTree(node *TreeNode, known map[string]bool) error {
	if node == nil {
		return nil
	}
	if node.AgentID == "" {
		return &ValidationError{"inheritance tree node has empty agent_id"}
	}
	if !known[node.AgentID] {
		return &ValidationError{fmt.Sprintf("inheritance tree references unknown agent: %s", node.AgentID)}
	}
	for _, child := range node.Children {
		if err := c.validateTree(child, known); err != nil {
			return err
		}
	}
	return nil
}

// ValidationError 配置校验错误
type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string {
	return "config validation error: " + e.Message
}
