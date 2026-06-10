// Package protocol 定义多 Agent 协作模块的通信协议与核心类型
package protocol

import "time"

// MessageType 消息类型枚举
type MessageType string

const (
	MsgTaskAssign   MessageType = "task_assign"   // 任务分配
	MsgTaskComplete MessageType = "task_complete"  // 任务完成
	MsgTaskFail     MessageType = "task_fail"      // 任务失败
	MsgArtifact     MessageType = "artifact"       // 工件传输
	MsgContextSync  MessageType = "context_sync"   // 上下文同步
	MsgHeartbeat    MessageType = "heartbeat"      // 心跳
	MsgStatusReport MessageType = "status_report"  // 状态报告
)

// Message Agent 间通信消息
type Message struct {
	ID          string            `json:"id"`
	Type        MessageType       `json:"type"`
	FromAgent   string            `json:"from_agent"`
	ToAgent     string            `json:"to_agent"`   // 空表示广播
	ToTeam      string            `json:"to_team"`    // 团队广播
	Payload     any               `json:"payload"`
	Metadata    map[string]string `json:"metadata"`
	Timestamp   time.Time         `json:"timestamp"`
	Correlation string            `json:"correlation"` // 关联的任务/会话 ID
}

// Artifact Agent 产出的工件（设计稿、代码、文档等）
type Artifact struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Type        ArtifactType      `json:"type"`
	ContentType string            `json:"content_type"` // MIME type
	Path        string            `json:"path"`         // 文件系统路径
	Size        int64             `json:"size"`
	Checksum    string            `json:"checksum"`     // SHA256
	Producer    string            `json:"producer"`     // 产出 Agent ID
	Version     int               `json:"version"`
	Parents     []string          `json:"parents"`      // 派生来源工件 ID
	Metadata    map[string]string `json:"metadata"`
	CreatedAt   time.Time         `json:"created_at"`
}

// ArtifactType 工件类型
type ArtifactType string

const (
	ArtifactDesign    ArtifactType = "design"     // 设计稿
	ArtifactCode      ArtifactType = "code"       // 代码
	ArtifactDocument  ArtifactType = "document"   // 文档
	ArtifactAsset     ArtifactType = "asset"      // 静态资源
	ArtifactConfig    ArtifactType = "config"     // 配置
	ArtifactSkill     ArtifactType = "skill"      // 技能文件
	ArtifactData      ArtifactType = "data"       // 数据文件
	ArtifactComposite ArtifactType = "composite"  // 复合工件（多文件）
	ArtifactHTML      ArtifactType = "html"       // HTML 原型
	ArtifactMarkdown  ArtifactType = "markdown"   // Markdown 文档
	ArtifactImage     ArtifactType = "image"      // 图片
	ArtifactVideo     ArtifactType = "video"      // 视频
	ArtifactPPTX      ArtifactType = "pptx"       // 演示文稿
	ArtifactCopy      ArtifactType = "copy"       // 文案/文本
)

// AgentCapability Agent 能力描述
type AgentCapability struct {
	Name        string   `json:"name"`
	Skills      []string `json:"skills"`      // 拥有的技能
	Designs     []string `json:"designs"`     // 精通的 DESIGN.md 系统
	OutputTypes []string `json:"output_types"` // 支持的输出类型
	MaxParallel int      `json:"max_parallel"` // 最大并行任务数
}

// AgentStatus Agent 运行时状态
type AgentStatus string

const (
	AgentIdle    AgentStatus = "idle"
	AgentBusy    AgentStatus = "busy"
	AgentError   AgentStatus = "error"
	AgentOffline AgentStatus = "offline"
)

// AgentRuntime Agent 运行时信息
type AgentRuntime struct {
	ID          string           `json:"id"`
	Status      AgentStatus      `json:"status"`
	Capability  AgentCapability  `json:"capability"`
	CurrentTask string           `json:"current_task"` // 当前执行的任务 ID
	QueueDepth  int              `json:"queue_depth"`
	LastSeen    time.Time        `json:"last_seen"`
}

// TeamMode 团队协作模式
type TeamMode string

const (
	ModeParallel    TeamMode = "parallel"    // 并行执行
	ModeSerial      TeamMode = "serial"      // 串行管线
	ModeGenetic     TeamMode = "genetic"     // 遗传进化
	ModeHybrid      TeamMode = "hybrid"      // 混合模式
	ModeInheritance TeamMode = "inheritance" // 继承链
)
