const UNITS = ["B", "KB", "MB", "GB"] as const;

/** "12.4 MB": decimal units, one decimal below 10, none above. */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const text = unit === 0 || value >= 10 ? String(Math.round(value)) : value.toFixed(1);
  return `${text} ${UNITS[unit]}`;
}
