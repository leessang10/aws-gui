import { t } from "./i18n";
export function mergeRows<T extends Record<string, unknown>>(
  previous: T[],
  incoming: T[],
  identity: (row: T) => string,
): T[] {
  const merged = [
    ...new Map(
      [...previous, ...incoming].map((row) => [identity(row), row]),
    ).values(),
  ];
  // Keep both DOM work and retained message bodies bounded. Never silently truncate.
  if (merged.length > 5000 || JSON.stringify(merged).length > 8 * 1024 * 1024) {
    throw new Error(t("resultLimit"));
  }
  return merged;
}
