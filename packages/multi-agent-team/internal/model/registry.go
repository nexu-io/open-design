// Package model 多模态模型注册表与自动选择
// 支持 text / vision / image_gen / multimodal / 3d 多种模型类型，
// 根据任务需求自动匹配最适合的模型。
package model

import (
	"fmt"
	"sort"
	"strings"
	"sync"

	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// Registry 模型注册表
type Registry struct {
	mu       sync.RWMutex
	models   map[string]*protocol.ModelEntry
	defaults map[protocol.ModelType]string
}

// NewRegistry 创建模型注册表并填充默认模型
func NewRegistry() *Registry {
	r := &Registry{
		models:   make(map[string]*protocol.ModelEntry),
		defaults: make(map[protocol.ModelType]string),
	}
	r.registerDefaults()
	return r
}

// Register 注册一个模型
func (r *Registry) Register(entry protocol.ModelEntry) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.models[entry.Name] = &entry
}

// Get 获取模型信息
func (r *Registry) Get(name string) (*protocol.ModelEntry, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	m, ok := r.models[name]
	return m, ok
}

// SetDefault 设置某类型的默认模型
func (r *Registry) SetDefault(mt protocol.ModelType, name string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.defaults[mt] = name
}

// SelectBest 根据任务需求自动选择最佳模型
// criteria: 期望的模型类型、任务描述关键词
func (r *Registry) SelectBest(criteria ModelCriteria) (*protocol.ModelEntry, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var candidates []*protocol.ModelEntry
	for _, m := range r.models {
		if matchesCriteria(m, criteria) {
			candidates = append(candidates, m)
		}
	}

	if len(candidates) == 0 {
		// fallback 到该类型的默认模型
		if defaultName, ok := r.defaults[criteria.Type]; ok {
			if m, ok := r.models[defaultName]; ok {
				return m, nil
			}
		}
		return nil, fmt.Errorf("no matching model found for criteria: type=%s", criteria.Type)
	}

	// 按匹配度 + 性价比排序
	sort.Slice(candidates, func(i, j int) bool {
		scoreI := matchScore(candidates[i], criteria)
		scoreJ := matchScore(candidates[j], criteria)
		return scoreI > scoreJ
	})

	return candidates[0], nil
}

// GetDefaults 获取所有类型的默认模型
func (r *Registry) GetDefaults() map[protocol.ModelType]string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make(map[protocol.ModelType]string)
	for k, v := range r.defaults {
		result[k] = v
	}
	return result
}

// ListByType 列出指定类型的所有模型
func (r *Registry) ListByType(mt protocol.ModelType) []*protocol.ModelEntry {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var result []*protocol.ModelEntry
	for _, m := range r.models {
		if m.Type == mt {
			result = append(result, m)
		}
	}
	return result
}

// ===== 内部方法 =====

// ModelCriteria 模型选择条件
type ModelCriteria struct {
	Type       protocol.ModelType // 期望能力类型
	TaskHint   string             // 任务描述（用于关键词匹配）
	PreferFast bool               // 是否优先速度
	MaxCost    float64            // 最大千token成本（0=不限）
}

// matchesCriteria 判断模型是否匹配条件
func matchesCriteria(m *protocol.ModelEntry, criteria ModelCriteria) bool {
	if m.Type != criteria.Type {
		// 多模态模型可以处理纯文本/纯视觉任务
		if m.Type != protocol.ModelMultimodal {
			return false
		}
	}

	if criteria.MaxCost > 0 && m.CostPer1K > criteria.MaxCost {
		return false
	}

	return true
}

// matchScore 计算模型匹配度分数
func matchScore(m *protocol.ModelEntry, criteria ModelCriteria) float64 {
	score := 0.0

	// 精确类型匹配加分
	if m.Type == criteria.Type {
		score += 3.0
	} else if m.Type == protocol.ModelMultimodal {
		score += 1.0
	}

	// 关键词匹配加分
	taskLower := strings.ToLower(criteria.TaskHint)
	for _, cap := range m.Capabilities {
		if strings.Contains(taskLower, strings.ToLower(cap)) {
			score += 2.0
		}
	}

	// 高 max tokens 对于复杂任务加分
	if criteria.TaskHint != "" {
		if m.MaxTokens >= 200000 {
			score += 1.0
		} else if m.MaxTokens >= 128000 {
			score += 0.5
		}
	}

	// 速度优先
	if criteria.PreferFast {
		if m.CostPer1K < 1.0 {
			score += 2.0
		}
	}

	// 性价比（成本越低分越高，但权重较小）
	if m.CostPer1K > 0 {
		score += mathMax(0, 2.0-m.CostPer1K)
	}

	return score
}

// registerDefaults 注册主流模型
func (r *Registry) registerDefaults() {
	// === 文本模型 ===
	textModels := []protocol.ModelEntry{
		{Name: "claude-4.5-opus", Type: protocol.ModelText, Provider: "anthropic", Capabilities: []string{"code", "reasoning", "long-form", "analysis"}, MaxTokens: 200000, CostPer1K: 15.0},
		{Name: "claude-4.5-sonnet", Type: protocol.ModelText, Provider: "anthropic", Capabilities: []string{"code", "reasoning", "balanced"}, MaxTokens: 200000, CostPer1K: 3.0},
		{Name: "gpt-5", Type: protocol.ModelText, Provider: "openai", Capabilities: []string{"code", "reasoning", "agentic"}, MaxTokens: 128000, CostPer1K: 5.0},
		{Name: "gpt-5-mini", Type: protocol.ModelText, Provider: "openai", Capabilities: []string{"fast", "cost-effective", "simple"}, MaxTokens: 128000, CostPer1K: 0.6},
		{Name: "deepseek-v4-pro", Type: protocol.ModelText, Provider: "deepseek", Capabilities: []string{"code", "reasoning", "cost-effective"}, MaxTokens: 131072, CostPer1K: 2.0},
		{Name: "gemini-3-pro", Type: protocol.ModelText, Provider: "google", Capabilities: []string{"reasoning", "analysis", "tools"}, MaxTokens: 1048576, CostPer1K: 3.5},
	}

	// === 视觉理解模型 ===
	visionModels := []protocol.ModelEntry{
		{Name: "gpt-5-vision", Type: protocol.ModelVision, Provider: "openai", Capabilities: []string{"image-analysis", "ocr", "layout", "screenshot"}, MaxTokens: 128000, CostPer1K: 8.0},
		{Name: "claude-4.5-vision", Type: protocol.ModelVision, Provider: "anthropic", Capabilities: []string{"image-analysis", "design-review", "accessibility"}, MaxTokens: 200000, CostPer1K: 15.0},
		{Name: "gemini-3-vision", Type: protocol.ModelVision, Provider: "google", Capabilities: []string{"image-analysis", "video-analysis", "screenshot"}, MaxTokens: 1048576, CostPer1K: 2.5},
	}

	// === 图像生成模型 ===
	imageGenModels := []protocol.ModelEntry{
		{Name: "dalle-4", Type: protocol.ModelImageGen, Provider: "openai", Capabilities: []string{"image-generation", "editing", "variations"}, MaxTokens: 4096, CostPer1K: 0.0},
		{Name: "midjourney-v7", Type: protocol.ModelImageGen, Provider: "midjourney", Capabilities: []string{"image-generation", "aesthetic", "style-transfer"}, MaxTokens: 0, CostPer1K: 0.0},
		{Name: "stable-diffusion-4", Type: protocol.ModelImageGen, Provider: "stability", Capabilities: []string{"image-generation", "open-source", "customizable"}, MaxTokens: 0, CostPer1K: 0.0},
	}

	// === 多模态模型（全能型） ===
	multimodalModels := []protocol.ModelEntry{
		{Name: "gemini-3-ultra", Type: protocol.ModelMultimodal, Provider: "google", Capabilities: []string{"text", "vision", "image-gen", "video", "audio", "code"}, MaxTokens: 1048576, CostPer1K: 10.0},
		{Name: "gpt-5-omni", Type: protocol.ModelMultimodal, Provider: "openai", Capabilities: []string{"text", "vision", "image-gen", "audio", "code"}, MaxTokens: 128000, CostPer1K: 12.0},
	}

	// === 3D 生成模型 ===
	models3D := []protocol.ModelEntry{
		{Name: "rodin-2", Type: protocol.Model3D, Provider: "deemos", Capabilities: []string{"3d-generation", "text-to-3d", "image-to-3d"}, MaxTokens: 0, CostPer1K: 0.0},
		{Name: "meshy-5", Type: protocol.Model3D, Provider: "meshy", Capabilities: []string{"3d-generation", "text-to-3d", "texturing"}, MaxTokens: 0, CostPer1K: 0.0},
	}

	allModels := append(textModels, visionModels...)
	allModels = append(allModels, imageGenModels...)
	allModels = append(allModels, multimodalModels...)
	allModels = append(allModels, models3D...)

	for _, m := range allModels {
		r.models[m.Name] = &m
	}

	// 设置默认
	r.defaults[protocol.ModelText] = "claude-4.5-sonnet"
	r.defaults[protocol.ModelVision] = "claude-4.5-vision"
	r.defaults[protocol.ModelImageGen] = "dalle-4"
	r.defaults[protocol.ModelMultimodal] = "gemini-3-ultra"
	r.defaults[protocol.Model3D] = "rodin-2"
}

func mathMax(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
