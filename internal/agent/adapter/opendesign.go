package adapter

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// OpenDesignAdapter OpenDesign CLI 适配器
type OpenDesignAdapter struct {
	binary string // CLI 二进制路径
}

// NewOpenDesignAdapter 创建 OpenDesign 适配器
func NewOpenDesignAdapter() *OpenDesignAdapter {
	return &OpenDesignAdapter{binary: "opendesign"}
}

func (a *OpenDesignAdapter) Type() string { return "opendesign" }

func (a *OpenDesignAdapter) Detect() bool {
	_, err := exec.LookPath(a.binary)
	return err == nil
}

// Execute 调用 opendesign CLI 执行设计任务
func (a *OpenDesignAdapter) Execute(ctx context.Context, req *ExecuteRequest) (*ExecuteResponse, error) {
	args := a.buildArgs(req)

	cmd := exec.CommandContext(ctx, a.binary, args...)
	cmd.Dir = req.WorkDir

	output, err := cmd.CombinedOutput()
	resp := &ExecuteResponse{Output: string(output)}

	if err != nil {
		resp.Success = false
		resp.Error = fmt.Sprintf("opendesign execution failed: %v\n%s", err, string(output))
		return resp, nil
	}

	resp.Success = true
	resp.Artifacts = a.parseOutput(req, string(output))
	return resp, nil
}

func (a *OpenDesignAdapter) buildArgs(req *ExecuteRequest) []string {
	args := []string{"design", req.Prompt}

	for _, skill := range req.Skills {
		args = append(args, "--skill", skill)
	}
	for _, design := range req.Designs {
		args = append(args, "--design", design)
	}
	if req.ContextFrom != "" {
		args = append(args, "--context-from", req.ContextFrom)
	}
	if req.Timeout > 0 {
		args = append(args, "--timeout", fmt.Sprintf("%ds", req.Timeout))
	}
	return args
}

// parseOutput 解析 opendesign CLI 输出，提取生成的工件信息
func (a *OpenDesignAdapter) parseOutput(req *ExecuteRequest, output string) []*protocol.Artifact {
	var artifacts []*protocol.Artifact

	// 尝试解析 JSON 格式的输出
	var jsonOutput struct {
		Files []struct {
			Path string `json:"path"`
			Name string `json:"name"`
			Size int64  `json:"size"`
			Type string `json:"type"`
		} `json:"files"`
	}

	if err := json.Unmarshal([]byte(output), &jsonOutput); err == nil {
		for _, f := range jsonOutput.Files {
			artifacts = append(artifacts, &protocol.Artifact{
				ID:       fmt.Sprintf("od-%s", filepath.Base(f.Path)),
				Name:     f.Name,
				Type:     mapArtifactType(f.Type),
				Path:     f.Path,
				Size:     f.Size,
				Producer: "opendesign",
			})
		}
		return artifacts
	}

	// 回退：用正则匹配文件路径
	filePattern := regexp.MustCompile(`(?:created|generated|wrote)\s+(.+\.(?:html|css|js|json|svg|png|md))`)
	matches := filePattern.FindAllStringSubmatch(strings.ToLower(output), -1)

	for _, m := range matches {
		if len(m) > 1 {
			artifacts = append(artifacts, &protocol.Artifact{
				ID:       fmt.Sprintf("od-%s", filepath.Base(m[1])),
				Name:     filepath.Base(m[1]),
				Type:     protocol.ArtifactDesign,
				Path:     strings.TrimSpace(m[1]),
				Producer: "opendesign",
			})
		}
	}

	return artifacts
}

func mapArtifactType(t string) protocol.ArtifactType {
	switch strings.ToLower(t) {
	case "design":
		return protocol.ArtifactDesign
	case "code":
		return protocol.ArtifactCode
	case "document", "doc":
		return protocol.ArtifactDocument
	case "asset":
		return protocol.ArtifactAsset
	case "config":
		return protocol.ArtifactConfig
	default:
		return protocol.ArtifactDesign
	}
}
