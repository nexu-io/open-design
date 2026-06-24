// Package bus Agent 间发布订阅通信总线
package bus

import (
	"sync"

	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// CommunicationBus 发布订阅通信总线
// 实现 Agent 间的异步消息传递，支持按 Agent ID 订阅
type CommunicationBus struct {
	mu          sync.RWMutex
	subscribers map[string][]chan *protocol.Message
}

// NewBus 创建通信总线
func NewBus() *CommunicationBus {
	return &CommunicationBus{
		subscribers: make(map[string][]chan *protocol.Message),
	}
}

// Subscribe 订阅指定 Agent 的消息
// 返回带缓冲的消息 channel
func (b *CommunicationBus) Subscribe(agentID string, buffer int) <-chan *protocol.Message {
	b.mu.Lock()
	defer b.mu.Unlock()

	ch := make(chan *protocol.Message, buffer)
	b.subscribers[agentID] = append(b.subscribers[agentID], ch)
	return ch
}

// Unsubscribe 取消订阅
func (b *CommunicationBus) Unsubscribe(agentID string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	chs := b.subscribers[agentID]
	for _, ch := range chs {
		close(ch)
	}
	delete(b.subscribers, agentID)
}

// Publish 发布消息给指定 Agent 的所有订阅者
func (b *CommunicationBus) Publish(msg *protocol.Message) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for _, ch := range b.subscribers[msg.ToAgent] {
		select {
		case ch <- msg:
		default:
			// 订阅者 channel 满时丢弃消息（非阻塞）
		}
	}
}
