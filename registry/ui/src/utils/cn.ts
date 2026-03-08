/**
 * Simple className utility (shadcn/ui convention).
 * Merges class names, filtering out falsy values.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
