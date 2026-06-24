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
// 对齐 daemon 协议字段：agentId、skillIds、designSystemId
type ChatRequest struct {
	Message string   `json:"message"`
	AgentId string   `json:"agentId"`                  // 指定使用的 Agent 运行时 ID
	Skills  []string `json:"skillIds,omitempty"`       // daemon 接受的技能 ID 列表
	Designs string   `json:"designSystemId,omitempty"` // daemon 契约: string | null，发送第一个选中项
	Model   string   `json:"model,omitempty"`
	Stream  bool     `json:"stream"`
}

// ChatEvent daemon SSE chat 流中的事件
type ChatEvent struct {
	Type   string          `json:"type"` // "start" | "agent" | "stdout" | "stderr" | "end" | "error"
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
// daemon 发送的标准 SSE 格式为两行结构：
//
//	event: <kind>
//	data: <json_payload>
//
// 当前解析器先捕获 event: 行确定事件类型，再累积 data: 行，
// 空行时把 SSE event kind 作为 ChatEvent.Type、data payload 作为 ChatEvent.Data。
func (c *Client) readSSE(body io.ReadCloser, ch chan<- ChatEvent) {
	defer body.Close()
	defer close(ch)

	scanner := bufio.NewScanner(body)
	// 增大 scanner buffer 以容纳较大的 data payload
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var (
		eventKind string
		dataBuf   strings.Builder
	)

	for scanner.Scan() {
		line := scanner.Text()

		switch {
		case strings.HasPrefix(line, "event: "):
			eventKind = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: "):
			dataBuf.WriteString(strings.TrimPrefix(line, "data: "))
		case line == "" && dataBuf.Len() > 0:
			// 完整事件：event + data 发送完成
			evt := ChatEvent{
				Type: eventKind,
				Data: json.RawMessage(dataBuf.String()),
			}
			ch <- evt

			eventKind = ""
			dataBuf.Reset()

			if evt.Type == "end" || evt.Type == "error" {
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

// FetchArtifactPreview 通过 daemon REST API 获取 live-artifact 的实际渲染内容。
// live_artifact SSE 事件只携带元数据 (projectId / artifactId / title)，
// 不包含产物内容。调用此方法获取子 agent 继承所需的实际 HTML 内容。
//
// 端点: GET /api/live-artifacts/:artifactId/preview?projectId=<projectId>&variant=rendered
// 返回: 渲染后的 HTML 文本
func (c *Client) FetchArtifactPreview(ctx context.Context, projectID, artifactID string) (string, error) {
	u, _ := url.Parse(c.baseURL)
	u.Path = path.Join(u.Path, "/api/live-artifacts", artifactID, "preview")
	q := u.Query()
	q.Set("projectId", projectID)
	q.Set("variant", "rendered")
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return "", fmt.Errorf("create artifact preview request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch artifact preview: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("fetch artifact preview: unexpected status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read artifact preview: %w", err)
	}

	return string(data), nil
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
