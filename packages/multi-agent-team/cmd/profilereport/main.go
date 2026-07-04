// Command profilereport generates a visual team assembly report from the profiler.
// Run: go run ./cmd/profilereport > report.md
package main

import (
	"fmt"
	"sort"
	"strings"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/profiler"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

func main() {
	// Register all known agent types with realistic skill assignments
	builder := profiler.NewTeamBuilder()

	// Design-focused agents
	builder.RegisterAgent("agent-claude", "claude", "Claude Code", protocol.AgentCapability{
		Name:        "Claude Code",
		Skills:      []string{"hero-section", "layout-design", "visual-polish"},
		MaxParallel: 1,
	})
	builder.RegisterAgent("agent-gemini", "gemini", "Gemini CLI", protocol.AgentCapability{
		Name:        "Gemini CLI",
		Skills:      []string{"brand-copywriting", "creative-writing", "seo-optimization"},
		MaxParallel: 1,
	})

	// Code-focused agents
	builder.RegisterAgent("agent-codex", "codex", "Codex CLI", protocol.AgentCapability{
		Name:        "Codex CLI",
		Skills:      []string{"tailwind-css", "responsive-layout", "html-css"},
		MaxParallel: 1,
	})
	builder.RegisterAgent("agent-cursor", "cursor-agent", "Cursor Agent", protocol.AgentCapability{
		Name:        "Cursor Agent",
		Skills:      []string{"code-review", "accessibility-check"},
		MaxParallel: 1,
	})

	// Chinese-optimized agents
	builder.RegisterAgent("agent-kimi", "kimi", "Kimi CLI", protocol.AgentCapability{
		Name:        "Kimi CLI",
		Skills:      []string{"brand-copywriting", "copy-review"},
		MaxParallel: 1,
	})
	builder.RegisterAgent("agent-qwen", "qwen", "Qwen Code", protocol.AgentCapability{
		Name:        "Qwen Code",
		Skills:      []string{"html-css", "responsive-layout", "brand-copywriting"},
		MaxParallel: 1,
	})
	builder.RegisterAgent("agent-deepseek", "deepseek", "DeepSeek TUI", protocol.AgentCapability{
		Name:        "DeepSeek TUI",
		Skills:      []string{"code-review", "tailwind-css"},
		MaxParallel: 1,
	})

	fmt.Println("# Multi-Agent Team Assembly — Visual Evidence Report")
	fmt.Println()
	fmt.Println("This report demonstrates how the **intelligent team assembly system** ")
	fmt.Println("maps agent runtime capabilities to team roles for each of the 7 ")
	fmt.Println("collaboration modes. All assignments are deterministic and based on ")
	fmt.Println("8-dimensional capability profiling of each agent's runtime characteristics.")
	fmt.Println()
	fmt.Println("---")
	fmt.Println()

	// Print agent profiles
	fmt.Println("## Agent Capability Profiles")
	fmt.Println()
	fmt.Println("| Agent | Design | Code | Content | Review | Ops | Iterate | Reasoning | Chinese | Best Role |")
	fmt.Println("|---|---|---|---|---|---|---|---|---|---|")
	for _, aid := range []string{"agent-claude", "agent-gemini", "agent-codex", "agent-cursor", "agent-kimi", "agent-qwen", "agent-deepseek"} {
		p := builder.GetProfile(aid)
		if p == nil {
			continue
		}
		best, score := p.FindBestRole()
		fmt.Printf("| %s (%s) | %.0f | %.0f | %.0f | %.0f | %.0f | %.0f | %.0f | %.0f | **%s** (%.0f) |\n",
			p.AgentName, p.AgentType,
			p.Scores[profiler.DimCreativeDesign],
			p.Scores[profiler.DimCodeGen],
			p.Scores[profiler.DimContentWriting],
			p.Scores[profiler.DimCriticalReview],
			p.Scores[profiler.DimSystemOps],
			p.Scores[profiler.DimFastIteration],
			p.Scores[profiler.DimDeepReasoning],
			p.Scores[profiler.DimChineseContent],
			best.Name, score,
		)
	}
	fmt.Println()

	// 7 collaboration modes
	modes := []struct {
		name     string
		strategy string
		roles    []string
		fn       func() []profiler.TeamAssignment
	}{
		{
			name:     "Parallel Mode",
			strategy: "Best-Fit — each role assigned to the highest-scoring agent",
			roles:    []string{"designer", "developer", "copywriter"},
			fn:       func() []profiler.TeamAssignment { return builder.BuildParallelTeam([]string{"designer", "developer", "copywriter"}) },
		},
		{
			name:     "Serial Mode",
			strategy: "Chain-of-Experts — sequential handoff, no agent reused across stages",
			roles:    []string{"designer", "polisher", "developer"},
			fn:       func() []profiler.TeamAssignment { return builder.BuildSerialTeam([]string{"designer", "polisher", "developer"}) },
		},
		{
			name:     "Genetic Mode",
			strategy: "Single Best All-Rounder — weighted composite score (reasoning 40% + design 30% + code 30%)",
			roles:    []string{},
			fn: func() []profiler.TeamAssignment {
				a := builder.BuildGeneticTeam()
				if a.AgentID == "" {
					return nil
				}
				return []profiler.TeamAssignment{a}
			},
		},
		{
			name:     "Inheritance Mode",
			strategy: "Three-stage inheritance chain: Root(designer) → Child(polisher) → Leaf(developer)",
			roles:    []string{"designer", "polisher", "developer"},
			fn:       func() []profiler.TeamAssignment { return builder.BuildInheritanceTeam() },
		},
		{
			name:     "Hybrid Mode",
			strategy: "Layered — parallel within layer, serial across layers",
			roles:    []string{"designer", "developer", "copywriter"},
			fn:       func() []profiler.TeamAssignment { return builder.BuildHybridTeam([]string{"designer", "developer", "copywriter"}) },
		},
		{
			name:     "Complementary Mode",
			strategy: "Diverse Non-Overlapping — designer→copywriter→developer→reviewer, each agent used once",
			roles:    []string{"designer", "copywriter", "developer", "reviewer"},
			fn:       func() []profiler.TeamAssignment { return builder.BuildComplementaryTeam() },
		},
		{
			name:     "Cycle Mode",
			strategy: "Paired Generator↔Reviewer — different agents, creative vs critical roles",
			roles:    []string{},
			fn:       func() []profiler.TeamAssignment { return builder.BuildCycleTeam() },
		},
	}

	for _, m := range modes {
		fmt.Printf("## %s\n", m.name)
		fmt.Println()
		fmt.Printf("**Strategy:** %s  \n", m.strategy)
		fmt.Println()

		assignments := m.fn()
		if len(assignments) == 0 {
			fmt.Println("*No assignments could be made.*")
			fmt.Println()
			continue
		}

		fmt.Println("| Role | Agent | Runtime Type | Score | Reasoning |")
		fmt.Println("|---|---|---|---|---|")
		for _, a := range assignments {
			p := builder.GetProfile(a.AgentID)
			topStrengths := ""
			if p != nil {
				strengths := profiler.CapabilityLabels(p.TopStrengths(2))
				topStrengths = strings.Join(strengths, ", ")
			}
			fmt.Printf("| %s | %s | `%s` | %.0f/100 | %s |\n",
				a.Role, a.AgentID, a.AgentType, a.Score, topStrengths)
		}
		fmt.Println()
	}

	// Add summary table comparing modes
	fmt.Println("## Mode Comparison Summary")
	fmt.Println()
	fmt.Println("| Mode | Agent Count | Parallelism | Role Overlap | Best For |")
	fmt.Println("|---|---|---|---|---|")
	modeMeta := []struct{ name, count, parallel, overlap, bestFor string }{
		{"parallel", "3", "all tasks parallel", "allowed", "multi-dimensional design"},
		{"serial", "3", "none (sequential)", "none", "linear pipelines"},
		{"genetic", "1", "N variants parallel per gen", "N/A", "design variation exploration"},
		{"inheritance", "3", "none (tree)", "none", "iterative refinement"},
		{"hybrid", "3", "within layer", "within layer", "complex projects"},
		{"complementary", "4", "none (chain)", "none (diverse)", "full lifecycle"},
		{"cycle", "2", "alternating", "none (paired)", "quality polishing"},
	}
	for _, m := range modeMeta {
		fmt.Printf("| %s | %s | %s | %s | %s |\n", m.name, m.count, m.parallel, m.overlap, m.bestFor)
	}

	// Full profile detail for each agent
	fmt.Println()
	fmt.Println("## Full Agent Capability Detail")
	fmt.Println()
	for _, aid := range []string{"agent-claude", "agent-gemini", "agent-codex", "agent-cursor", "agent-kimi", "agent-qwen", "agent-deepseek"} {
		p := builder.GetProfile(aid)
		if p == nil {
			continue
		}
		rankings := p.RankRoles()
		fmt.Printf("### %s (`%s`)\n", p.AgentName, p.AgentType)
		fmt.Println()
		fmt.Printf("**Role Rankings:** ")
		rankParts := []string{}
		for _, r := range rankings[:3] {
			rankParts = append(rankParts, fmt.Sprintf("%s (%.0f)", r.Role, r.Score))
		}
		fmt.Println(strings.Join(rankParts, " > "))
		fmt.Println()

		// Capability bar chart in ASCII
		fmt.Println("**Capability Bars:**")
		dims := []struct {
			key   profiler.CapabilityDimension
			label string
		}{
			{profiler.DimCreativeDesign, "Design"},
			{profiler.DimContentWriting, "Content"},
			{profiler.DimCodeGen, "Code"},
			{profiler.DimDeepReasoning, "Reasoning"},
			{profiler.DimCriticalReview, "Review"},
			{profiler.DimFastIteration, "Iteration"},
			{profiler.DimSystemOps, "Ops"},
			{profiler.DimChineseContent, "Chinese"},
		}
		for _, d := range dims {
			score := p.Scores[d.key]
			bar := strings.Repeat("█", int(score/5))
			empty := strings.Repeat("░", 20-int(score/5))
			fmt.Printf("  %-12s |%s%s| %.0f\n", d.label, bar, empty, score)
		}
		fmt.Println()

		// Sort scores to pick top 3
		type kv struct {
			k profiler.CapabilityDimension
			v float64
		}
		var sorted []kv
		for k, v := range p.Scores {
			sorted = append(sorted, kv{k, v})
		}
		sort.Slice(sorted, func(i, j int) bool { return sorted[i].v > sorted[j].v })

		fmt.Printf("**Top 3 Strengths:** %s (%.0f), %s (%.0f), %s (%.0f)\n",
			profiler.CapabilityLabels([]profiler.CapabilityDimension{sorted[0].k})[0], sorted[0].v,
			profiler.CapabilityLabels([]profiler.CapabilityDimension{sorted[1].k})[0], sorted[1].v,
			profiler.CapabilityLabels([]profiler.CapabilityDimension{sorted[2].k})[0], sorted[2].v,
		)
		fmt.Println()
	}
}
