import { google } from "googleapis";
import { logger } from "../logger";
import type { CalendarEvent } from "./time-budget";

/**
 * Henter kalenderhendelser for én bruker via lagret refresh token.
 *
 * Krever at Google-OAuth-appen står i "Production" i Google Cloud Console —
 * i "Testing" utløper refresh token etter 7 dager og henting vil begynne å
 * feile stille for den automatiske kjøringen. Se README.
 */
export async function fetchCalendarEvents(
  refreshToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEvent[]> {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const res = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events: CalendarEvent[] = [];
    for (const item of res.data.items ?? []) {
      // Heldagshendelser (date, ikke dateTime) teller ikke som "opptatt" i
      // kveldsvinduet — de representerer typisk ikke en konkret avtale.
      const startStr = item.start?.dateTime;
      const endStr = item.end?.dateTime;
      if (!startStr || !endStr) continue;
      events.push({ start: new Date(startStr), end: new Date(endStr) });
    }
    return events;
  } catch (err) {
    logger.error("Klarte ikke hente kalenderhendelser", {
      calendarId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Ved feil: ingen hendelser kjent -> behandles som helt ledig kveld for
    // DENNE brukeren. Siden computeDayTimeBudget tar maks av de to
    // brukerne, feiler ikke hele dagsberegningen hvis den andre brukerens
    // kalender fungerer; men logges tydelig slik at feilen er synlig.
    return [];
  }
}
