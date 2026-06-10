// Package adapter Agent 统一适配层：定义 Agent 执行接口和多种实现
package adapter

import (
	"context"
	"fmt"

	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// AgentAdapter Agent 适配器接口——所有 Agent 类型实现此接口
type AgentAdapter interface {
	// Execute 执行任务，返回工件列表
	Execute(ctx context.Context, req *ExecuteRequest) (*ExecuteResponse, error)
	// Type 返回适配器类型标识
	Type() string
	// Detect 检测当前系统是否支持此 Agent 类型
	Detect() bool
}

// ExecuteRequest 统一执行请求
type ExecuteRequest struct {
	TaskID       string
	Prompt       string
	Skills       []string
	Designs      []string
	WorkDir      string
	Timeout      int // 秒
	ContextFrom  string
	CallbackURL  string
}

// ExecuteResponse 统一执行响应
type ExecuteResponse struct {
	Success   bool
	Artifacts []*protocol.Artifact
	Output    string
	Error     string
}

// Registry Agent 适配器注册表
type Registry struct {
	adapters map[string]AgentAdapter
}

// NewRegistry 创建适配器注册表
func NewRegistry() *Registry {
	return &Registry{
		adapters: make(map[string]AgentAdapter),
	}
}

// Register 注册适配器
func (r *Registry) Register(adapter AgentAdapter) {
	r.adapters[adapter.Type()] = adapter
}

// Get 获取指定类型的适配器
func (r *Registry) Get(agentType string) (AgentAdapter, error) {
	a, ok := r.adapters[agentType]
	if !ok {
		return nil, fmt.Errorf("unsupported agent type: %s", agentType)
	}
	return a, nil
}

// List 返回所有已注册的适配器类型
func (r *Registry) List() []string {
	var types []string
	for t := range r.adapters {
		types = append(types, t)
	}
	return types
}

// DetectAll 检测所有可用的 Agent 类型
func (r *Registry) DetectAll() map[string]bool {
	result := make(map[string]bool, len(r.adapters))
	for t, a := range r.adapters {
		result[t] = a.Detect()
	}
	return result
}
