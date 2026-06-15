"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Check, Clock, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { sendFriendRequest } from "@/app/profile/actions";

/** Estado da conexão entre o visitante e o dono do perfil. */
export type ConnectionState = "none" | "PENDING" | "ACCEPTED";

export function ConnectButton({
  targetUserId,
  status,
}: {
  targetUserId: string;
  status: ConnectionState;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status === "ACCEPTED") {
    return (
      <Badge tone="good">
        <Check className="h-3.5 w-3.5" />
        Conectados
      </Badge>
    );
  }

  if (status === "PENDING") {
    return (
      <Button variant="secondary" size="sm" disabled>
        <Clock className="h-4 w-4" />
        Solicitação enviada
      </Button>
    );
  }

  function handleConnect() {
    setError(null);
    startTransition(async () => {
      const result = await sendFriendRequest(targetUserId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="primary"
        size="sm"
        onClick={handleConnect}
        disabled={isPending}
      >
        {isPending ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <UserPlus className="h-4 w-4" />
        )}
        Conectar
      </Button>
      {error && <p className="text-xs text-dire-soft">{error}</p>}
    </div>
  );
}
