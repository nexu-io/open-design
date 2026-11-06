export function ReverseGradientIcon({ size = 16 }: { size?: number | string }) {
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
      <path d="M2 3h12m-2-2 2 2-2 2M14 8H2m2-2L2 8l2 2" />
      <g fill="currentColor" stroke="none">
        <path d="M2 12h3v2H2z" opacity="0.25" />
        <path d="M5 12h3v2H5z" opacity="0.5" />
        <path d="M8 12h3v2H8z" opacity="0.75" />
        <path d="M11 12h3v2h-3z" />
      </g>
    </svg>
  );
}
