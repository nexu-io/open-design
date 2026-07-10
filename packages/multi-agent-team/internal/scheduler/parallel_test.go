package scheduler

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

func TestParallelScheduler_ProceedReturnsPartialResults(t *testing.T) {
	// 场景：2 个 agent 并行执行，agent-A 立即完成，agent-B 阻塞。
	// 用户点击 proceed → 调度器应返回 agent-A 的已完成结果 + agent-B 的 skipped 标记，
	// 而不是一直阻塞等待 agent-B。

	// 构建一个可控的 fake pool：agent-B 在收到 proceed 信号后才会完成。
	b := bus.NewBus()
	fp := &controllablePool{
		agents: make(map[string]*controllableAgent),
	}
	agentA := &controllableAgent{
		id:      "agent-a",
		replyCh: make(chan *agent.TaskResult, 1),
		// agent-a 立即完成
		delay: 0,
	}
	agentB := &controllableAgent{
		id:      "agent-b",
		replyCh: make(chan *agent.TaskResult, 1),
		// agent-b 慢任务，阻塞直到收到 proceed
		delay: 30 * time.Second,
	}
	fp.agents["agent-a"] = agentA
	fp.agents["agent-b"] = agentB

	// 预先放入 agent-a 的结果，模拟其已执行完成
	agentA.replyCh <- &agent.TaskResult{
		TaskID:    "task-a",
		Success:   true,
		Artifacts: []*protocol.Artifact{{ID: "art-a", Name: "result-a.html"}},
	}

	scheduler := NewParallelScheduler(fp, b)

	plan := &ExecutionPlan{
		Tasks: []Task{
			{ID: "task-a", AssignedTo: "agent-a", Timeout: 10},
			{ID: "task-b", AssignedTo: "agent-b", Timeout: 600},
		},
	}

	// 创建 proceed/skip channel
	skipCh := make(chan struct{}, 1)
	scheduler.SetSkipChannel(skipCh)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var results []*TaskResult
	var execErr error
	done := make(chan struct{})

	go func() {
		results, execErr = scheduler.Execute(ctx, plan)
		close(done)
	}()

	// 等待 agent-a 的结果被处理（给一点时间让 goroutine 调度）
	time.Sleep(100 * time.Millisecond)

	// 模拟用户点击 proceed → 发送 skip 信号
	close(skipCh)

	// 等待 Execute 返回（应在 agent-b 完成前返回）
	select {
	case <-done:
		// 预期：正常返回
	case <-time.After(3 * time.Second):
		t.Fatal("Execute did not return within 3s after proceed — skip channel did not unblock the wait")
	}

	if execErr != nil {
		t.Fatalf("unexpected Execute error: %v", execErr)
	}

	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}

	// agent-a 的结果应该是成功的
	var foundA, foundB bool
	for _, r := range results {
		switch r.TaskID {
		case "task-a":
			foundA = true
			if !r.Success {
				t.Errorf("task-a: expected Success=true, got false")
			}
			if r.Skipped {
				t.Errorf("task-a: expected Skipped=false, got true")
			}
			if len(r.Artifacts) == 0 {
				t.Errorf("task-a: expected artifacts, got none")
			}
		case "task-b":
			foundB = true
			if r.Success {
				t.Errorf("task-b: expected Success=false (skipped), got true")
			}
			if !r.Skipped {
				t.Errorf("task-b: expected Skipped=true, got false")
			}
		}
	}
	if !foundA {
		t.Errorf("missing result for task-a")
	}
	if !foundB {
		t.Errorf("missing result for task-b")
	}
}

func TestParallelScheduler_AllAgentsCompleteBeforeProceed(t *testing.T) {
	// 所有 agent 都正常完成，proceed signal 应该不产生任何影响。
	b := bus.NewBus()
	fp := &controllablePool{
		agents: make(map[string]*controllableAgent),
	}
	agentA := &controllableAgent{
		id:      "agent-a",
		replyCh: make(chan *agent.TaskResult, 1),
		delay:   0,
	}
	agentB := &controllableAgent{
		id:      "agent-b",
		replyCh: make(chan *agent.TaskResult, 1),
		delay:   0,
	}
	fp.agents["agent-a"] = agentA
	fp.agents["agent-b"] = agentB

	agentA.replyCh <- &agent.TaskResult{TaskID: "task-a", Success: true}
	agentB.replyCh <- &agent.TaskResult{TaskID: "task-b", Success: true}

	scheduler := NewParallelScheduler(fp, b)

	plan := &ExecutionPlan{
		Tasks: []Task{
			{ID: "task-a", AssignedTo: "agent-a", Timeout: 10},
			{ID: "task-b", AssignedTo: "agent-b", Timeout: 10},
		},
	}

	skipCh := make(chan struct{}, 1)
	scheduler.SetSkipChannel(skipCh)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	results, err := scheduler.Execute(ctx, plan)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	for _, r := range results {
		if !r.Success {
			t.Errorf("task %s: expected Success=true", r.TaskID)
		}
		if r.Skipped {
			t.Errorf("task %s: expected Skipped=false", r.TaskID)
		}
	}
}

// --- Controllable fake pool (not using goroutine dispatch, results are pre-seeded) ---

type controllablePool struct {
	mu     sync.Mutex
	agents map[string]*controllableAgent
}

type controllableAgent struct {
	id      string
	replyCh chan *agent.TaskResult
	delay   time.Duration
}

func (cp *controllablePool) AssignTask(agentID string, task *agent.TaskAssignment) error {
	cp.mu.Lock()
	defer cp.mu.Unlock()
	if _, ok := cp.agents[agentID]; !ok {
		return nil
	}
	return nil
}

func (cp *controllablePool) WaitResult(agentID string, timeout time.Duration) (*agent.TaskResult, error) {
	cp.mu.Lock()
	ca, ok := cp.agents[agentID]
	cp.mu.Unlock()
	if !ok {
		return nil, nil
	}
	select {
	case r := <-ca.replyCh:
		return r, nil
	case <-time.After(timeout):
		return nil, nil
	}
}

func (cp *controllablePool) WaitResultContext(ctx context.Context, agentID string, timeout time.Duration) (*agent.TaskResult, error) {
	cp.mu.Lock()
	ca, ok := cp.agents[agentID]
	cp.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("agent not found: %s", agentID)
	}
	select {
	case r := <-ca.replyCh:
		return r, nil
	case <-ctx.Done():
		return nil, fmt.Errorf("wait cancelled for agent %s: %w", agentID, ctx.Err())
	case <-time.After(timeout):
		return nil, fmt.Errorf("timeout waiting for agent %s", agentID)
	}
}

func (cp *controllablePool) ListRuntimes() []protocol.AgentRuntime { return nil }
func (cp *controllablePool) GetRuntime(_ string) (*protocol.AgentRuntime, error) { return nil, nil }
