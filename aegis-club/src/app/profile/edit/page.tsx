import Link from "next/link";
import { UserCog } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  EditProfileForm,
  type EditProfileValues,
} from "@/components/profile/EditProfileForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar perfil" };

export default async function EditProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={<UserCog className="h-10 w-10" />}
          title="Entre para editar seu perfil"
          description="Conecte sua conta Steam para personalizar funções, heróis favoritos e redes sociais."
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

  const profile = user.profile;

  const values: EditProfileValues = {
    userId: user.id,
    nickname: user.nickname,
    bio: profile?.bio ?? "",
    region: profile?.region ?? "SA",
    mainRoles: profile?.mainRoles ?? [],
    favoriteHeroIds: profile?.favoriteHeroIds ?? [],
    discord: profile?.discord ?? "",
    twitch: profile?.twitch ?? "",
    youtube: profile?.youtube ?? "",
  };

  return (
    <div className="container-page py-10">
      <SectionHeading
        eyebrow="Perfil"
        title="Editar perfil"
        description="Personalize como a comunidade vê você: apelido, funções, heróis favoritos e redes."
        action={
          <Link
            href={`/profile/${user.id}`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Ver perfil
          </Link>
        }
      />

      <Card>
        <CardContent className="py-6">
          <EditProfileForm values={values} />
        </CardContent>
      </Card>
    </div>
  );
}
