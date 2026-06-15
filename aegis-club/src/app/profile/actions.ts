"use server";

import { revalidatePath } from "next/cache";
import type { DotaRole, Region } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  steamIdToAccountId,
  fetchOpenDotaPlayer,
  rankTierToApproxMmr,
} from "@/lib/opendota";
import { updateProfileSchema } from "@/lib/validations";

export interface UpdateProfileState {
  ok?: boolean;
  error?: string;
}

export interface SimpleActionState {
  ok?: boolean;
  error?: string;
}

const DOTA_ROLES: readonly DotaRole[] = [
  "CARRY",
  "MID",
  "OFFLANE",
  "SOFT_SUPPORT",
  "HARD_SUPPORT",
];

const REGIONS: readonly Region[] = ["SA", "NA", "EU", "CIS", "SEA", "CHINA"];

function parseRoles(values: FormDataEntryValue[]): DotaRole[] {
  const roles = values
    .map((v) => String(v))
    .filter((v): v is DotaRole => DOTA_ROLES.includes(v as DotaRole));
  // Remove duplicatas preservando ordem.
  return Array.from(new Set(roles)).slice(0, 5);
}

function parseRegion(value: FormDataEntryValue | null): Region {
  return REGIONS.includes(value as Region) ? (value as Region) : "SA";
}

function parseHeroIds(values: FormDataEntryValue[]): number[] {
  const ids = values
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  return Array.from(new Set(ids)).slice(0, 6);
}

/** Normaliza um campo de texto opcional: vazio vira undefined. */
function optionalText(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : undefined;
}

/** Atualiza o nickname (User) e os campos de perfil (Profile). */
export async function updateProfile(
  _prevState: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  try {
    const user = await requireUser();

    const nickname = String(formData.get("nickname") ?? "").trim();
    const bio = optionalText(formData.get("bio"));
    const region = parseRegion(formData.get("region"));
    const mainRoles = parseRoles(formData.getAll("mainRoles"));
    const favoriteHeroIds = parseHeroIds(formData.getAll("favoriteHeroIds"));
    const discord = optionalText(formData.get("discord"));
    const twitch = optionalText(formData.get("twitch"));
    const youtube = optionalText(formData.get("youtube"));

    const parsed = updateProfileSchema.safeParse({
      nickname,
      bio,
      region,
      mainRoles,
      favoriteHeroIds,
      discord,
      twitch,
      youtube,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { error: first?.message ?? "Dados do perfil inválidos." };
    }

    const data = parsed.data;

    await prisma.user.update({
      where: { id: user.id },
      data: { nickname: data.nickname ?? nickname },
    });

    const profileData = {
      bio: bio ?? null,
      region,
      mainRoles,
      favoriteHeroIds,
      discord: discord ?? null,
      twitch: twitch ?? null,
      youtube: youtube ?? null,
    };

    await prisma.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...profileData },
      update: profileData,
    });

    revalidatePath(`/profile/${user.id}`);
    revalidatePath("/profile/edit");
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return { error: "Você precisa entrar para editar seu perfil." };
    }
    return { error: "Não foi possível salvar o perfil. Tente novamente." };
  }
}

/** Envia uma solicitação de conexão (amizade) para outro usuário. */
export async function sendFriendRequest(
  targetUserId: string,
): Promise<SimpleActionState> {
  try {
    const user = await requireUser();

    if (!targetUserId || targetUserId === user.id) {
      return { error: "Você não pode se conectar consigo mesmo." };
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!target) {
      return { error: "Usuário não encontrado." };
    }

    try {
      await prisma.friendship.create({
        data: {
          requesterId: user.id,
          addresseeId: targetUserId,
          status: "PENDING",
        },
      });
    } catch {
      // Já existe (restrição única) — ignora silenciosamente.
    }

    revalidatePath(`/profile/${targetUserId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return { error: "Você precisa entrar para se conectar." };
    }
    return { error: "Não foi possível enviar a solicitação." };
  }
}

/** Importa o MMR público da Steam/OpenDota para o perfil do usuário. */
export async function importSteamStats(): Promise<SimpleActionState> {
  try {
    const user = await requireUser();

    if (!user.steamId) {
      return { error: "Nenhuma conta Steam vinculada." };
    }

    const accountId = steamIdToAccountId(user.steamId);
    const player = await fetchOpenDotaPlayer(accountId);
    if (!player) {
      return { error: "Não foi possível obter os dados da OpenDota." };
    }

    const publicMmr = rankTierToApproxMmr(player.rank_tier);
    if (publicMmr === null) {
      return {
        error: "Seu perfil da OpenDota não expõe a medalha (rank tier).",
      };
    }

    await prisma.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, publicMmr },
      update: { publicMmr },
    });

    revalidatePath(`/profile/${user.id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return { error: "Você precisa entrar para importar o MMR." };
    }
    return { error: "Não foi possível importar o MMR. Tente novamente." };
  }
}
