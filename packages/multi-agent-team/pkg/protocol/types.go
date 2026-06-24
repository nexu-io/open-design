// Package protocol 多 Agent 团队协作核心类型定义
package protocol

import "time"

// TeamMode 团队协作模式
type TeamMode string

const (
	ModeParallel      TeamMode = "parallel"
	ModeSerial        TeamMode = "serial"
	ModeGenetic       TeamMode = "genetic"
	ModeInheritance   TeamMode = "inheritance"
	ModeHybrid        TeamMode = "hybrid"
	ModeCycle         TeamMode = "cycle"         // Generator ↔ Reviewer 循环求精
	ModeComplementary TeamMode = "complementary" // 互补专家链式协作
)

// AgentStatus Agent 运行时状态
type AgentStatus string

const (
	AgentIdle  AgentStatus = "idle"
	AgentBusy  AgentStatus = "busy"
	AgentError AgentStatus = "error"
)

// ArtifactType 工件类型
type ArtifactType string

const (
	ArtifactDesign ArtifactType = "design"
	ArtifactCopy   ArtifactType = "copy"
	ArtifactCode   ArtifactType = "code"
)

// MessageType 消息类型
type MessageType string

const (
	MsgTaskAssign      MessageType = "task_assign"
	MsgTaskComplete    MessageType = "task_complete"
	MsgContextSync     MessageType = "context_sync"
	MsgStatusReport    MessageType = "status_report"
	MsgCycleFeedback   MessageType = "cycle_feedback"   // 循环模式：评审反馈
	MsgExpertHandoff   MessageType = "expert_handoff"   // 互补模式：专家交接
	MsgSynthesisResult MessageType = "synthesis_result" // 互补模式：综合结果
)

// Artifact 工件（Agent 产出物）
type Artifact struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Type      ArtifactType      `json:"type"`
	Path      string            `json:"path"`
	Size      int64             `json:"size"`
	Producer  string            `json:"producer"`
	CreatedAt time.Time         `json:"created_at"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

// AgentCapability Agent 能力描述
type AgentCapability struct {
	Name        string   `json:"name"`
	Skills      []string `json:"skills,omitempty"`
	Designs     []string `json:"designs,omitempty"`
	MaxParallel int      `json:"max_parallel"`
}

// AgentRuntime Agent 运行时信息
type AgentRuntime struct {
	ID          string           `json:"id"`
	Status      AgentStatus      `json:"status"`
	CurrentTask string           `json:"current_task,omitempty"`
	LastSeen    time.Time        `json:"last_seen"`
	Capability  AgentCapability  `json:"capability"`
}

// Message 发布订阅通信总线消息
type Message struct {
	Type      MessageType       `json:"type"`
	FromAgent string            `json:"from_agent"`
	ToAgent   string            `json:"to_agent,omitempty"`
	Payload   any               `json:"payload"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

// CycleFeedback 循环模式中的评审反馈
type CycleFeedback struct {
	Cycle    int      `json:"cycle"`    // 当前循环轮次
	Draft    string   `json:"draft"`    // 被评审的草稿
	Score    float64  `json:"score"`    // 评分 (0-10)
	Feedback string   `json:"feedback"` // 具体改进建议
	Strengths []string `json:"strengths,omitempty"` // 优点
	Weaknesses []string `json:"weaknesses,omitempty"` // 待改进点
	ShouldStop bool   `json:"should_stop"` // 是否应该终止循环
}

// CycleState 循环模式的运行时状态
type CycleState struct {
	Draft        string          `json:"draft"`         // 当前草稿
	Feedback     string          `json:"feedback"`      // 最新反馈
	Score        float64         `json:"score"`         // 最新评分
	Iteration    int             `json:"iteration"`     // 已完成轮次
	MaxIterations int            `json:"max_iterations"` // 最大允许轮次
	ScoreThreshold float64       `json:"score_threshold"` // 目标评分阈值
	History      []CycleFeedback `json:"history"`       // 完整评审历史
}

// ExpertDefinition 互补模式中的专家定义
type ExpertDefinition struct {
	AgentID   string   `json:"agent_id"`   // 绑定的 Agent ID
	Role      string   `json:"role"`       // 角色描述（如 "设计师"/"文案"/"开发"）
	Specialty string   `json:"specialty"`  // 专业领域（如 "视觉设计"/"品牌文案"/"前端开发"）
	Skills    []string `json:"skills"`     // 关联的技能 ID
	Designs   []string `json:"designs"`    // 关联的设计系统 ID
	Order     int      `json:"order"`      // 专家链中的顺序 (1-based)
}
