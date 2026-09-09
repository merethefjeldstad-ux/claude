/** Enkel delt-hemmelighet-sjekk for de interne cron-endepunktene. */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // ikke konfigurert -> avvis, ikke tillat i det stille
  const header = request.headers.get("x-cron-secret");
  return header === secret;
}
