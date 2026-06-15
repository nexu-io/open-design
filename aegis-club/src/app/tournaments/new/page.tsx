import Link from "next/link";
import { Trophy } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { CreateTournamentForm } from "@/components/tournaments/CreateTournamentForm";

export const metadata = { title: "Criar torneio" };

export default async function NewTournamentPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={<Trophy className="h-10 w-10" />}
          title="Entre para criar um torneio"
          description="Conecte sua conta Steam para organizar campeonatos da comunidade."
          action={
            <Link
              href="/api/auth/steam/login"
              className={cn(buttonVariants({ variant: "primary" }))}
            >
              Entrar com Steam
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page max-w-3xl py-10">
      <SectionHeading
        eyebrow="Competitivo"
        title="Criar torneio"
        description="Configure o formato, a região e as inscrições. O torneio começa como rascunho."
      />
      <CreateTournamentForm />
    </div>
  );
}
