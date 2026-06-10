package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/agent"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/bus"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/config"
	"github.com/nexu-io/open-design/packages/multi-agent-team/internal/coordinator"
	"github.com/nexu-io/open-design/packages/multi-agent-team/pkg/protocol"
)

func main() {
	var (
		configPath  string
		taskDesc    string
		artifactDir string
		daemonAddr  string
		status      bool
	)

	flag.StringVar(&configPath, "config", "team.yaml", "团队配置文件路径")
	flag.StringVar(&taskDesc, "task", "", "任务描述")
	flag.StringVar(&artifactDir, "artifacts", "./artifacts", "工件存储目录")
	flag.StringVar(&daemonAddr, "daemon", "http://127.0.0.1:17900", "OpenDesign daemon 地址")
	flag.BoolVar(&status, "status", false, "仅查看团队状态")
	flag.Parse()

	// 设置 daemon 地址（全局，供 Agent 池使用）
	agent.SetDaemonAddr(daemonAddr)

	// 加载配置
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("[odteam] 加载配置失败: %v", err)
	}

	log.Printf("[odteam] 团队 '%s' 模式: %s | daemon: %s", cfg.Team.Name, cfg.Team.Mode, daemonAddr)

	// 创建通信总线
	b := bus.New(artifactDir, 1000)
	defer b.Shutdown()

	// 创建工件存储
	store, err := protocol.NewFileArtifactStore(artifactDir)
	if err != nil {
		log.Fatalf("[odteam] 创建工件存储失败: %v", err)
	}

	// 创建 Agent 池（连接 daemon）
	pool := agent.NewPool(cfg, b, artifactDir)
	defer pool.Shutdown()

	if status {
		runtimes := pool.ListRuntimes()
		fmt.Println("=== Agent 状态 ===")
		for _, rt := range runtimes {
			fmt.Printf("  [%s] %s - %s | 技能: %v\n", rt.ID, rt.Status, rt.Capability.Name, rt.Capability.Skills)
		}
		return
	}

	if taskDesc == "" {
		fmt.Fprintln(os.Stderr, "请通过 -task 指定任务描述")
		flag.Usage()
		os.Exit(1)
	}

	// 创建协调器
	coord := coordinator.New(cfg, pool, b, store)

	// 优雅关闭
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Println("[odteam] 收到终止信号，正在关闭...")
		cancel()
	}()

	// 执行任务
	result, err := coord.Run(ctx, taskDesc)
	if err != nil {
		log.Fatalf("[odteam] 执行失败: %v", err)
	}

	// 输出结果
	fmt.Println("\n=== 团队执行结果 ===")
	fmt.Printf("团队: %s\n", result.TeamID)
	fmt.Printf("模式: %s\n", result.Mode)
	fmt.Printf("成功: %v\n", result.Success)
	fmt.Printf("耗时: %v\n", result.Duration)
	fmt.Printf("工件数: %d\n", len(result.Artifacts))

	for i, r := range result.Results {
		status := "成功"
		if !r.Success {
			status = "失败: " + r.Error
		}
		fmt.Printf("\n任务 %d [%s] → Agent: %s | %s\n", i+1, r.TaskID, r.AgentID, status)
		for _, a := range r.Artifacts {
			fmt.Printf("  工件: %s (%s, %d bytes)\n", a.Name, a.Type, a.Size)
		}
	}
}
