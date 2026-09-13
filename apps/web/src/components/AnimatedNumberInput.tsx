import { useState, type InputHTMLAttributes } from 'react';
import { AnimateDigits } from './AnimateDigits';
import styles from './AnimatedNumberInput.module.css';

export function AnimatedNumberInput({ value, onFocus, onBlur, ...props }: InputHTMLAttributes<HTMLInputElement> & { value: string }) {
  const [editing, setEditing] = useState(false);
  const animated = !editing && /^-?\d+(\.\d+)?$/.test(value);
  return (
    <span className={`cc-number-input ${styles.field}`} data-animated={animated || undefined}>
      <input {...props} value={value}
        onFocus={(event) => { setEditing(true); onFocus?.(event); }}
        onBlur={(event) => { setEditing(false); onBlur?.(event); }} />
      <span className={styles.overlay} aria-hidden="true">
        <AnimateDigits value={value} gap={0} enterY={16} enterBlur={8} />
      </span>
    </span>
  );
}
