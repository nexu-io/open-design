CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Workspaces / Users
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog', -- backlog/planning/working/review/done
  priority TEXT NOT NULL DEFAULT 'med',   -- low/med/high
  assignee_type TEXT DEFAULT 'agent',     -- human/agent
  assignee_id UUID,
  dod_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  plan JSONB,
  output JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_workspace_status
  ON tickets(workspace_id, status);

-- Audit trail
CREATE TABLE IF NOT EXISTS ticket_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL,  -- system/agent/human
  actor_id TEXT,
  event_type TEXT NOT NULL,  -- created/status_changed/plan_generated/reviewed
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agents
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- planner/creator/reviewer
  model_profile TEXT NOT NULL DEFAULT 'local-default',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  daily_budget_tokens INT NOT NULL DEFAULT 200000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'success', -- success/failed
  token_in INT NOT NULL DEFAULT 0,
  token_out INT NOT NULL DEFAULT 0,
  cost_estimate NUMERIC(12,6) NOT NULL DEFAULT 0,
  latency_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prompt Vault
CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  category TEXT NOT NULL,  -- hook/script/headline/hashtag/planning
  name TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  score NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Business Brain (RAG)
CREATE TABLE IF NOT EXISTS knowledge_docs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source TEXT NOT NULL, -- drive/slack/crm/upload
  title TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id UUID NOT NULL REFERENCES knowledge_docs(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  embedding vector(768), -- ปรับตาม embedding model
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional: vector index (เลือก IVFFLAT หลังมีข้อมูลจำนวนมาก)
-- CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
--   ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
