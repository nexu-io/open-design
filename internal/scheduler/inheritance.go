package scheduler

import (
	"context"
	"fmt"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// InheritanceScheduler 继承链调度器：子 Agent 继承父 Agent 的技能/设计/上下文
type InheritanceScheduler struct {
	pool *agent.Pool
	bus  *bus.CommunicationBus
}

// NewInheritanceScheduler 创建继承链调度器
func NewInheritanceScheduler(pool *agent.Pool, b *bus.CommunicationBus) *InheritanceScheduler {
	return &InheritanceScheduler{pool: pool, bus: b}
}

func (s *InheritanceScheduler) Mode() protocol.TeamMode {
	return protocol.ModeInheritance
}

// Execute 执行继承链调度：先执行父任务，再将结果继承给子任务
func (s *InheritanceScheduler) Execute(ctx context.Context, plan *ExecutionPlan) ([]*TaskResult, error) {
	if len(plan.Tasks) == 0 {
		return nil, fmt.Errorf("no tasks to execute")
	}

	// 构建继承树
	tree := s.buildTree(plan.Tasks)
	if tree == nil {
		return nil, fmt.Errorf("failed to build inheritance tree")
	}

	var allResults []*TaskResult

	// 从根节点开始递归执行
	results, err := s.executeNode(ctx, tree, nil)
	if err != nil {
		return allResults, err
	}
	allResults = append(allResults, results...)

	return allResults, nil
}

// treeNode 继承树节点
type treeNode struct {
	Task     Task
	Children []*treeNode
}

// buildTree 从任务列表构建继承树
func (s *InheritanceScheduler) buildTree(tasks []Task) *treeNode {
	taskMap := make(map[string]*Task)
	for i := range tasks {
		taskMap[tasks[i].ID] = &tasks[i]
	}

	// 找根节点（无依赖的任务中第一个，或显式标记为根的）
	var roots []*Task
	for i := range tasks {
		if len(tasks[i].Dependencies) == 0 {
			roots = append(roots, &tasks[i])
		}
	}

	if len(roots) == 0 {
		return nil
	}

	// 构建子节点映射
	childrenMap := make(map[string][]*Task)
	for i := range tasks {
		for _, dep := range tasks[i].Dependencies {
			childrenMap[dep] = append(childrenMap[dep], &tasks[i])
		}
	}

	// 递归构建树
	var buildNode func(t *Task) *treeNode
	buildNode = func(t *Task) *treeNode {
		node := &treeNode{Task: *t}
		for _, child := range childrenMap[t.ID] {
			node.Children = append(node.Children, buildNode(child))
		}
		return node
	}

	return buildNode(roots[0])
}

// executeNode 递归执行继承树节点
func (s *InheritanceScheduler) executeNode(ctx context.Context, node *treeNode, parentResult *TaskResult) ([]*TaskResult, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	// 构建继承上下文
	inheritCtx := &agent.ContextSnapshot{
		Memory: make(map[string]any),
	}

	if parentResult != nil {
		// 继承父节点的工件
		inheritCtx.ParentTask = parentResult.TaskID
		inheritCtx.AgentID = parentResult.AgentID
		for _, a := range parentResult.Artifacts {
			inheritCtx.ArtifactIDs = append(inheritCtx.ArtifactIDs, a.ID)
		}
		// 传递继承深度信息（安全访问，防止空 Artifacts 导致 panic）
		inheritCtx.Memory["inheritance_depth"] = 1
		if len(parentResult.Artifacts) > 0 {
			if d, ok := parentResult.Artifacts[0].Metadata["inheritance_depth"]; ok {
				inheritCtx.Memory["inheritance_depth"] = d
			}
		}
	}

	// 设置任务上下文
	node.Task.Context = inheritCtx

	// 选择 Agent（子节点可继承父节点的 Agent 或使用自己的指定 Agent）
	agentID := node.Task.AssignedTo
	if agentID == "" && parentResult != nil {
		agentID = parentResult.AgentID // 默认继承父节点 Agent
	}
	if agentID == "" {
		agentID = s.pickAgent()
	}

	// 构建任务分配
	timeout := time.Duration(node.Task.Timeout) * time.Second
	if timeout == 0 {
		timeout = 10 * time.Minute
	}

	assignment := &agent.TaskAssignment{
		TaskID:    node.Task.ID,
		Prompt:    node.Task.Prompt,
		Context:   inheritCtx,
		Timeout:   timeout,
	}

	// 发布事件
	s.bus.Publish(&protocol.Message{
		Type:      protocol.MsgTaskAssign,
		FromAgent: "inheritance-scheduler",
		ToAgent:   agentID,
		Payload:   assignment,
		Metadata: map[string]string{
			"task_id":     node.Task.ID,
			"inheritance": "true",
		},
	})

	// 分配并等待
	if err := s.pool.AssignTask(agentID, assignment); err != nil {
		return nil, fmt.Errorf("assign task %s: %w", node.Task.ID, err)
	}

	result, err := s.pool.WaitResult(agentID, timeout)
	if err != nil {
		return nil, fmt.Errorf("wait result for task %s: %w", node.Task.ID, err)
	}

	taskResult := &TaskResult{
		TaskID:    result.TaskID,
		AgentID:   agentID,
		Success:   result.Success,
		Artifacts: result.Artifacts,
		Error:     result.Error,
		Metrics:   result.Metrics,
	}

	// 发布完成事件
	s.bus.Publish(&protocol.Message{
		Type:      protocol.MsgTaskComplete,
		FromAgent: agentID,
		Payload:   result,
		Metadata:  map[string]string{"task_id": node.Task.ID},
	})

	var allResults []*TaskResult
	allResults = append(allResults, taskResult)

	// 递归执行子节点
	for _, child := range node.Children {
		childResults, err := s.executeNode(ctx, child, taskResult)
		if err != nil {
			return allResults, err
		}
		allResults = append(allResults, childResults...)
	}

	return allResults, nil
}

// pickAgent 选择空闲 Agent
func (s *InheritanceScheduler) pickAgent() string {
	runtimes := s.pool.ListRuntimes()
	for _, rt := range runtimes {
		if rt.Status == protocol.AgentIdle {
			return rt.ID
		}
	}
	if len(runtimes) > 0 {
		return runtimes[0].ID
	}
	return ""
}
