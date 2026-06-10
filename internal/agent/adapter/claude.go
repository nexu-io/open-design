package adapter

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

// ClaudeCodeAdapter Claude Code CLI 适配器
type ClaudeCodeAdapter struct {
	binary string
}

// NewClaudeCodeAdapter 创建 Claude Code 适配器
func NewClaudeCodeAdapter() *ClaudeCodeAdapter {
	return &ClaudeCodeAdapter{binary: "claude"}
}

func (a *ClaudeCodeAdapter) Type() string { return "claude-code" }

func (a *ClaudeCodeAdapter) Detect() bool {
	_, err := exec.LookPath(a.binary)
	return err == nil
}

// Execute 调用 claude code CLI
func (a *ClaudeCodeAdapter) Execute(ctx context.Context, req *ExecuteRequest) (*ExecuteResponse, error) {
	args := []string{
		"--print",
		"--output-format", "json",
		req.Prompt,
	}

	cmd := exec.CommandContext(ctx, a.binary, args...)
	cmd.Dir = req.WorkDir

	output, err := cmd.CombinedOutput()
	resp := &ExecuteResponse{Output: string(output)}

	if err != nil {
		resp.Success = false
		resp.Error = fmt.Sprintf("claude code failed: %v\n%s", err, string(output))
		return resp, nil
	}

	resp.Success = true
	resp.Artifacts = a.parseOutput(req, string(output))
	return resp, nil
}

func (a *ClaudeCodeAdapter) parseOutput(req *ExecuteRequest, output string) []*protocol.Artifact {
	var artifacts []*protocol.Artifact

	// 扫描工作目录中新增的文件（简化实现）
	entries, err := filepath.Glob(filepath.Join(req.WorkDir, "**/*"))
	if err != nil {
		return artifacts
	}

	for _, path := range entries {
		name := filepath.Base(path)
		ext := filepath.Ext(name)
		if ext == "" || strings.HasPrefix(name, ".") {
			continue
		}
		artifactType := mapExtToArtifactType(ext)
		artifacts = append(artifacts, &protocol.Artifact{
			ID:       fmt.Sprintf("cc-%s", name),
			Name:     name,
			Type:     artifactType,
			Path:     path,
			Producer: "claude-code",
		})
	}

	return artifacts
}

func mapExtToArtifactType(ext string) protocol.ArtifactType {
	switch ext {
	case ".html", ".css", ".jsx", ".tsx", ".vue":
		return protocol.ArtifactCode
	case ".svg", ".png", ".jpg", ".gif", ".webp":
		return protocol.ArtifactAsset
	case ".json", ".yaml", ".yml", ".toml":
		return protocol.ArtifactConfig
	case ".md", ".txt", ".pdf":
		return protocol.ArtifactDocument
	default:
		return protocol.ArtifactData
	}
}
