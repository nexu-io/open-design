package adapter

import (
	"context"
	"testing"
)

func TestRegistry_RegisterAndGet(t *testing.T) {
	r := NewRegistry()
	r.Register(NewOpenDesignAdapter())
	r.Register(NewClaudeCodeAdapter())

	od, err := r.Get("opendesign")
	if err != nil {
		t.Fatalf("Get opendesign: %v", err)
	}
	if od.Type() != "opendesign" {
		t.Errorf("Type = %q, want %q", od.Type(), "opendesign")
	}

	cc, err := r.Get("claude-code")
	if err != nil {
		t.Fatalf("Get claude-code: %v", err)
	}
	if cc.Type() != "claude-code" {
		t.Errorf("Type = %q, want %q", cc.Type(), "claude-code")
	}
}

func TestRegistry_GetUnsupported(t *testing.T) {
	r := NewRegistry()
	_, err := r.Get("unsupported")
	if err == nil {
		t.Error("expected error for unsupported type")
	}
}

func TestRegistry_List(t *testing.T) {
	r := NewRegistry()
	r.Register(NewOpenDesignAdapter())
	r.Register(NewClaudeCodeAdapter())

	types := r.List()
	if len(types) != 2 {
		t.Errorf("List = %v, want 2 items", types)
	}
}

func TestRegistry_DetectAll(t *testing.T) {
	r := NewRegistry()
	r.Register(NewOpenDesignAdapter())
	r.Register(NewClaudeCodeAdapter())

	result := r.DetectAll()
	if len(result) != 2 {
		t.Errorf("DetectAll = %d items, want 2", len(result))
	}
	// 结果应为 map[类型]bool，无论是否检测到
	for _, typ := range []string{"opendesign", "claude-code"} {
		if _, ok := result[typ]; !ok {
			t.Errorf("missing type %s in DetectAll result", typ)
		}
	}
}

func TestOpenDesignAdapter_BuildArgs(t *testing.T) {
	a := NewOpenDesignAdapter()
	req := &ExecuteRequest{
		TaskID:  "t1",
		Prompt:  "design a dashboard",
		Skills:  []string{"hero-section", "pricing-table"},
		Designs: []string{"minimal-light"},
		Timeout: 300,
	}

	args := a.buildArgs(req)
	if args[0] != "design" {
		t.Errorf("first arg = %q, want %q", args[0], "design")
	}
	if args[1] != "design a dashboard" {
		t.Errorf("prompt = %q, want %q", args[1], "design a dashboard")
	}

	// 检查技能参数
	foundSkill := false
	for i, arg := range args {
		if arg == "--skill" && i+1 < len(args) && args[i+1] == "hero-section" {
			foundSkill = true
		}
	}
	if !foundSkill {
		t.Error("skill not found in args")
	}
}

func TestOpenDesignAdapter_TypeAndDetect(t *testing.T) {
	a := NewOpenDesignAdapter()
	if a.Type() != "opendesign" {
		t.Errorf("Type = %q", a.Type())
	}
	// Detect 依赖实际二进制，不测试具体值
	_ = a.Detect()
}

func TestClaudeCodeAdapter_TypeAndDetect(t *testing.T) {
	a := NewClaudeCodeAdapter()
	if a.Type() != "claude-code" {
		t.Errorf("Type = %q", a.Type())
	}
	_ = a.Detect()
}

func TestMapExtToArtifactType(t *testing.T) {
	tests := []struct {
		ext  string
		want string
	}{
		{".html", "code"},
		{".css", "code"},
		{".svg", "asset"},
		{".png", "asset"},
		{".json", "config"},
		{".md", "document"},
		{".xyz", "data"},
	}

	for _, tt := range tests {
		got := string(mapExtToArtifactType(tt.ext))
		if got != tt.want {
			t.Errorf("mapExtToArtifactType(%q) = %q, want %q", tt.ext, got, tt.want)
		}
	}
}

func TestMapArtifactType(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"design", "design"},
		{"code", "code"},
		{"document", "document"},
		{"doc", "document"},
		{"asset", "asset"},
		{"config", "config"},
		{"unknown", "design"},
	}

	for _, tt := range tests {
		got := string(mapArtifactType(tt.input))
		if got != tt.want {
			t.Errorf("mapArtifactType(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestOpenDesignAdapter_ParseOutput_NoMatch(t *testing.T) {
	a := NewOpenDesignAdapter()
	req := &ExecuteRequest{WorkDir: "/tmp/test"}
	artifacts := a.parseOutput(req, "some random output without file info")
	if len(artifacts) != 0 {
		t.Errorf("expected 0 artifacts, got %d", len(artifacts))
	}
}

func TestNewAdapterContext(t *testing.T) {
	ctx := context.Background()
	if ctx == nil {
		t.Error("context should not be nil")
	}
}
