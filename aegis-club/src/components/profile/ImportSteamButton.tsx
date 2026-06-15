"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, LoaderCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { importSteamStats } from "@/app/profile/actions";

export function ImportSteamButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleImport() {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await importSteamStats();
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleImport}
        disabled={isPending}
      >
        {isPending ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : done ? (
          <CheckCircle2 className="h-4 w-4 text-radiant" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Importar MMR da Steam
      </Button>
      {error && <p className="text-xs text-dire-soft">{error}</p>}
      {done && !error && (
        <p className="text-xs text-radiant">MMR atualizado com sucesso.</p>
      )}
    </div>
  );
}
