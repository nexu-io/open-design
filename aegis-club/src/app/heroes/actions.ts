"use server";

import { revalidatePath } from "next/cache";
import type { TutorialLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { extractYoutubeId } from "@/lib/youtube";
import { createTutorialSchema, voteTutorialSchema } from "@/lib/validations";

export interface AddTutorialState {
  ok?: boolean;
  error?: string;
}

const TUTORIAL_LEVELS: readonly TutorialLevel[] = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
];

function parseLevel(value: FormDataEntryValue | null): TutorialLevel {
  return TUTORIAL_LEVELS.includes(value as TutorialLevel)
    ? (value as TutorialLevel)
    : "BEGINNER";
}

/** Adiciona um tutorial em vídeo a um herói. */
export async function addTutorial(
  _prevState: AddTutorialState,
  formData: FormData,
): Promise<AddTutorialState> {
  try {
    const user = await requireUser();

    const heroId = Number(formData.get("heroId"));
    const title = String(formData.get("title") ?? "").trim();
    const youtube = String(formData.get("youtube") ?? "").trim();
    const level = parseLevel(formData.get("level"));

    if (!Number.isInteger(heroId) || heroId <= 0) {
      return { error: "Herói inválido." };
    }

    const youtubeId = extractYoutubeId(youtube);
    if (!youtubeId) {
      return { error: "Link do YouTube inválido." };
    }

    const parsed = createTutorialSchema.safeParse({
      heroId,
      title,
      youtube,
      level,
      language: "pt-BR",
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return {
        error: first?.message ?? "Dados do tutorial inválidos.",
      };
    }

    const hero = await prisma.hero.findUnique({
      where: { id: heroId },
      select: { slug: true },
    });
    if (!hero) {
      return { error: "Herói não encontrado." };
    }

    await prisma.tutorial.create({
      data: {
        heroId,
        title: parsed.data.title,
        youtubeId,
        level: parsed.data.level,
        language: "pt-BR",
        authorId: user.id,
      },
    });

    revalidatePath(`/heroes/${hero.slug}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return { error: "Você precisa entrar para enviar um tutorial." };
    }
    return { error: "Não foi possível enviar o tutorial. Tente novamente." };
  }
}

/** Registra (ou troca) o voto do usuário e recalcula o score do tutorial. */
export async function voteTutorial(
  tutorialId: string,
  value: number,
): Promise<void> {
  const user = await requireUser();

  const parsed = voteTutorialSchema.safeParse({ value });
  if (!parsed.success) {
    throw new Error("Voto inválido.");
  }
  const safeValue = parsed.data.value;

  const tutorial = await prisma.tutorial.findUnique({
    where: { id: tutorialId },
    select: { id: true, hero: { select: { slug: true } } },
  });
  if (!tutorial) {
    throw new Error("Tutorial não encontrado.");
  }

  await prisma.tutorialVote.upsert({
    where: { tutorialId_userId: { tutorialId, userId: user.id } },
    create: { tutorialId, userId: user.id, value: safeValue },
    update: { value: safeValue },
  });

  const agg = await prisma.tutorialVote.aggregate({
    where: { tutorialId },
    _sum: { value: true },
  });

  await prisma.tutorial.update({
    where: { id: tutorialId },
    data: { score: agg._sum.value ?? 0 },
  });

  revalidatePath(`/heroes/${tutorial.hero.slug}`);
}
