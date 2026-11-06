export function InspectorIcon({ size = 16 }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1.5" y="2" width="13" height="12" rx="1.5" />
      <path d="M4 6h8M6 4.5v3M4 10h8m-2-1.5v3" />
    </svg>
  );
}
