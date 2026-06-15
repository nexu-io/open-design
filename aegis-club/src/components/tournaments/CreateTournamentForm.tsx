"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  createTournament,
  type CreateTournamentState,
} from "@/app/tournaments/actions";

const FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: "SINGLE_ELIMINATION", label: "Eliminação simples" },
  { value: "DOUBLE_ELIMINATION", label: "Eliminação dupla" },
  { value: "ROUND_ROBIN", label: "Pontos corridos" },
];

const REGION_OPTIONS: { value: string; label: string }[] = [
  { value: "SA", label: "América do Sul" },
  { value: "NA", label: "América do Norte" },
  { value: "EU", label: "Europa" },
  { value: "CIS", label: "CIS" },
  { value: "SEA", label: "Sudeste Asiático" },
  { value: "CHINA", label: "China" },
];

const initialState: CreateTournamentState = {};

const fieldClass =
  "w-full rounded-xl border border-surface-border bg-bg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-aegis/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegis/40";
const labelClass = "mb-1.5 block text-sm font-medium text-zinc-300";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Trophy className="h-4 w-4" />
      {pending ? "Criando…" : "Criar torneio"}
    </Button>
  );
}

export function CreateTournamentForm() {
  const [state, formAction] = useActionState(createTournament, initialState);
  const nameId = useId();
  const descId = useId();
  const formatId = useId();
  const regionId = useId();
  const maxTeamsId = useId();
  const prizeId = useId();
  const regEndsId = useId();
  const startsId = useId();

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-surface-border bg-surface/60 p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={nameId} className={labelClass}>
            Nome do torneio
          </label>
          <input
            id={nameId}
            name="name"
            type="text"
            required
            minLength={4}
            maxLength={80}
            placeholder="Ex: Copa Aegis de Verão"
            className={fieldClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={descId} className={labelClass}>
            Descrição{" "}
            <span className="text-zinc-500">(opcional)</span>
          </label>
          <textarea
            id={descId}
            name="description"
            rows={4}
            maxLength={2000}
            placeholder="Regras, premiação, formato e detalhes do campeonato."
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={formatId} className={labelClass}>
            Formato
          </label>
          <select
            id={formatId}
            name="format"
            defaultValue="SINGLE_ELIMINATION"
            className={fieldClass}
          >
            {FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={regionId} className={labelClass}>
            Região
          </label>
          <select
            id={regionId}
            name="region"
            defaultValue="SA"
            className={fieldClass}
          >
            {REGION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={maxTeamsId} className={labelClass}>
            Máximo de times
          </label>
          <input
            id={maxTeamsId}
            name="maxTeams"
            type="number"
            min={2}
            max={64}
            defaultValue={8}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={prizeId} className={labelClass}>
            Premiação{" "}
            <span className="text-zinc-500">(opcional)</span>
          </label>
          <input
            id={prizeId}
            name="prizePool"
            type="text"
            maxLength={120}
            placeholder="Ex: R$ 500"
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={regEndsId} className={labelClass}>
            Fim das inscrições{" "}
            <span className="text-zinc-500">(opcional)</span>
          </label>
          <input
            id={regEndsId}
            name="registrationEndsAt"
            type="datetime-local"
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={startsId} className={labelClass}>
            Início do torneio{" "}
            <span className="text-zinc-500">(opcional)</span>
          </label>
          <input
            id={startsId}
            name="startsAt"
            type="datetime-local"
            className={fieldClass}
          />
        </div>
      </div>

      {state.error && (
        <p className="text-sm text-behavior-bad" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
