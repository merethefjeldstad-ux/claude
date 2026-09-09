/**
 * Frittstående scheduler-prosess (kjøres som egen node-prosess, f.eks. via
 * `npm run scheduler`, ved siden av Next.js-serveren).
 *
 * node-cron sin `timezone`-opsjon bruker IANA-tidssonedatabasen og
 * håndterer sommer-/vintertid automatisk for "Europe/Oslo" — så "10:00" og
 * "22:00" betyr faktisk norsk lokal tid året rundt, uansett hvilken UTC-sone
 * serveren selv kjører i.
 *
 * - Mandag 10:00: hent ukens tilbud + generer ny meny.
 * - Hver dag 22:00: sjekk kalenderendringer og ombalanser uken ved behov.
 */
import cron from "node-cron";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error("CRON_SECRET er ikke satt — scheduler kan ikke autentisere seg mot API-et.");
  process.exit(1);
}

async function callCronEndpoint(path: string, label: string) {
  const startedAt = new Date().toISOString();
  try {
    const res = await fetch(`${APP_URL}${path}`, {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET as string },
    });
    const body = await res.json().catch(() => ({}));
    console.log(
      JSON.stringify({ level: "info", job: label, startedAt, status: res.status, body }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        job: label,
        startedAt,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

cron.schedule(
  "0 10 * * 1",
  () => callCronEndpoint("/api/cron/weekly", "ukentlig-tilbud-og-meny"),
  { timezone: "Europe/Oslo" },
);

cron.schedule(
  "0 22 * * *",
  () => callCronEndpoint("/api/cron/daily", "daglig-ombalansering"),
  { timezone: "Europe/Oslo" },
);

console.log(
  "Scheduler startet (Europe/Oslo): mandag 10:00 (tilbud+meny), hver dag 22:00 (ombalansering).",
);
