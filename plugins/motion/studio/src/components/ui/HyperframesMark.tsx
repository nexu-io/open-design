import { useId, type SVGProps } from "react";

export function HyperframesMark({ viewBox = "0 0 100 100", ...props }: SVGProps<SVGSVGElement>) {
  const gradientId = useId();
  const leftGradient = `${gradientId}-left`;
  const rightGradient = `${gradientId}-right`;
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <g transform="translate(50 50)" opacity=".92">
        <g transform="translate(-50 -50)">
          <path
            d="M10.1851 57.8021L33.1145 73.8313C36.2202 75.9978 41.5173 73.5433 42.4816 69.4984L51.7611 30.4271C52.7253 26.3822 48.5802 23.9277 44.4602 26.0942L13.917 42.1235C6.96677 45.7676 4.97564 54.1579 10.1851 57.8021Z"
            fill={`url(#${leftGradient})`}
          />
          <path
            d="M87.5129 57.5141L56.9696 73.5433C52.8371 75.7098 48.7046 73.2553 49.6688 69.2104L58.9483 30.1391C59.9125 26.0942 65.2097 23.6397 68.3154 25.8062L91.2447 41.8354C96.4668 45.4796 94.4631 53.8699 87.5129 57.5141Z"
            fill={`url(#${rightGradient})`}
          />
        </g>
      </g>
      <defs>
        <linearGradient
          id={leftGradient}
          x1="48.5676"
          y1="25"
          x2="44.7804"
          y2="71.9384"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#06E3FA" />
          <stop offset="1" stopColor="#4FDB5E" />
        </linearGradient>
        <linearGradient
          id={rightGradient}
          x1="54.8282"
          y1="73.8392"
          x2="72.0989"
          y2="32.8932"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#06E3FA" />
          <stop offset="1" stopColor="#4FDB5E" />
        </linearGradient>
      </defs>
    </svg>
  );
}
