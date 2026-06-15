"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center text-center">
      <TriangleAlert className="h-12 w-12 text-dire" />
      <h1 className="mt-4 font-display text-3xl font-bold text-zinc-100">
        Algo deu errado
      </h1>
      <p className="mt-2 max-w-md text-zinc-400">
        Ocorreu um erro inesperado. Você pode tentar novamente — se persistir,
        verifique se o banco de dados está rodando.
      </p>
      <Button onClick={reset} className="mt-6">
        Tentar de novo
      </Button>
    </div>
  );
}
