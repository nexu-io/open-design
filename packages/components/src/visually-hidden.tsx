import type { HTMLAttributes, ReactNode } from 'react';

import { joinClassNames } from './class-names';

export interface VisuallyHiddenProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

export function VisuallyHidden({ children, className, ...props }: VisuallyHiddenProps) {
  return <span className={joinClassNames('sr-only', className)} {...props}>{children}</span>;
}
