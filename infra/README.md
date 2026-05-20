# Studio365 Infra Quick Start

This folder contains the local runtime infrastructure for Studio365.

## Run the full local stack

From `open-design/infra`:

```bash
docker compose up -d
```

## Services included

- PostgreSQL with pgvector
- Redis
- n8n
- Ollama
- FastAPI backend
- Next.js frontend

## Notes

- The API uses `DATABASE_URL`, `REDIS_URL`, and `OLLAMA_BASE_URL`.
- `infra/postgres/init.sql` initializes the schema for tickets, agents, prompts, and RAG.
- `infra/n8n/workflows` contains starter workflow JSON files.
