// Stock theme colors that popular CSS frameworks and starter kits ship by
// default. A site that never restyled its framework emits these everywhere, so
// frequency and token names (`--bs-primary`, `.btn-primary`) make them look
// like brand evidence when they are only a framework fingerprint. Exact-match
// on purpose: a near miss is a deliberate brand choice, not a stock default.
//
// Tailwind's palette is intentionally absent: brands pick from it on purpose,
// so a Tailwind hue is not evidence that the site kept a framework default.

const FRAMEWORK_DEFAULT_COLORS: ReadonlySet<string> = new Set([
  // Laravel 5.3–5.5 starter (Bootstrap 3 with Laravel's own brand-* overrides)
  '#3097d1', '#8eb4cb', '#2ab27b', '#cbb956', '#bf5329',
  // Laravel 5.6–7 starter (laravel/ui Bootstrap 4 palette)
  '#3490dc', '#6574cd', '#9561e2', '#f66d9b', '#e3342f', '#f6993f', '#ffed4a', '#38c172', '#4dc0b5', '#6cb2eb',
  // Bootstrap 3
  '#337ab7', '#5cb85c', '#5bc0de', '#f0ad4e', '#d9534f',
  // Bootstrap 4
  '#007bff', '#6610f2', '#6f42c1', '#e83e8c', '#dc3545', '#fd7e14', '#ffc107', '#28a745', '#20c997', '#17a2b8',
  // Bootstrap 5 (colors not already listed for Bootstrap 4)
  '#0d6efd', '#d63384', '#198754', '#0dcaf0',
  // Ant Design 4 / 5
  '#1890ff', '#1677ff', '#52c41a', '#faad14', '#ff4d4f',
  // MUI 4
  '#3f51b5', '#f50057', '#f44336', '#ff9800', '#2196f3', '#4caf50',
  // MUI 5
  '#1976d2', '#9c27b0', '#d32f2f', '#ed6c02', '#0288d1', '#2e7d32',
]);

/** True when `hex` (normalized lowercase #rrggbb) is a framework's stock theme color. */
export function isFrameworkDefaultColor(hex: string): boolean {
  return FRAMEWORK_DEFAULT_COLORS.has(hex);
}
