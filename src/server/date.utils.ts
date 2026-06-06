/**
 * Parse a YYYY-MM-DD date string as LOCAL time on the server.
 * Node.js has the same UTC-midnight bug as browsers.
 */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  if (dateStr.includes('T')) return new Date(dateStr);
  return new Date(dateStr + 'T00:00:00');
}
