package protocol

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// ArtifactStore 工件存储接口
type ArtifactStore interface {
	Put(a *Artifact, reader io.Reader) error
	Get(id string) (*Artifact, io.ReadCloser, error)
	List(filter ArtifactFilter) ([]*Artifact, error)
	Delete(id string) error
	Versions(artifactID string) ([]*Artifact, error)
}

// ArtifactFilter 工件过滤条件
type ArtifactFilter struct {
	Producer string
	Type     ArtifactType
	TaskID   string
	TeamID   string
	Since    time.Time
}

// FileArtifactStore 基于文件系统的工件存储实现
type FileArtifactStore struct {
	baseDir string
}

// NewFileArtifactStore 创建文件工件存储
func NewFileArtifactStore(baseDir string) (*FileArtifactStore, error) {
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("create artifact dir: %w", err)
	}
	return &FileArtifactStore{baseDir: baseDir}, nil
}

// Put 存储工件
func (s *FileArtifactStore) Put(a *Artifact, reader io.Reader) error {
	// 创建工件目录
	artifactDir := filepath.Join(s.baseDir, a.ID)
	if err := os.MkdirAll(artifactDir, 0755); err != nil {
		return fmt.Errorf("create artifact dir: %w", err)
	}

	// 写入内容文件
	contentPath := filepath.Join(artifactDir, a.Name)
	f, err := os.Create(contentPath)
	if err != nil {
		return fmt.Errorf("create content file: %w", err)
	}
	defer f.Close()

	if _, err := io.Copy(f, reader); err != nil {
		return fmt.Errorf("write content: %w", err)
	}

	// 更新工件元数据
	a.Path = contentPath
	info, _ := f.Stat()
	if info != nil {
		a.Size = info.Size()
	}

	// 计算校验和
	checksum, err := ComputeChecksum(contentPath)
	if err != nil {
		return fmt.Errorf("compute checksum: %w", err)
	}
	a.Checksum = checksum

	// 写入元数据 JSON
	metaPath := filepath.Join(artifactDir, "meta.json")
	data, err := json.MarshalIndent(a, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal metadata: %w", err)
	}
	if err := os.WriteFile(metaPath, data, 0644); err != nil {
		return fmt.Errorf("write metadata: %w", err)
	}

	return nil
}

// Get 获取工件（返回元数据和内容读取器）
func (s *FileArtifactStore) Get(id string) (*Artifact, io.ReadCloser, error) {
	artifactDir := filepath.Join(s.baseDir, id)

	// 读取元数据
	metaPath := filepath.Join(artifactDir, "meta.json")
	data, err := os.ReadFile(metaPath)
	if err != nil {
		return nil, nil, fmt.Errorf("read metadata: %w", err)
	}

	var a Artifact
	if err := json.Unmarshal(data, &a); err != nil {
		return nil, nil, fmt.Errorf("parse metadata: %w", err)
	}

	// 打开内容文件
	f, err := os.Open(a.Path)
	if err != nil {
		return nil, nil, fmt.Errorf("open content: %w", err)
	}

	return &a, f, nil
}

// List 列出工件
func (s *FileArtifactStore) List(filter ArtifactFilter) ([]*Artifact, error) {
	entries, err := os.ReadDir(s.baseDir)
	if err != nil {
		return nil, fmt.Errorf("read artifact dir: %w", err)
	}

	var artifacts []*Artifact
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		metaPath := filepath.Join(s.baseDir, entry.Name(), "meta.json")
		data, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}

		var a Artifact
		if err := json.Unmarshal(data, &a); err != nil {
			continue
		}

		// 应用过滤条件
		if filter.Producer != "" && a.Producer != filter.Producer {
			continue
		}
		if filter.Type != "" && a.Type != filter.Type {
			continue
		}
		if filter.TaskID != "" {
			if tid, ok := a.Metadata["task_id"]; !ok || tid != filter.TaskID {
				continue
			}
		}
		if filter.TeamID != "" {
			if tid, ok := a.Metadata["team_id"]; !ok || tid != filter.TeamID {
				continue
			}
		}
		if !filter.Since.IsZero() && a.CreatedAt.Before(filter.Since) {
			continue
		}

		artifacts = append(artifacts, &a)
	}

	sort.Slice(artifacts, func(i, j int) bool {
		return artifacts[i].CreatedAt.After(artifacts[j].CreatedAt)
	})

	return artifacts, nil
}

// Delete 删除工件
func (s *FileArtifactStore) Delete(id string) error {
	artifactDir := filepath.Join(s.baseDir, id)
	if err := os.RemoveAll(artifactDir); err != nil {
		return fmt.Errorf("delete artifact: %w", err)
	}
	return nil
}

// Versions 获取工件历史版本
func (s *FileArtifactStore) Versions(artifactID string) ([]*Artifact, error) {
	// 遍历所有工件，查找相同基础名称的版本
	entries, err := os.ReadDir(s.baseDir)
	if err != nil {
		return nil, fmt.Errorf("read artifact dir: %w", err)
	}

	var versions []*Artifact
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		metaPath := filepath.Join(s.baseDir, entry.Name(), "meta.json")
		data, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}

		var a Artifact
		if err := json.Unmarshal(data, &a); err != nil {
			continue
		}

		// 查找派生自目标工件的版本
		for _, p := range a.Parents {
			if p == artifactID {
				versions = append(versions, &a)
				break
			}
		}
	}

	sort.Slice(versions, func(i, j int) bool {
		return versions[i].Version > versions[j].Version
	})

	return versions, nil
}

// ComputeChecksum 计算文件 SHA256
func ComputeChecksum(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open file: %w", err)
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", fmt.Errorf("hash file: %w", err)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// Now 当前时间的便捷函数
func Now() time.Time {
	return time.Now()
}
