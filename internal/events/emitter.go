// Package events 事件驱动架构：事件发射器、过滤、重放
package events

import (
	"fmt"
	"sync"
	"time"
)

// EventType 事件类型
type EventType string

const (
	EventTaskAssigned    EventType = "task.assigned"
	EventTaskStarted     EventType = "task.started"
	EventTaskCompleted   EventType = "task.completed"
	EventTaskFailed      EventType = "task.failed"
	EventArtifactCreated EventType = "artifact.created"
	EventContextSynced   EventType = "context.synced"
	EventTeamStarted     EventType = "team.started"
	EventTeamCompleted   EventType = "team.completed"
	EventAgentRegistered EventType = "agent.registered"
	EventGeneticEvolved  EventType = "genetic.evolved"
)

// Event 事件体
type Event struct {
	Type      EventType         `json:"type"`
	Source    string            `json:"source"`
	Payload   any               `json:"payload"`
	Metadata  map[string]string `json:"metadata"`
	Timestamp time.Time         `json:"timestamp"`
}

// EventHandler 事件处理器函数
type EventHandler func(event Event)

// EventFilter 事件过滤条件
type EventFilter struct {
	Types   []EventType  // 只接收这些类型
	Sources []string     // 只接收这些来源
	Since   *time.Time   // 只接收此时间之后的事件
}

// EventEmitter 事件发射器
type EventEmitter struct {
	mu       sync.RWMutex
	listeners map[EventType][]*listenerEntry
	history  []Event
	maxHist  int
}

type listenerEntry struct {
	id      string
	handler EventHandler
	filter  *EventFilter
}

// New 创建事件发射器
func New(maxHistory int) *EventEmitter {
	if maxHistory <= 0 {
		maxHistory = 1000
	}
	return &EventEmitter{
		listeners: make(map[EventType][]*listenerEntry),
		maxHist:  maxHistory,
	}
}

// On 注册事件监听器
func (e *EventEmitter) On(eventType EventType, handler EventHandler, filter *EventFilter) string {
	id := fmt.Sprintf("listener-%d", time.Now().UnixNano())

	e.mu.Lock()
	defer e.mu.Unlock()

	e.listeners[eventType] = append(e.listeners[eventType], &listenerEntry{
		id:      id,
		handler: handler,
		filter:  filter,
	})

	return id
}

// Off 移除事件监听器
func (e *EventEmitter) Off(id string) {
	e.mu.Lock()
	defer e.mu.Unlock()

	for eventType, entries := range e.listeners {
		for i, entry := range entries {
			if entry.id == id {
				e.listeners[eventType] = append(entries[:i], entries[i+1:]...)
				return
			}
		}
	}
}

// Emit 发射事件
func (e *EventEmitter) Emit(event Event) {
	event.Timestamp = time.Now()

	// 记录历史
	e.mu.Lock()
	if len(e.history) >= e.maxHist {
		e.history = e.history[1:]
	}
	e.history = append(e.history, event)
	e.mu.Unlock()

	// 通知匹配的监听器（同步调用，调用者自行决定是否并发）
	e.mu.RLock()
	defer e.mu.RUnlock()

	for _, entry := range e.listeners[event.Type] {
		if e.matchesFilter(event, entry.filter) {
			entry.handler(event)
		}
	}
}

// matchesFilter 检查事件是否匹配过滤条件
func (e *EventEmitter) matchesFilter(event Event, filter *EventFilter) bool {
	if filter == nil {
		return true
	}

	if len(filter.Types) > 0 {
		found := false
		for _, t := range filter.Types {
			if t == event.Type {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	if len(filter.Sources) > 0 {
		found := false
		for _, s := range filter.Sources {
			if s == event.Source {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	if filter.Since != nil && event.Timestamp.Before(*filter.Since) {
		return false
	}

	return true
}

// History 获取事件历史
func (e *EventEmitter) History(filter *EventFilter) []Event {
	e.mu.RLock()
	defer e.mu.RUnlock()

	if filter == nil {
		result := make([]Event, len(e.history))
		copy(result, e.history)
		return result
	}

	var result []Event
	for _, event := range e.history {
		if e.matchesFilter(event, filter) {
			result = append(result, event)
		}
	}
	return result
}

// Replay 重放指定时间范围内的事件
func (e *EventEmitter) Replay(since time.Time, handler EventHandler) int {
	events := e.History(&EventFilter{Since: &since})
	for _, event := range events {
		handler(event)
	}
	return len(events)
}

// ListenerCount 返回事件类型的监听器数量
func (e *EventEmitter) ListenerCount(eventType EventType) int {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return len(e.listeners[eventType])
}
