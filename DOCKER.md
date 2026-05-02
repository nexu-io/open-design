# Docker 部署指南

## 快速开始

```bash
# 构建并启动
docker compose up -d --build

# 查看日志
docker compose logs -f

# 打开浏览器
# http://localhost:3000
```

## 运行模式

Open Design 在 Docker 中以 **BYOK（自带 Key）模式** 运行：
- 不依赖宿主机上的任何 agent CLI
- 通过 Web UI 中的设置页面配置 OpenAI 兼容 API
- 支持任何 OpenAI 兼容的 provider（DeepSeek、Groq、OpenRouter、vLLM 等）

## 配置

### 方式一：Web UI 设置（推荐）

启动后访问 `http://localhost:3000`，在设置页面填入你的 API key 和 endpoint。

### 方式二：环境变量

复制 `docker-compose.prod.yml` 并编辑：

```bash
# 编辑环境变量
cp docker-compose.prod.yml .env.override

# 使用自定义配置启动
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 数据持久化

所有项目数据、对话记录、生成的文件存储在 Docker volume `od-data` 中：

```bash
# 查看数据卷
docker volume inspect open-design_od-data

# 备份数据
docker run --rm -v open-design_od-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/od-data-backup.tar.gz -C /data .

# 恢复数据
docker run --rm -v open-design_od-data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/od-data-backup.tar.gz -C /data
```

## 常用命令

```bash
# 停止
docker compose down

# 停止并清除数据
docker compose down -v

# 更新到最新版本
git pull
docker compose up -d --build

# 进入容器调试
docker compose exec open-design sh
```

## 生产部署建议

1. 使用反向代理（Nginx / Caddy）提供 HTTPS
2. 配置 `.env` 文件管理敏感信息
3. 定期备份 `od-data` volume
4. 限制容器资源：`deploy.resources.limits`

## 架构说明

容器内同时运行两个进程：
- **Daemon**（端口 7456）：Express API + SQLite，负责项目管理、技能加载、agent 调度
- **Web**（端口 3000）：Next.js 16 开发服务器，提供 Web UI，将 API 请求代理到 daemon

这种设计保持了与本地开发完全一致的架构。
