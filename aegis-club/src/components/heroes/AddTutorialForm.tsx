"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { addTutorial, type AddTutorialState } from "@/app/heroes/actions";

const LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: "BEGINNER", label: "Iniciante" },
  { value: "INTERMEDIATE", label: "Intermediário" },
  { value: "ADVANCED", label: "Avançado" },
];

const initialState: AddTutorialState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Send className="h-4 w-4" />
      {pending ? "Enviando…" : "Enviar tutorial"}
    </Button>
  );
}

export function AddTutorialForm({ heroId }: { heroId: number }) {
  const [state, formAction] = useActionState(addTutorial, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const youtubeId = useId();
  const levelId = useId();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 rounded-2xl border border-surface-border bg-surface/60 p-5"
    >
      <input type="hidden" name="heroId" value={heroId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label
            htmlFor={titleId}
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            Título
          </label>
          <input
            id={titleId}
            name="title"
            type="text"
            required
            maxLength={120}
            placeholder="Ex: Como dominar a lane com este herói"
            className="w-full rounded-xl border border-surface-border bg-bg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-aegis/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegis/40"
          />
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor={youtubeId}
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            Link do YouTube
          </label>
          <input
            id={youtubeId}
            name="youtube"
            type="text"
            required
            placeholder="https://www.youtube.com/watch?v=…"
            className="w-full rounded-xl border border-surface-border bg-bg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-aegis/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegis/40"
          />
        </div>

        <div>
          <label
            htmlFor={levelId}
            className="mb-1.5 block text-sm font-medium text-zinc-300"
          >
            Nível
          </label>
          <select
            id={levelId}
            name="level"
            defaultValue="BEGINNER"
            className="w-full rounded-xl border border-surface-border bg-bg px-3.5 py-2.5 text-sm text-zinc-100 focus-visible:border-aegis/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegis/40"
          >
            {LEVEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.error && (
        <p className="text-sm text-behavior-bad" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="text-sm text-behavior-good" role="status">
          Tutorial enviado com sucesso!
        </p>
      )}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
