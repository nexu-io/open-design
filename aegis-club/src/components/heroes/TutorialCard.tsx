import type { Tutorial, TutorialLevel, TutorialVote, User } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { YouTubeEmbed } from "@/components/heroes/YouTubeEmbed";
import { VoteButtons } from "@/components/heroes/VoteButtons";

const LEVEL_LABELS: Record<TutorialLevel, string> = {
  BEGINNER: "Iniciante",
  INTERMEDIATE: "Intermediário",
  ADVANCED: "Avançado",
};

const LEVEL_TONE: Record<
  TutorialLevel,
  "good" | "warn" | "bad" | "neutral" | "aegis"
> = {
  BEGINNER: "good",
  INTERMEDIATE: "warn",
  ADVANCED: "bad",
};

export type TutorialWithRelations = Tutorial & {
  author: Pick<User, "id" | "nickname"> | null;
  votes?: Pick<TutorialVote, "value">[];
};

export function TutorialCard({
  tutorial,
  currentUserId,
}: {
  tutorial: TutorialWithRelations;
  currentUserId?: string | null;
}) {
  const myVote = tutorial.votes?.[0]?.value ?? 0;

  return (
    <Card className="overflow-hidden">
      <YouTubeEmbed id={tutorial.youtubeId} title={tutorial.title} />
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold leading-snug text-zinc-100">
            {tutorial.title}
          </h3>
          <Badge tone={LEVEL_TONE[tutorial.level]}>
            {LEVEL_LABELS[tutorial.level]}
          </Badge>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">
            {tutorial.author
              ? `por ${tutorial.author.nickname}`
              : "Autor desconhecido"}
          </p>
          <VoteButtons
            tutorialId={tutorial.id}
            score={tutorial.score}
            myVote={myVote}
            canVote={Boolean(currentUserId)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
