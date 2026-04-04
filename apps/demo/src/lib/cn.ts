/** Simple className merge utility (no tailwind-merge needed for the demo) */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
