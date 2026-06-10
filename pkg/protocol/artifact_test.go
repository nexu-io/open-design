package protocol

import (
	"bytes"
	"strings"
	"testing"
	"time"
)

func TestFileArtifactStore_PutAndGet(t *testing.T) {
	store, err := NewFileArtifactStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewFileArtifactStore: %v", err)
	}

	a := &Artifact{
		ID:          "art-1",
		Name:        "design.html",
		Type:        ArtifactDesign,
		ContentType: "text/html",
		Producer:    "designer-1",
		Version:     1,
		Metadata:    map[string]string{"task_id": "t1"},
		CreatedAt:   time.Now(),
	}

	content := "<html><body>Hello</body></html>"
	if err := store.Put(a, strings.NewReader(content)); err != nil {
		t.Fatalf("Put: %v", err)
	}

	// 验证元数据已更新
	if a.Path == "" {
		t.Error("Path not set after Put")
	}
	if a.Size == 0 {
		t.Error("Size not set after Put")
	}
	if a.Checksum == "" {
		t.Error("Checksum not set after Put")
	}

	// Get
	got, reader, err := store.Get("art-1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	defer reader.Close()

	if got.Name != "design.html" {
		t.Errorf("Name = %q, want %q", got.Name, "design.html")
	}

	var buf bytes.Buffer
	buf.ReadFrom(reader)
	if buf.String() != content {
		t.Errorf("content = %q, want %q", buf.String(), content)
	}
}

func TestFileArtifactStore_List(t *testing.T) {
	store, err := NewFileArtifactStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewFileArtifactStore: %v", err)
	}

	// 存入两个工件
	store.Put(&Artifact{
		ID:       "art-1",
		Name:     "a.html",
		Type:     ArtifactDesign,
		Producer: "designer-1",
		Metadata: map[string]string{"task_id": "t1"},
		CreatedAt: time.Now(),
	}, strings.NewReader("a"))

	store.Put(&Artifact{
		ID:       "art-2",
		Name:     "b.js",
		Type:     ArtifactCode,
		Producer: "coder-1",
		Metadata: map[string]string{"task_id": "t2"},
		CreatedAt: time.Now(),
	}, strings.NewReader("b"))

	// 列出全部
	all, err := store.List(ArtifactFilter{})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(all) != 2 {
		t.Errorf("List all = %d, want 2", len(all))
	}

	// 按 Producer 过滤
	filtered, err := store.List(ArtifactFilter{Producer: "designer-1"})
	if err != nil {
		t.Fatalf("List filtered: %v", err)
	}
	if len(filtered) != 1 {
		t.Errorf("List filtered = %d, want 1", len(filtered))
	}

	// 按 Type 过滤
	byType, err := store.List(ArtifactFilter{Type: ArtifactCode})
	if err != nil {
		t.Fatalf("List by type: %v", err)
	}
	if len(byType) != 1 {
		t.Errorf("List by type = %d, want 1", len(byType))
	}
}

func TestFileArtifactStore_Delete(t *testing.T) {
	store, err := NewFileArtifactStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewFileArtifactStore: %v", err)
	}

	store.Put(&Artifact{
		ID:        "art-del",
		Name:      "delete-me.txt",
		Type:      ArtifactData,
		Producer:  "test",
		CreatedAt: time.Now(),
	}, strings.NewReader("delete me"))

	if err := store.Delete("art-del"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	_, _, err = store.Get("art-del")
	if err == nil {
		t.Error("expected error after delete")
	}
}

func TestComputeChecksum(t *testing.T) {
	// 使用 Put 创建文件来测试校验和
	store, err := NewFileArtifactStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewFileArtifactStore: %v", err)
	}

	content := "hello world"
	a := &Artifact{
		ID:        "chk-1",
		Name:      "test.txt",
		Type:      ArtifactData,
		Producer:  "test",
		CreatedAt: time.Now(),
	}
	store.Put(a, strings.NewReader(content))

	// 二次计算校验和应一致
	checksum, err := ComputeChecksum(a.Path)
	if err != nil {
		t.Fatalf("ComputeChecksum: %v", err)
	}
	if checksum != a.Checksum {
		t.Errorf("checksum mismatch: %q vs %q", checksum, a.Checksum)
	}
}
