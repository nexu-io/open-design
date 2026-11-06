export function RippleEditIcon({ size = 16 }: { size?: number | string }) {
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
      <rect x="1.5" y="8" width="4" height="5" rx="0.5" />
      <rect x="10.5" y="8" width="4" height="5" rx="0.5" />
      <path d="M13 4H6m2-2L6 4l2 2" />
    </svg>
  );
}
