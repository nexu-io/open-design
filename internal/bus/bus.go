// Package bus 提供 Agent 间通信总线：消息队列、发布订阅、工件同步
package bus

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// CommunicationBus Agent 间通信总线
type CommunicationBus struct {
	mu          sync.RWMutex
	subscribers map[string][]chan *protocol.Message // key: agentID / teamID
	queue       []*protocol.Message
	maxQueue    int
	artifactDir string // 共享工件存储目录
	ctx         context.Context
	cancel      context.CancelFunc
}

// New 创建通信总线
func New(artifactDir string, maxQueue int) *CommunicationBus {
	ctx, cancel := context.WithCancel(context.Background())
	return &CommunicationBus{
		subscribers: make(map[string][]chan *protocol.Message),
		maxQueue:    maxQueue,
		artifactDir: artifactDir,
		ctx:         ctx,
		cancel:      cancel,
	}
}

// Publish 发布消息到指定目标
func (b *CommunicationBus) Publish(msg *protocol.Message) error {
	b.mu.Lock()

	msg.Timestamp = time.Now()

	// 加入队列（环形覆盖）
	if len(b.queue) >= b.maxQueue {
		b.queue = b.queue[1:]
	}
	b.queue = append(b.queue, msg)

	// 收集目标订阅者
	targets := b.gatherTargets(msg)
	b.mu.Unlock()

	// 非阻塞投递
	for _, ch := range targets {
		select {
		case ch <- msg:
		default:
			// 订阅者来不及接收，丢弃（避免阻塞发布者）
		}
	}

	return nil
}

// gatherTargets 根据消息目标收集订阅者通道（需持有锁）
func (b *CommunicationBus) gatherTargets(msg *protocol.Message) []chan *protocol.Message {
	var targets []chan *protocol.Message

	addChans := func(key string) {
		if chs, ok := b.subscribers[key]; ok {
			targets = append(targets, chs...)
		}
	}

	if msg.ToAgent != "" {
		addChans(msg.ToAgent)
	} else if msg.ToTeam != "" {
		addChans("team:" + msg.ToTeam)
	} else {
		// 广播
		for _, chs := range b.subscribers {
			targets = append(targets, chs...)
		}
	}

	return targets
}

// Subscribe 订阅消息（返回只读通道）
func (b *CommunicationBus) Subscribe(subscriberID string, bufSize int) <-chan *protocol.Message {
	b.mu.Lock()
	defer b.mu.Unlock()

	ch := make(chan *protocol.Message, bufSize)
	b.subscribers[subscriberID] = append(b.subscribers[subscriberID], ch)
	return ch
}

// Unsubscribe 取消订阅
func (b *CommunicationBus) Unsubscribe(subscriberID string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if chs, ok := b.subscribers[subscriberID]; ok {
		for _, ch := range chs {
			close(ch)
		}
		delete(b.subscribers, subscriberID)
	}
}

// SendAndWait 发送消息并等待响应
func (b *CommunicationBus) SendAndWait(msg *protocol.Message, timeout time.Duration) (*protocol.Message, error) {
	replyCh := make(chan *protocol.Message, 1)
	replyID := "reply:" + msg.ID

	b.mu.Lock()
	b.subscribers[replyID] = []chan *protocol.Message{replyCh}
	b.mu.Unlock()

	defer func() {
		b.mu.Lock()
		if chs, ok := b.subscribers[replyID]; ok {
			for _, ch := range chs {
				close(ch)
			}
			delete(b.subscribers, replyID)
		}
		b.mu.Unlock()
	}()

	if err := b.Publish(msg); err != nil {
		return nil, fmt.Errorf("publish: %w", err)
	}

	ctx, cancel := context.WithTimeout(b.ctx, timeout)
	defer cancel()

	select {
	case reply := <-replyCh:
		return reply, nil
	case <-ctx.Done():
		return nil, fmt.Errorf("timeout waiting for reply from %s", msg.ToAgent)
	}
}

// QueueLen 当前队列长度
func (b *CommunicationBus) QueueLen() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.queue)
}

// Shutdown 关闭总线
func (b *CommunicationBus) Shutdown() {
	b.cancel()
	b.mu.Lock()
	defer b.mu.Unlock()

	for id, chs := range b.subscribers {
		for _, ch := range chs {
			close(ch)
		}
		delete(b.subscribers, id)
	}
}

// ArtifactDir 工件存储目录
func (b *CommunicationBus) ArtifactDir() string {
	return b.artifactDir
}
