import { youtubeEmbedUrl } from "@/lib/youtube";

export function YouTubeEmbed({ id, title }: { id: string; title: string }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-surface-border bg-black">
      <iframe
        src={youtubeEmbedUrl(id)}
        title={title}
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
