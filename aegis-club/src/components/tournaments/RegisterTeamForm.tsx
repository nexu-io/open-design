"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { registerTeam, type RegisterTeamState } from "@/app/tournaments/actions";

const initialState: RegisterTeamState = {};

const fieldClass =
  "w-full rounded-xl border border-surface-border bg-bg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-aegis/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegis/40";
const labelClass = "mb-1.5 block text-sm font-medium text-zinc-300";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <UserPlus className="h-4 w-4" />
      {pending ? "Inscrevendo…" : "Inscrever time"}
    </Button>
  );
}

export function RegisterTeamForm({ tournamentId }: { tournamentId: string }) {
  const [state, formAction] = useActionState(registerTeam, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const nameId = useId();
  const tagId = useId();

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
      <input type="hidden" name="tournamentId" value={tournamentId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor={nameId} className={labelClass}>
            Nome do time
          </label>
          <input
            id={nameId}
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={40}
            placeholder="Ex: Aegis Esports"
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={tagId} className={labelClass}>
            Tag
          </label>
          <input
            id={tagId}
            name="tag"
            type="text"
            required
            minLength={1}
            maxLength={6}
            placeholder="AEG"
            className={fieldClass}
          />
        </div>
      </div>

      {state.error && (
        <p className="text-sm text-behavior-bad" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="text-sm text-behavior-good" role="status">
          Time inscrito com sucesso!
        </p>
      )}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
