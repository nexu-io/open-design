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
	ModeCycle         TeamMode = "cycle"           // Generator ↔ Reviewer 循环求精
	ModeComplementary TeamMode = "complementary"   // 互补专家链式协作
	ModeSwarm         TeamMode = "swarm"           // 分身集群调度（遗传算法统筹子 Agent）
	ModeEvolution     TeamMode = "evolution"       // 自递归进化：基于历史结果优化 prompt 与参数
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

// ModelType Agent 所使用的大模型类型
type ModelType string

const (
	ModelText        ModelType = "text"        // 纯文本模型
	ModelVision      ModelType = "vision"      // 视觉理解模型（图生文）
	ModelImageGen    ModelType = "image_gen"   // 图像生成模型（文生图）
	ModelMultimodal  ModelType = "multimodal"  // 多模态模型（文本+视觉+生成）
	Model3D          ModelType = "3d"          // 3D 生成模型
)

// AgentCapability Agent 能力描述
type AgentCapability struct {
	Name        string    `json:"name"`
	Skills      []string  `json:"skills,omitempty"`
	Designs     []string  `json:"designs,omitempty"`
	MaxParallel int       `json:"max_parallel"`
	ModelType   ModelType `json:"model_type,omitempty"`   // 模型类型
	ModelName   string    `json:"model_name,omitempty"`   // 模型名称
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

// ===== 自递归进化引擎类型 =====

// EvolutionState 进化状态：基于历史任务结果迭代优化
type EvolutionState struct {
	TaskType        string            `json:"task_type"`        // 任务类别（如 "landing_page", "dashboard"）
	Generation      int               `json:"generation"`       // 当前代次
	BestPrompt      string            `json:"best_prompt"`      // 当前最优 prompt 模板
	Score           float64           `json:"score"`            // 最优 prompt 评分 (0-10)
	History         []EvolutionRecord `json:"history"`          // 进化历史
	ParamTuning     ParamTuning       `json:"param_tuning"`     // 参数自调优
	FitnessLandscape []float64        `json:"fitness_landscape,omitempty"` // 适应度地形
}

// EvolutionRecord 单次进化记录
type EvolutionRecord struct {
	Generation  int       `json:"generation"`
	Prompt      string    `json:"prompt"`
	Score       float64   `json:"score"`
	ArtifactIDs []string  `json:"artifact_ids"`
	Mutations   []string  `json:"mutations"` // 该代应用的变异操作
	CreatedAt   time.Time `json:"created_at"`
}

// ParamTuning 参数自调优（遗传算法参数自动优化）
type ParamTuning struct {
	PopulationSize int     `json:"population_size"`
	Generations    int     `json:"generations"`
	MutationRate   float64 `json:"mutation_rate"`
	CrossoverRate  float64 `json:"crossover_rate"`
	SelectionPressure float64 `json:"selection_pressure"`
}

// ===== 子 Agent 分身 / 集群类型 =====

// CloneSpec 子 Agent（分身）规格
type CloneSpec struct {
	ID          string           `json:"id"`          // 分身 ID
	ParentID    string           `json:"parent_id"`   // 父 Agent ID
	Role        string           `json:"role"`        // 分身的角色
	Capability  AgentCapability  `json:"capability"`  // 能力配置（可独立于父 Agent）
	Depth       int              `json:"depth"`       // 递归深度（0=原始 Agent）
	Inheritance *CloneInheritance `json:"inheritance,omitempty"` // 继承配置
}

// CloneInheritance 分身继承配置
type CloneInheritance struct {
	InheritSkills   bool `json:"inherit_skills"`   // 是否继承父 Agent 技能
	InheritDesigns  bool `json:"inherit_designs"`  // 是否继承设计系统
	InheritMemory   bool `json:"inherit_memory"`   // 是否继承共享记忆
	DivergenceRate  float64 `json:"divergence_rate"` // 变异率（控制分身与父体的差异程度）
}

// SwarmState 分身集群状态（遗传统筹）
type SwarmState struct {
	Generation   int              `json:"generation"`    // 当前世代
	Population   []*CloneSpec     `json:"population"`    // 当前种群
	FitnessScores map[string]float64 `json:"fitness_scores"` // cloneID → 适应度
	BestClone    string           `json:"best_clone"`    // 最优分身 ID
	Elite        []string         `json:"elite"`         // 精英保留列表
	Crossovers   int              `json:"crossovers"`    // 交叉操作次数
	Mutations    int              `json:"mutations"`     // 变异操作次数
}

// ===== 多模态模型注册表类型 =====

// ModelEntry 模型注册条目
type ModelEntry struct {
	Name        string    `json:"name"`         // 模型名称
	Type        ModelType `json:"type"`         // 模型类型
	Provider    string    `json:"provider"`     // 提供商（openai/anthropic/google 等）
	Capabilities []string `json:"capabilities"` // 能力标签
	MaxTokens   int       `json:"max_tokens"`
	CostPer1K   float64   `json:"cost_per_1k"`  // 千token 成本
}

// ModelRegistry 模型注册表
type ModelRegistry struct {
	Models    []ModelEntry           `json:"models"`
	Defaults  map[ModelType]string   `json:"defaults"` // 每种模型类型的默认选择
}
