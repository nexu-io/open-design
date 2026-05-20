from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Literal
import os
import psycopg2
import psycopg2.extras
from uuid import uuid4

app = FastAPI(title="Studio365 API", version="0.1.0")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://studio:studio@localhost:5432/studio365")


def db():
    return psycopg2.connect(DATABASE_URL)


class TicketCreate(BaseModel):
    workspace_id: str
    title: str = Field(min_length=3)
    description: Optional[str] = ""
    priority: Literal["low", "med", "high"] = "med"


class TicketStatusPatch(BaseModel):
    status: Literal["backlog", "planning", "working", "review", "done"]


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/tickets")
def create_ticket(payload: TicketCreate):
    q = """
    INSERT INTO tickets (id, workspace_id, title, description, priority)
    VALUES (%s, %s, %s, %s, %s)
    RETURNING id, workspace_id, title, description, status, priority, created_at;
    """
    ticket_id = str(uuid4())
    with db() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(q, (ticket_id, payload.workspace_id, payload.title, payload.description, payload.priority))
        row = cur.fetchone()

        cur.execute("""
          INSERT INTO ticket_events (ticket_id, actor_type, event_type, payload)
          VALUES (%s, 'human', 'created', %s::jsonb)
        """, (ticket_id, '{"source":"api"}'))
        conn.commit()
    return row


@app.get("/tickets")
def list_tickets(workspace_id: str, status: Optional[str] = None):
    with db() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        if status:
            cur.execute("""
              SELECT * FROM tickets
              WHERE workspace_id=%s AND status=%s
              ORDER BY created_at DESC
            """, (workspace_id, status))
        else:
            cur.execute("""
              SELECT * FROM tickets
              WHERE workspace_id=%s
              ORDER BY created_at DESC
            """, (workspace_id,))
        return cur.fetchall()


@app.patch("/tickets/{ticket_id}/status")
def patch_ticket_status(ticket_id: str, payload: TicketStatusPatch):
    with db() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
          UPDATE tickets
          SET status=%s, updated_at=now()
          WHERE id=%s
          RETURNING *;
        """, (payload.status, ticket_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Ticket not found")

        cur.execute("""
          INSERT INTO ticket_events (ticket_id, actor_type, event_type, payload)
          VALUES (%s, 'human', 'status_changed', %s::jsonb)
        """, (ticket_id, f'{{"to":"{payload.status}"}}'))
        conn.commit()
    return row
