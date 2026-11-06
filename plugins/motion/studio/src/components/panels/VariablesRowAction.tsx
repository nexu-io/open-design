/** Small text-button used in the Variables tab rows (Edit / Remove / Set default / Declare). */
export function RowAction({
  label,
  title,
  danger,
  onClick,
}: {
  label: string;
  title: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`h-5 rounded px-1.5 text-[9px] text-neutral-500 hover:bg-neutral-800 ${
        danger ? "hover:text-danger-ink" : "hover:text-neutral-200"
      }`}
    >
      {label}
    </button>
  );
}
