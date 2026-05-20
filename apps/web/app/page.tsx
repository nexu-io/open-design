"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

type Ticket = {
  id: string;
  title: string;
  status: "backlog" | "planning" | "working" | "review" | "done";
  priority: "low" | "med" | "high";
};

const columns: Ticket["status"][] = ["backlog", "planning", "working", "review", "done"];

export default function HomePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [title, setTitle] = useState("");

  const load = async () => {
    const res = await fetch(`${API}/tickets?workspace_id=${WORKSPACE_ID}`);
    const data = await res.json();
    setTickets(data);
  };

  useEffect(() => {
    load();
  }, []);

  const createTicket = async () => {
    if (!title.trim()) return;
    await fetch(`${API}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: WORKSPACE_ID, title, priority: "med" }),
    });
    setTitle("");
    load();
  };

  const move = async (id: string, status: Ticket["status"]) => {
    await fetch(`${API}/tickets/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Studio365 Workforce Command</h1>

      <div className="flex gap-2">
        <input
          className="border rounded px-3 py-2 w-96"
          placeholder="ชื่องานใหม่..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="bg-black text-white px-4 py-2 rounded" onClick={createTicket}>
          สร้าง Ticket
        </button>
      </div>

      <section className="grid grid-cols-5 gap-4">
        {columns.map((col) => (
          <div key={col} className="border rounded p-3 min-h-[300px]">
            <h2 className="font-semibold mb-3 uppercase">{col}</h2>
            <div className="space-y-2">
              {tickets
                .filter((t) => t.status === col)
                .map((t) => (
                  <div key={t.id} className="border rounded p-2 bg-white">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs text-gray-500 mb-2">priority: {t.priority}</div>
                    <div className="flex flex-wrap gap-1">
                      {columns.map((next) => (
                        <button
                          key={next}
                          className="text-xs border rounded px-2 py-1"
                          onClick={() => move(t.id, next)}
                        >
                          {next}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
