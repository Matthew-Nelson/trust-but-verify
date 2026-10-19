// R-UI-2. ASCII whitespace only: JS trim() would also strip Unicode spaces.
const ASCII_WS = /^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g;

export const trimAscii = (s: string): string => s.replace(ASCII_WS, "");

export function normalizeDestination(raw: string): string {
  const t = trimAscii(raw);
  return /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(t) ? t : `https://${t}`;
}
