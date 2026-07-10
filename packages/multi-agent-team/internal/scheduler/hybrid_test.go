package scheduler

import (
	"context"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

func TestHybridScheduler_GroupByDependencyLayers_WithDependencies(t *testing.T) {
	// 验证带依赖链的 hybrid 任务被正确分层：
	// task-designer (无依赖) → Layer 0
	// task-developer (依赖 task-designer) → Layer 1
	// task-copywriter (依赖 task-developer) → Layer 2
	s := &HybridScheduler{}
	tasks := []Task{
		{ID: "task-designer", AssignedTo: "agent-1", Dependencies: nil},
		{ID: "task-developer", AssignedTo: "agent-2", Dependencies: []string{"task-designer"}},
		{ID: "task-copywriter", AssignedTo: "agent-3", Dependencies: []string{"task-developer"}},
	}

	layers := s.groupByDependencyLayers(tasks)

	if len(layers) != 3 {
		t.Fatalf("expected 3 layers, got %d", len(layers))
	}

	// Layer 0 应只有 designer
	if len(layers[0]) != 1 || layers[0][0].ID != "task-designer" {
		t.Errorf("layer 0: expected [task-designer], got %v", taskIDs(layers[0]))
	}

	// Layer 1 应只有 developer
	if len(layers[1]) != 1 || layers[1][0].ID != "task-developer" {
		t.Errorf("layer 1: expected [task-developer], got %v", taskIDs(layers[1]))
	}

	// Layer 2 应只有 copywriter
	if len(layers[2]) != 1 || layers[2][0].ID != "task-copywriter" {
		t.Errorf("layer 2: expected [task-copywriter], got %v", taskIDs(layers[2]))
	}
}

func TestHybridScheduler_GroupByDependencyLayers_NoDependencies(t *testing.T) {
	// 无依赖时所有任务应在同一层 (Layer 0)
	s := &HybridScheduler{}
	tasks := []Task{
		{ID: "task-a", Dependencies: nil},
		{ID: "task-b", Dependencies: nil},
		{ID: "task-c", Dependencies: nil},
	}

	layers := s.groupByDependencyLayers(tasks)

	if len(layers) != 1 {
		t.Fatalf("expected 1 layer, got %d", len(layers))
	}
	if len(layers[0]) != 3 {
		t.Errorf("expected 3 tasks in layer 0, got %d", len(layers[0]))
	}
}

func TestHybridScheduler_PrevLayerArtifactsFlowBetweenLayers(t *testing.T) {
	// 验证 prevLayerArtifacts 在层间正确传递：
	// Layer 0 (designer) 产出 art-designer
	// Layer 1 (developer) 收到 art-designer 并产出 art-developer
	// Layer 2 (copywriter) 收到 art-designer + art-developer

	b := bus.NewBus()
	fp := &controllablePool{
		agents: make(map[string]*controllableAgent),
	}

	designer := &controllableAgent{
		id:      "agent-designer",
		replyCh: make(chan *agent.TaskResult, 1),
	}
	developer := &controllableAgent{
		id:      "agent-developer",
		replyCh: make(chan *agent.TaskResult, 1),
	}
	copywriter := &controllableAgent{
		id:      "agent-copywriter",
		replyCh: make(chan *agent.TaskResult, 1),
	}
	fp.agents["agent-designer"] = designer
	fp.agents["agent-developer"] = developer
	fp.agents["agent-copywriter"] = copywriter

	// 预置各 agent 的结果
	designer.replyCh <- &agent.TaskResult{
		TaskID:    "task-designer",
		Success:   true,
		Artifacts: []*protocol.Artifact{{ID: "art-designer", Name: "design.html"}},
	}
	developer.replyCh <- &agent.TaskResult{
		TaskID:    "task-developer",
		Success:   true,
		Artifacts: []*protocol.Artifact{{ID: "art-developer", Name: "code.tsx"}},
	}
	copywriter.replyCh <- &agent.TaskResult{
		TaskID:    "task-copywriter",
		Success:   true,
		Artifacts: []*protocol.Artifact{{ID: "art-copywriter", Name: "copy.md"}},
	}

	scheduler := NewHybridScheduler(fp, b)

	plan := &ExecutionPlan{
		Tasks: []Task{
			{ID: "task-designer", AssignedTo: "agent-designer", Dependencies: nil, Timeout: 10},
			{ID: "task-developer", AssignedTo: "agent-developer", Dependencies: []string{"task-designer"}, Timeout: 10},
			{ID: "task-copywriter", AssignedTo: "agent-copywriter", Dependencies: []string{"task-developer"}, Timeout: 10},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	results, err := scheduler.Execute(ctx, plan)
	if err != nil {
		t.Fatalf("unexpected Execute error: %v", err)
	}

	if len(results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(results))
	}

	// 验证所有任务都成功
	for _, r := range results {
		if !r.Success {
			t.Errorf("task %s: expected Success=true, got false (err: %s)", r.TaskID, r.Error)
		}
	}

	// 验证每个 agent 产出了预期 artifact
	artifactIDs := make(map[string][]string)
	for _, r := range results {
		for _, a := range r.Artifacts {
			artifactIDs[r.TaskID] = append(artifactIDs[r.TaskID], a.ID)
		}
	}
	if len(artifactIDs["task-designer"]) != 1 || artifactIDs["task-designer"][0] != "art-designer" {
		t.Errorf("task-designer artifacts: expected [art-designer], got %v", artifactIDs["task-designer"])
	}
	if len(artifactIDs["task-developer"]) != 1 || artifactIDs["task-developer"][0] != "art-developer" {
		t.Errorf("task-developer artifacts: expected [art-developer], got %v", artifactIDs["task-developer"])
	}
	if len(artifactIDs["task-copywriter"]) != 1 || artifactIDs["task-copywriter"][0] != "art-copywriter" {
		t.Errorf("task-copywriter artifacts: expected [art-copywriter], got %v", artifactIDs["task-copywriter"])
	}
}

func TestHybridScheduler_LayersExecuteSerially(t *testing.T) {
	// 验证至少两层串行执行：通过追踪 AssignTask 调用来确认
	// Layer 0 的任务先于 Layer 1 的任务被分配

	var mu sync.Mutex
	var execOrder []string

	b := bus.NewBus()
	fp := &orderTrackingPool{
		agents:    make(map[string]*orderTrackingAgent),
		execOrder: &execOrder,
		mu:        &mu,
	}

	fp.agents["agent-designer"] = &orderTrackingAgent{
		id:      "agent-designer",
		replyCh: make(chan *agent.TaskResult, 1),
	}
	fp.agents["agent-developer"] = &orderTrackingAgent{
		id:      "agent-developer",
		replyCh: make(chan *agent.TaskResult, 1),
	}

	fp.agents["agent-designer"].replyCh <- &agent.TaskResult{
		TaskID:  "task-designer",
		Success: true,
	}
	fp.agents["agent-developer"].replyCh <- &agent.TaskResult{
		TaskID:  "task-developer",
		Success: true,
	}

	scheduler := NewHybridScheduler(fp, b)

	plan := &ExecutionPlan{
		Tasks: []Task{
			{ID: "task-designer", AssignedTo: "agent-designer", Dependencies: nil, Timeout: 10},
			{ID: "task-developer", AssignedTo: "agent-developer", Dependencies: []string{"task-designer"}, Timeout: 10},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := scheduler.Execute(ctx, plan)
	if err != nil {
		t.Fatalf("unexpected Execute error: %v", err)
	}

	// designer (Layer 0) 必须先于 developer (Layer 1) 被分配
	if len(execOrder) < 2 {
		t.Fatalf("expected at least 2 AssignTask calls, got %d", len(execOrder))
	}
	if execOrder[0] != "task-designer" {
		t.Errorf("expected task-designer to be assigned first, got %s", execOrder[0])
	}
	if execOrder[1] != "task-developer" {
		t.Errorf("expected task-developer to be assigned second, got %s", execOrder[1])
	}
}

func taskIDs(tasks []Task) []string {
	ids := make([]string, len(tasks))
	for i, t := range tasks {
		ids[i] = t.ID
	}
	sort.Strings(ids)
	return ids
}

// --- order-tracking pool ---

type orderTrackingPool struct {
	agents    map[string]*orderTrackingAgent
	execOrder *[]string
	mu        *sync.Mutex
}

type orderTrackingAgent struct {
	id      string
	replyCh chan *agent.TaskResult
}

func (op *orderTrackingPool) AssignTask(agentID string, task *agent.TaskAssignment) error {
	op.mu.Lock()
	*op.execOrder = append(*op.execOrder, task.TaskID)
	op.mu.Unlock()
	return nil
}

func (op *orderTrackingPool) WaitResult(agentID string, timeout time.Duration) (*agent.TaskResult, error) {
	if a, ok := op.agents[agentID]; ok {
		select {
		case r := <-a.replyCh:
			return r, nil
		case <-time.After(timeout):
			return nil, nil
		}
	}
	return nil, nil
}

func (op *orderTrackingPool) WaitResultContext(ctx context.Context, agentID string, timeout time.Duration) (*agent.TaskResult, error) {
	return op.WaitResult(agentID, timeout)
}

func (op *orderTrackingPool) ListRuntimes() []protocol.AgentRuntime { return nil }
func (op *orderTrackingPool) GetRuntime(_ string) (*protocol.AgentRuntime, error) { return nil, nil }
