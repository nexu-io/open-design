package bus

import (
	"testing"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

func TestPublishSubscribe(t *testing.T) {
	b := New(t.TempDir(), 100)
	defer b.Shutdown()

	// 订阅者
	sub := b.Subscribe("agent-a", 10)

	// 发布消息
	msg := &protocol.Message{
		ID:        "msg-1",
		Type:      protocol.MsgTaskAssign,
		FromAgent: "scheduler",
		ToAgent:   "agent-a",
		Payload:   "test task",
	}

	if err := b.Publish(msg); err != nil {
		t.Fatalf("Publish failed: %v", err)
	}

	// 接收消息
	select {
	case received := <-sub:
		if received.ID != "msg-1" {
			t.Errorf("message ID = %q, want %q", received.ID, "msg-1")
		}
		if received.Type != protocol.MsgTaskAssign {
			t.Errorf("type = %q, want %q", received.Type, protocol.MsgTaskAssign)
		}
	case <-time.After(time.Second):
		t.Error("timeout waiting for message")
	}
}

func TestBroadcast(t *testing.T) {
	b := New(t.TempDir(), 100)
	defer b.Shutdown()

	sub1 := b.Subscribe("agent-a", 10)
	sub2 := b.Subscribe("agent-b", 10)

	msg := &protocol.Message{
		ID:   "msg-broadcast",
		Type: protocol.MsgContextSync,
		// ToAgent 和 ToTeam 都为空 → 广播
	}

	if err := b.Publish(msg); err != nil {
		t.Fatalf("Publish failed: %v", err)
	}

	// 两个订阅者都应收到
	for name, sub := range map[string]<-chan *protocol.Message{"agent-a": sub1, "agent-b": sub2} {
		select {
		case received := <-sub:
			if received.ID != "msg-broadcast" {
				t.Errorf("%s: message ID = %q, want %q", name, received.ID, "msg-broadcast")
			}
		case <-time.After(time.Second):
			t.Errorf("%s: timeout waiting for broadcast", name)
		}
	}
}

func TestTeamBroadcast(t *testing.T) {
	b := New(t.TempDir(), 100)
	defer b.Shutdown()

	subA := b.Subscribe("agent-a", 10)
	subTeam := b.Subscribe("team:design-team", 10)

	msg := &protocol.Message{
		ID:     "msg-team",
		Type:   protocol.MsgStatusReport,
		ToTeam: "design-team",
	}

	if err := b.Publish(msg); err != nil {
		t.Fatalf("Publish failed: %v", err)
	}

	// 团队订阅者应收到
	select {
	case <-subTeam:
		// ok
	case <-time.After(time.Second):
		t.Error("team subscriber timeout")
	}

	// 非团队订阅者不应收到
	select {
	case <-subA:
		t.Error("agent-a should not receive team broadcast")
	case <-time.After(50 * time.Millisecond):
		// ok
	}
}

func TestUnsubscribe(t *testing.T) {
	b := New(t.TempDir(), 100)
	defer b.Shutdown()

	sub := b.Subscribe("agent-a", 10)
	b.Unsubscribe("agent-a")

	// 取消订阅后通道应被关闭
	_, ok := <-sub
	if ok {
		t.Error("channel should be closed after unsubscribe")
	}
}

func TestQueueOverflow(t *testing.T) {
	b := New(t.TempDir(), 3) // 最大队列 3

	// 发布 5 条消息，前 2 条应被覆盖
	for i := 0; i < 5; i++ {
		msg := &protocol.Message{
			ID:   string(rune('a' + i)),
			Type: protocol.MsgTaskAssign,
		}
		b.Publish(msg)
	}

	if b.QueueLen() != 3 {
		t.Errorf("queue len = %d, want 3", b.QueueLen())
	}
}

func TestArtifactDir(t *testing.T) {
	dir := t.TempDir()
	b := New(dir, 100)
	if b.ArtifactDir() != dir {
		t.Errorf("ArtifactDir = %q, want %q", b.ArtifactDir(), dir)
	}
}
