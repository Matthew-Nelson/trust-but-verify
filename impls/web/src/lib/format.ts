/** createdAt as UTC "YYYY-MM-DD HH:MM", seconds truncated (R-UI-5). */
export function formatCreated(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}
