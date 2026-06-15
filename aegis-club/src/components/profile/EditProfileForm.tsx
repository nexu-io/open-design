"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Save, LoaderCircle, CheckCircle2 } from "lucide-react";
import type { DotaRole, Region } from "@prisma/client";
import { Button, buttonVariants } from "@/components/ui/Button";
import { HeroAvatar } from "@/components/heroes/HeroAvatar";
import { HEROES } from "@/data/heroes";
import { cn } from "@/lib/utils";
import { updateProfile, type UpdateProfileState } from "@/app/profile/actions";
import { DOTA_ROLES, DOTA_ROLE_LABELS, REGIONS, REGION_LABELS } from "./labels";

/** Valores atuais (serializáveis) passados pelo Server Component. */
export interface EditProfileValues {
  userId: string;
  nickname: string;
  bio: string;
  region: Region;
  mainRoles: DotaRole[];
  favoriteHeroIds: number[];
  discord: string;
  twitch: string;
  youtube: string;
}

const initialState: UpdateProfileState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <Save className="h-4 w-4" />
      )}
      Salvar alterações
    </Button>
  );
}

export function EditProfileForm({ values }: { values: EditProfileValues }) {
  const [state, formAction] = useActionState(updateProfile, initialState);

  const fieldClass =
    "w-full rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-aegis/60 focus:outline-none focus:ring-2 focus:ring-aegis/30";
  const labelClass = "mb-1.5 block text-sm font-medium text-zinc-300";

  return (
    <form action={formAction} className="space-y-7">
      {/* Identificação */}
      <div>
        <label htmlFor="nickname" className={labelClass}>
          Apelido
        </label>
        <input
          id="nickname"
          name="nickname"
          type="text"
          required
          minLength={2}
          maxLength={32}
          defaultValue={values.nickname}
          placeholder="Como você quer ser chamado"
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor="bio" className={labelClass}>
          Biografia
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          maxLength={500}
          defaultValue={values.bio}
          placeholder="Fale um pouco sobre você (máx. 500 caracteres)"
          className={cn(fieldClass, "resize-y")}
        />
      </div>

      <div>
        <label htmlFor="region" className={labelClass}>
          Região
        </label>
        <select
          id="region"
          name="region"
          defaultValue={values.region}
          className={fieldClass}
        >
          {REGIONS.map((region) => (
            <option key={region} value={region}>
              {REGION_LABELS[region]}
            </option>
          ))}
        </select>
      </div>

      {/* Funções */}
      <fieldset>
        <legend className={labelClass}>Funções principais</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DOTA_ROLES.map((role) => (
            <label
              key={role}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-aegis/40"
            >
              <input
                type="checkbox"
                name="mainRoles"
                value={role}
                defaultChecked={values.mainRoles.includes(role)}
                className="h-4 w-4 accent-aegis"
              />
              {DOTA_ROLE_LABELS[role]}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Heróis favoritos */}
      <fieldset>
        <legend className={labelClass}>Heróis favoritos</legend>
        <p className="mb-3 text-xs text-zinc-500">
          Selecione até 6 heróis para destacar no seu perfil.
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {HEROES.map((hero) => (
            <label
              key={hero.id}
              className="group relative cursor-pointer overflow-hidden rounded-lg border border-surface-border transition-colors has-[:checked]:border-aegis has-[:checked]:ring-2 has-[:checked]:ring-aegis/40"
              title={hero.localizedName}
            >
              <input
                type="checkbox"
                name="favoriteHeroIds"
                value={hero.id}
                defaultChecked={values.favoriteHeroIds.includes(hero.id)}
                className="peer sr-only"
              />
              <HeroAvatar
                slug={hero.slug}
                name={hero.localizedName}
                size="sm"
                className="h-12 w-full rounded-none border-0"
              />
              <span className="absolute inset-0 hidden items-center justify-center bg-aegis/30 peer-checked:flex">
                <CheckCircle2 className="h-5 w-5 text-bg" />
              </span>
              <span className="block truncate bg-surface px-1 py-0.5 text-center text-[10px] text-zinc-400">
                {hero.localizedName}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Redes */}
      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <label htmlFor="discord" className={labelClass}>
            Discord
          </label>
          <input
            id="discord"
            name="discord"
            type="text"
            maxLength={64}
            defaultValue={values.discord}
            placeholder="usuario#0000"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="twitch" className={labelClass}>
            Twitch
          </label>
          <input
            id="twitch"
            name="twitch"
            type="text"
            maxLength={64}
            defaultValue={values.twitch}
            placeholder="seu_canal"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="youtube" className={labelClass}>
            YouTube
          </label>
          <input
            id="youtube"
            name="youtube"
            type="text"
            maxLength={64}
            defaultValue={values.youtube}
            placeholder="seu_canal"
            className={fieldClass}
          />
        </div>
      </div>

      {/* Feedback + ações */}
      {state.error && (
        <p className="rounded-xl border border-dire/30 bg-dire/10 px-3 py-2 text-sm text-dire-soft">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="flex items-center gap-2 rounded-xl border border-radiant/30 bg-radiant/10 px-3 py-2 text-sm text-radiant">
          <CheckCircle2 className="h-4 w-4" />
          Perfil atualizado com sucesso.
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton />
        <Link
          href={`/profile/${values.userId}`}
          className={cn(buttonVariants({ variant: "ghost" }))}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
