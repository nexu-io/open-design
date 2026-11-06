import { VideoFrameThumbnail } from "../ui/VideoFrameThumbnail";

export function RenderPreview({
  filename,
  src,
  hovered,
  ready,
  onReady,
}: {
  filename: string;
  src: string;
  hovered: boolean;
  ready: boolean;
  onReady: () => void;
}) {
  if (filename.endsWith(".gif")) {
    return <img src={src} alt={filename} className="w-full h-full object-contain" />;
  }
  return (
    <>
      {hovered && (
        <video
          src={src}
          autoPlay
          muted
          loop
          playsInline
          onCanPlay={onReady}
          className="absolute inset-0 w-full h-full object-contain transition-opacity duration-150"
          style={{ opacity: ready ? 1 : 0 }}
        />
      )}
      <div
        className="absolute inset-0 transition-opacity duration-150"
        style={{ opacity: hovered && ready ? 0 : 1 }}
      >
        <VideoFrameThumbnail src={src} />
      </div>
    </>
  );
}
