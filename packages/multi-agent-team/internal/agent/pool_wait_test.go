package agent

import (
	"context"
	"testing"
	"time"
)

// TestWaitResultContext_DrainOnCancel 验证：ctx 被取消时，如果 replyCh
// 中已有已完成的结果，优先返回结果而非 cancellation error。
// 这是修复 partial-results 场景中已完成结果因 select 竞态丢失的核心测试。
func TestWaitResultContext_DrainOnCancel(t *testing.T) {
	ma := &ManagedAgent{
		replyCh: make(chan *TaskResult, 1),
		ctx:     context.Background(),
	}

	// 模拟 agent 刚好在 cancel 瞬间将结果写入 replyCh
	expectedResult := &TaskResult{
		TaskID:  "task-1",
		Success: true,
	}
	ma.replyCh <- expectedResult

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // 立即取消，模拟 proceed signal

	pool := &Pool{
		agents: map[string]*ManagedAgent{"agent-A": ma},
	}

	result, err := pool.WaitResultContext(ctx, "agent-A", 5*time.Second)
	if err != nil {
		t.Fatalf("expected result to be returned even with cancelled ctx, got error: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.TaskID != "task-1" {
		t.Errorf("expected taskID=task-1, got %s", result.TaskID)
	}
	if !result.Success {
		t.Error("expected Success=true")
	}
}

// TestWaitResultContext_CancelNoResult 验证：ctx 被取消且 replyCh 为空时，
// 返回 cancellation error。
func TestWaitResultContext_CancelNoResult(t *testing.T) {
	ma := &ManagedAgent{
		replyCh: make(chan *TaskResult, 1),
		ctx:     context.Background(),
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	pool := &Pool{
		agents: map[string]*ManagedAgent{"agent-B": ma},
	}

	result, err := pool.WaitResultContext(ctx, "agent-B", 5*time.Second)
	if err == nil {
		t.Fatal("expected error for cancelled ctx with no result, got nil")
	}
	if result != nil {
		t.Errorf("expected nil result, got %+v", result)
	}
}

// TestWaitResultContext_DrainOnTimeout 验证：超时时如果 replyCh 中有结果，
// 优先返回结果。虽然 timeout 前 cancel 的概率较低，但 channel 缓冲可能
// 导致结果刚好在超时到达。
func TestWaitResultContext_DrainOnTimeout(t *testing.T) {
	ma := &ManagedAgent{
		replyCh: make(chan *TaskResult, 1),
		ctx:     context.Background(),
	}

	expectedResult := &TaskResult{
		TaskID:  "task-2",
		Success: true,
	}
	ma.replyCh <- expectedResult

	pool := &Pool{
		agents: map[string]*ManagedAgent{"agent-C": ma},
	}

	result, err := pool.WaitResultContext(context.Background(), "agent-C", 1*time.Millisecond)
	if err != nil {
		t.Fatalf("expected result even with short timeout, got error: %v", err)
	}
	if result == nil || result.TaskID != "task-2" {
		t.Errorf("expected taskID=task-2, got %+v", result)
	}
}

// TestWaitResultContext_AgentNotFound 验证 agent 不存在时返回错误
func TestWaitResultContext_AgentNotFound(t *testing.T) {
	pool := &Pool{
		agents: map[string]*ManagedAgent{},
	}

	_, err := pool.WaitResultContext(context.Background(), "nonexistent", 1*time.Second)
	if err == nil {
		t.Fatal("expected error for nonexistent agent")
	}
}
