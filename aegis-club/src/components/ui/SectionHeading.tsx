export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-aegis">
            {eyebrow}
          </p>
        )}
        <h2 className="text-2xl font-bold text-zinc-100">{title}</h2>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
