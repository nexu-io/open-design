// Package context 上下文管理器：负责 Agent 间上下文的继承、合并、快照和同步
package context

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

// Manager 上下文管理器
type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*Session // sessionID → Session
}

// Session 一个任务会话的上下文
type Session struct {
	ID           string
	AgentID      string
	ParentID     string         // 父会话 ID（继承链）
	Skills       []string       // 继承的技能
	Designs      []string       // 继承的设计系统
	ArtifactIDs  []string       // 可用的工件 ID 列表
	Memory       map[string]any // 共享记忆（跨任务传递）
	CreatedAt    time.Time
	UpdatedAt    time.Time
	Version      int // 每次合并递增
	Checksum     string
}

// NewManager 创建上下文管理器
func NewManager() *Manager {
	return &Manager{
		sessions: make(map[string]*Session),
	}
}

// Create 创建新会话
func (m *Manager) Create(sessionID, agentID string) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()

	s := &Session{
		ID:         sessionID,
		AgentID:    agentID,
		Skills:     []string{},
		Designs:    []string{},
		ArtifactIDs: []string{},
		Memory:     make(map[string]any),
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
		Version:    1,
	}
	s.Checksum = m.computeChecksum(s)
	m.sessions[sessionID] = s
	return s
}

// Inherit 从父会话继承上下文到新会话
func (m *Manager) Inherit(parentID, childID, childAgentID string) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	parent, ok := m.sessions[parentID]
	if !ok {
		return nil, fmt.Errorf("parent session not found: %s", parentID)
	}

	// 深拷贝父会话的技能和设计
	childSkills := make([]string, len(parent.Skills))
	copy(childSkills, parent.Skills)
	childDesigns := make([]string, len(parent.Designs))
	copy(childDesigns, parent.Designs)

	// 复制父会话的工件引用（子 Agent 可读取父 Agent 的产物）
	childArtifacts := make([]string, len(parent.ArtifactIDs))
	copy(childArtifacts, parent.ArtifactIDs)

	// 深拷贝共享记忆
	childMemory := make(map[string]any)
	for k, v := range parent.Memory {
		childMemory[k] = v
	}

	// 标记继承深度：根=0，第一层子=1，以此类推
	parentDepth := 0
	if d, ok := parent.Memory["inheritance_depth"]; ok {
		if depth, isInt := d.(int); isInt {
			parentDepth = depth
		}
	}
	childMemory["inheritance_depth"] = parentDepth + 1
	childMemory["parent_session"] = parentID

	child := &Session{
		ID:          childID,
		AgentID:     childAgentID,
		ParentID:    parentID,
		Skills:      childSkills,
		Designs:     childDesigns,
		ArtifactIDs: childArtifacts,
		Memory:      childMemory,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		Version:     1,
	}
	child.Checksum = m.computeChecksum(child)
	m.sessions[childID] = child

	return child, nil
}

// Merge 将一个会话的结果合并到另一个会话（串行管线用）
func (m *Manager) Merge(sourceID, targetID string, newArtifacts []string, extraMemory map[string]any) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	target, ok := m.sessions[targetID]
	if !ok {
		return fmt.Errorf("target session not found: %s", targetID)
	}

	// 合并工件引用
	artifactSet := make(map[string]bool)
	for _, id := range target.ArtifactIDs {
		artifactSet[id] = true
	}
	for _, id := range newArtifacts {
		if !artifactSet[id] {
			target.ArtifactIDs = append(target.ArtifactIDs, id)
		}
	}

	// 合并记忆
	if extraMemory != nil {
		for k, v := range extraMemory {
			target.Memory[k] = v
		}
	}

	target.Version++
	target.UpdatedAt = time.Now()
	target.Checksum = m.computeChecksum(target)

	return nil
}

// AddArtifacts 向会话添加工件引用
func (m *Manager) AddArtifacts(sessionID string, artifactIDs []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	s, ok := m.sessions[sessionID]
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	existing := make(map[string]bool)
	for _, id := range s.ArtifactIDs {
		existing[id] = true
	}
	for _, id := range artifactIDs {
		if !existing[id] {
			s.ArtifactIDs = append(s.ArtifactIDs, id)
		}
	}

	s.Version++
	s.UpdatedAt = time.Now()
	s.Checksum = m.computeChecksum(s)
	return nil
}

// WriteMemory 写入共享记忆
func (m *Manager) WriteMemory(sessionID string, key string, value any) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	s, ok := m.sessions[sessionID]
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	if s.Memory == nil {
		s.Memory = make(map[string]any)
	}
	s.Memory[key] = value
	s.Version++
	s.UpdatedAt = time.Now()
	s.Checksum = m.computeChecksum(s)
	return nil
}

// ReadMemory 读取共享记忆
func (m *Manager) ReadMemory(sessionID string, key string) (any, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	s, ok := m.sessions[sessionID]
	if !ok {
		return nil, false
	}
	val, exists := s.Memory[key]
	return val, exists
}

// Get 获取会话
func (m *Manager) Get(sessionID string) (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	s, ok := m.sessions[sessionID]
	return s, ok
}

// Snapshot 创建会话快照（用于序列化传递给 daemon context 字段）
func (m *Manager) Snapshot(sessionID string) (json.RawMessage, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	s, ok := m.sessions[sessionID]
	if !ok {
		return nil, fmt.Errorf("session not found: %s", sessionID)
	}

	snap := map[string]any{
		"session_id":    s.ID,
		"agent_id":      s.AgentID,
		"parent_id":     s.ParentID,
		"skills":        s.Skills,
		"designs":       s.Designs,
		"artifact_ids":  s.ArtifactIDs,
		"memory":        s.Memory,
		"version":       s.Version,
		"checksum":      s.Checksum,
	}

	data, err := json.Marshal(snap)
	if err != nil {
		return nil, fmt.Errorf("marshal snapshot: %w", err)
	}
	return json.RawMessage(data), nil
}

// Delete 删除会话
func (m *Manager) Delete(sessionID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, sessionID)
}

// computeChecksum 计算会话校验和（检测篡改）
func (m *Manager) computeChecksum(s *Session) string {
	data := fmt.Sprintf("%s:%s:%d:%v", s.ID, s.AgentID, s.Version, s.Memory)
	hash := sha256.Sum256([]byte(data))
	return fmt.Sprintf("%x", hash[:8])
}
