import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center text-center">
      <ShieldAlert className="h-12 w-12 text-aegis" />
      <h1 className="mt-4 font-display text-3xl font-bold text-zinc-100">
        Página não encontrada
      </h1>
      <p className="mt-2 max-w-md text-zinc-400">
        A página que você procura não existe ou foi movida. Que tal voltar para a
        base?
      </p>
      <Link
        href="/"
        className={cn(buttonVariants({ variant: "primary" }), "mt-6")}
      >
        Voltar para o início
      </Link>
    </div>
  );
}
