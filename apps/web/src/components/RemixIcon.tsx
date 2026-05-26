import type { CSSProperties } from 'react';

interface RemixIconProps {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function RemixIcon({ name, size = 14, className, style }: RemixIconProps) {
  return (
    <i
      className={`ri-${name}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      style={{
        fontSize: size,
        lineHeight: 1,
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    />
  );
}
