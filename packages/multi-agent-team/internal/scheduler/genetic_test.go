package scheduler

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// fakePool 用于调度器测试，模拟 agent.Pool 的行为
// 每个 agent 有独立的 taskCh/replyCh，AssignTask 后立即在后台返回成功结果
type fakePool struct {
	mu       sync.Mutex
	agents   map[string]*fakeAgent
	runtimes []protocol.AgentRuntime
}

type fakeAgent struct {
	id      string
	taskCh  chan *agent.TaskAssignment
	replyCh chan *agent.TaskResult
}

func newFakePool(agentIDs []string) *fakePool {
	fp := &fakePool{agents: make(map[string]*fakeAgent)}
	for _, id := range agentIDs {
		fa := &fakeAgent{
			id:      id,
			taskCh:  make(chan *agent.TaskAssignment, 10),
			replyCh: make(chan *agent.TaskResult, 10),
		}
		fp.agents[id] = fa
		fp.runtimes = append(fp.runtimes, protocol.AgentRuntime{
			ID:     id,
			Status: protocol.AgentIdle,
		})
		// 后台 goroutine：收到任务立即返回成功
		go fa.serve()
	}
	return fp
}

func (fa *fakeAgent) serve() {
	for task := range fa.taskCh {
		// 模拟执行耗时，确保多 agent 并发可被观测
		time.Sleep(50 * time.Millisecond)
		fa.replyCh <- &agent.TaskResult{
			TaskID:  task.TaskID,
			Success: true,
			Artifacts: []*protocol.Artifact{
				{ID: task.TaskID, Name: fmt.Sprintf("variant-%s", fa.id), Producer: fa.id},
			},
		}
	}
}

// 以下方法实现 scheduler 对 pool 的调用契约
func (fp *fakePool) AssignTask(agentID string, task *agent.TaskAssignment) error {
	fp.mu.Lock()
	defer fp.mu.Unlock()
	fa, ok := fp.agents[agentID]
	if !ok {
		return fmt.Errorf("agent not found: %s", agentID)
	}
	select {
	case fa.taskCh <- task:
		return nil
	default:
		return fmt.Errorf("agent %s task queue full", agentID)
	}
}

func (fp *fakePool) WaitResult(agentID string, timeout time.Duration) (*agent.TaskResult, error) {
	fp.mu.Lock()
	fa, ok := fp.agents[agentID]
	fp.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("agent not found: %s", agentID)
	}
	select {
	case r := <-fa.replyCh:
		return r, nil
	case <-time.After(timeout):
		return nil, fmt.Errorf("timeout waiting for agent %s", agentID)
	}
}

func (fp *fakePool) ListRuntimes() []protocol.AgentRuntime {
	return fp.runtimes
}

func (fp *fakePool) GetRuntime(agentID string) (*protocol.AgentRuntime, error) {
	for _, rt := range fp.runtimes {
		if rt.ID == agentID {
			rtCopy := rt
			return &rtCopy, nil
		}
	}
	return nil, fmt.Errorf("agent not found: %s", agentID)
}

// adaptFakePool 将 fakePool 转为 GeneticPool 接口
// fakePool 已实现 AssignTask/WaitResult/ListRuntimes，直接满足接口
func adaptFakePool(fp *fakePool) GeneticPool {
	return fp
}

// ensure *fakePool satisfies GeneticPool at compile time
var _ GeneticPool = (*fakePool)(nil)
var _ GeneticPool = (*concurrentCountingPool)(nil)

// TestGeneticSchedulerMultiAgentDistribution 验证变体分散到多个 agent
// 这是 mrcfps 指出的核心问题：变体不应全塞给同一个 agent
func TestGeneticSchedulerMultiAgentDistribution(t *testing.T) {
	fp := newFakePool([]string{"agent-a", "agent-b", "agent-c"})
	b := bus.NewBus()

	s := &GeneticScheduler{
		pool:           adaptFakePool(fp),
		bus:            b,
		populationSize: 3,
		generations:    1,
	}

	plan := &ExecutionPlan{
		Tasks: []Task{
			{ID: "task-1", Prompt: "design a hero", AssignedTo: "agent-a", Timeout: 10},
		},
	}

	results, err := s.Execute(context.Background(), plan)
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}

	if len(results) != 3 {
		t.Fatalf("expected 3 variants, got %d", len(results))
	}

	// 核心断言：3 个变体应该分散到 3 个不同的 agent，而不是全给 agent-a
	agentSet := make(map[string]bool)
	for _, r := range results {
		agentSet[r.AgentID] = true
	}
	if len(agentSet) != 3 {
		t.Errorf("variants distributed to %d agents, want 3 (should spread across all available agents); agents: %v",
			len(agentSet), agentSet)
	}
}

// TestGeneticSchedulerSingleAgentFallback 单 agent 时串行执行，不因排队超时
func TestGeneticSchedulerSingleAgentFallback(t *testing.T) {
	fp := newFakePool([]string{"solo-agent"})
	b := bus.NewBus()

	s := &GeneticScheduler{
		pool:           adaptFakePool(fp),
		bus:            b,
		populationSize: 2,
		generations:    1,
	}

	plan := &ExecutionPlan{
		Tasks: []Task{
			{ID: "task-1", Prompt: "design", AssignedTo: "solo-agent", Timeout: 10},
		},
	}

	start := time.Now()
	results, err := s.Execute(context.Background(), plan)
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 variants, got %d", len(results))
	}
	// 单 agent 串行执行：fakeAgent 每个变体 50ms，两个变体总共约 100ms
	if elapsed < 80*time.Millisecond {
		t.Errorf("single agent serial execution took %v, expected >= 80ms (2 sequential 50ms tasks)", elapsed)
	}
	for _, r := range results {
		if r.AgentID != "solo-agent" {
			t.Errorf("single agent mode: variant assigned to %s, want solo-agent", r.AgentID)
		}
	}
}

// TestGeneticSchedulerCollectAgents 验证 agent 收集逻辑
func TestGeneticSchedulerCollectAgents(t *testing.T) {
	fp := newFakePool([]string{"agent-a", "agent-b", "agent-c"})

	s := &GeneticScheduler{
		pool:           adaptFakePool(fp),
		bus:            bus.NewBus(),
		populationSize: 3,
		generations:    1,
	}

	plan := &ExecutionPlan{
		Tasks: []Task{
			{ID: "task-1", Prompt: "design", AssignedTo: "agent-a", Timeout: 10},
		},
	}

	agents := s.collectAgents(plan)
	// 应该包含 agent-a（plan 显式分配）+ agent-b, agent-c（池补充）
	if len(agents) != 3 {
		t.Errorf("collectAgents returned %d agents, want 3", len(agents))
	}

	seen := make(map[string]bool)
	for _, a := range agents {
		seen[a] = true
	}
	for _, want := range []string{"agent-a", "agent-b", "agent-c"} {
		if !seen[want] {
			t.Errorf("collectAgents missing %s", want)
		}
	}
}

// TestGeneticSchedulerConcurrentVariantCounter 验证多 agent 时变体真正并行
// 通过计数并发执行的变体数，确认不会因单 agent 排队而串行
func TestGeneticSchedulerConcurrentVariantCounter(t *testing.T) {
	fp := newFakePool([]string{"a", "b", "c"})
	b := bus.NewBus()

	var maxConcurrent int32
	var current int32

	// 包装 fakePool，在 AssignTask 时增加并发计数
	wrapped := &concurrentCountingPool{
		fakePool:      fp,
		maxConcurrent: &maxConcurrent,
		current:       &current,
	}

	s := &GeneticScheduler{
		pool:           wrapped,
		bus:            b,
		populationSize: 3,
		generations:    1,
	}

	plan := &ExecutionPlan{
		Tasks: []Task{
			{ID: "task-1", Prompt: "design", AssignedTo: "a", Timeout: 30},
		},
	}

	_, err := s.Execute(context.Background(), plan)
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}

	// 3 个 agent 各执行 1 个变体，应该有并发（至少 2 个同时）
	// 如果全串行，maxConcurrent 永远是 1
	if maxConcurrent < 2 {
		t.Errorf("variants appear to run serially (maxConcurrent=%d), expected parallel execution across agents", maxConcurrent)
	}
}

// concurrentCountingPool 包装 fakePool 统计并发数
// 通过 WaitResult 的阻塞窗口统计真正并发执行的变体数
type concurrentCountingPool struct {
	*fakePool
	maxConcurrent *int32
	current       *int32
}

func (c *concurrentCountingPool) AssignTask(agentID string, task *agent.TaskAssignment) error {
	return c.fakePool.AssignTask(agentID, task)
}

func (c *concurrentCountingPool) WaitResult(agentID string, timeout time.Duration) (*agent.TaskResult, error) {
	// 任务开始执行（WaitResult 阻塞期间 agent 正在处理）
	cur := atomic.AddInt32(c.current, 1)
	for {
		max := atomic.LoadInt32(c.maxConcurrent)
		if cur <= max || atomic.CompareAndSwapInt32(c.maxConcurrent, max, cur) {
			break
		}
	}
	defer atomic.AddInt32(c.current, -1)
	return c.fakePool.WaitResult(agentID, timeout)
}
