package daemon

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
)

// Client OpenDesign daemon HTTP 客户端
// 对接 daemon 的 /api/* REST + SSE 接口
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient 创建客户端
// baseURL 示例: "http://127.0.0.1:17900"
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{},
	}
}

// AgentType daemon 适配的 Agent 类型
type AgentType struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Command    string `json:"command"`
	Installed  bool   `json:"installed"`
	DetectPath string `json:"detectPath"`
}

// ListAgents 调用 /api/agents 获取已安装 Agent 列表
func (c *Client) ListAgents(ctx context.Context) ([]AgentType, error) {
	var agents []AgentType
	if err := c.getJSON(ctx, "/api/agents", &agents); err != nil {
		return nil, fmt.Errorf("list agents: %w", err)
	}
	return agents, nil
}

// SkillItem daemon 中的技能条目
type SkillItem struct {
	ID      string         `json:"id"`
	Name    string         `json:"name"`
	Mode    string         `json:"mode"`
	Scenario string        `json:"scenario"`
	Path    string         `json:"path"`
	Summary string         `json:"summary"`
	Spec    map[string]any `json:"spec"`
}

// ListSkills 调用 /api/skills 获取可用技能
func (c *Client) ListSkills(ctx context.Context) ([]SkillItem, error) {
	var skills []SkillItem
	if err := c.getJSON(ctx, "/api/skills", &skills); err != nil {
		return nil, fmt.Errorf("list skills: %w", err)
	}
	return skills, nil
}

// DesignSystem daemon 中的设计系统条目
type DesignSystem struct {
	ID      string            `json:"id"`
	Brand   string            `json:"brand"`
	Name    string            `json:"name"`
	Path    string            `json:"path"`
	Summary string            `json:"summary"`
	Config  map[string]any    `json:"config"`
	Tokens  map[string]string `json:"tokens"`
}

// ListDesignSystems 调用 /api/design-systems 获取设计系统
func (c *Client) ListDesignSystems(ctx context.Context) ([]DesignSystem, error) {
	var ds []DesignSystem
	if err := c.getJSON(ctx, "/api/design-systems", &ds); err != nil {
		return nil, fmt.Errorf("list design systems: %w", err)
	}
	return ds, nil
}

// ChatRequest daemon /api/chat 请求体
// 对齐 daemon 协议字段：agentId、skillIds、designSystemId、runContext
type ChatRequest struct {
	Message        string          `json:"message"`
	AgentId        string          `json:"agentId"`              // 指定使用的 Agent 运行时 ID
	Skills         []string        `json:"skillIds,omitempty"`   // daemon 接受的技能 ID 列表
	Designs        []string        `json:"designSystemId,omitempty"` // 设计系统 ID
	Model          string          `json:"model,omitempty"`
	RunContext     string          `json:"runContext,omitempty"` // 运行上下文（如 "web"/"cli"）
	Context        json.RawMessage `json:"context,omitempty"`    // 继承上下文
	Stream         bool            `json:"stream"`
}

// ChatEvent daemon SSE chat 流中的事件
type ChatEvent struct {
	Type   string          `json:"type"`   // "message" | "artifact" | "progress" | "done" | "error"
	Data   json.RawMessage `json:"data"`
	TaskID string          `json:"taskId,omitempty"`
}

// ArtifactEvent daemon 生成的工件事件
type ArtifactEvent struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	Content string `json:"content"` // 产物 HTML 内容
	Path    string `json:"path,omitempty"`
}

// ChatSSE 发送聊天并接收 SSE 流
// 返回事件 channel（由调用者关闭）
func (c *Client) ChatSSE(ctx context.Context, req ChatRequest) (<-chan ChatEvent, error) {
	req.Stream = true
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal chat request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	ch := make(chan ChatEvent, 100)
	go c.readSSE(resp.Body, ch)
	return ch, nil
}

// readSSE 解析 SSE 流
func (c *Client) readSSE(body io.ReadCloser, ch chan<- ChatEvent) {
	defer body.Close()
	defer close(ch)

	scanner := bufio.NewScanner(body)
	var eventBuf strings.Builder

	for scanner.Scan() {
		line := scanner.Text()

		if strings.HasPrefix(line, "data: ") {
			eventBuf.WriteString(strings.TrimPrefix(line, "data: "))
			continue
		}

		if line == "" && eventBuf.Len() > 0 {
			// 完整事件
			var evt ChatEvent
			if err := json.Unmarshal([]byte(eventBuf.String()), &evt); err != nil {
				continue
			}
			ch <- evt
			eventBuf.Reset()

			if evt.Type == "done" || evt.Type == "error" {
				return
			}
		}
	}
}

// ChatSimple 简化同步调用（非流式）
func (c *Client) ChatSimple(ctx context.Context, req ChatRequest) ([]ChatEvent, error) {
	req.Stream = false
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var events []ChatEvent
	if err := json.NewDecoder(resp.Body).Decode(&events); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return events, nil
}

// Status 获取 daemon 健康状态
func (c *Client) Status(ctx context.Context) (string, error) {
	var status struct {
		Status string `json:"status"`
	}
	if err := c.getJSON(ctx, "/api/status", &status); err != nil {
		return "", fmt.Errorf("get status: %w", err)
	}
	return status.Status, nil
}

// getJSON 辅助方法
func (c *Client) getJSON(ctx context.Context, apiPath string, dest any) error {
	u, _ := url.Parse(c.baseURL)
	u.Path = path.Join(u.Path, apiPath)

	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	return json.NewDecoder(resp.Body).Decode(dest)
}
