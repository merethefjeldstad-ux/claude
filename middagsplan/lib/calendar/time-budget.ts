import type { TimeCategory } from "@prisma/client";

/**
 * Oversetter kveldens kalenderavtaler til en tid-til-middag-kategori.
 * Enkel, justerbar regel (per krav): et fast kveldsvindu (default 16–21) minus
 * opptatt tid gir "ledig tid"; terskler avgjør kategori. Terskelverdiene
 * ligger i TimeBudgetConfig (databasen) og kan endres uten kodeendring —
 * se README.
 *
 * ANTAKELSE (dokumentert, ikke hentet fra kravet): når begge brukeres
 * kalendere sjekkes, brukes den av de to som har MEST ledig tid den kvelden
 * — det holder at én av de to kan lage middag. Ønsker husstanden heller at
 * BEGGE må være ledige (strengere regel), er det denne funksjonen som må
 * endres (computeDayTimeBudget), resten av appen bryr seg kun om resultatet.
 */

export interface CalendarEvent {
  start: Date;
  end: Date;
}

export interface TimeBudgetConfig {
  eveningStart: string; // "HH:mm"
  eveningEnd: string; // "HH:mm"
  kjaptMaxMinutes: number;
  middelsMaxMinutes: number;
}

export const DEFAULT_TIME_BUDGET_CONFIG: TimeBudgetConfig = {
  eveningStart: "16:00",
  eveningEnd: "21:00",
  kjaptMaxMinutes: 30,
  middelsMaxMinutes: 60,
};

function parseTimeOnDate(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Slår sammen overlappende/tilstøtende intervaller. */
function mergeIntervals(intervals: [Date, Date][]): [Date, Date][] {
  const sorted = [...intervals].sort((a, b) => a[0].getTime() - b[0].getTime());
  const merged: [Date, Date][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start.getTime() <= last[1].getTime()) {
      if (end.getTime() > last[1].getTime()) last[1] = end;
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/** Ledige minutter for én person i kveldsvinduet på gitt dato. */
export function freeMinutesForUser(
  events: CalendarEvent[],
  date: Date,
  config: TimeBudgetConfig = DEFAULT_TIME_BUDGET_CONFIG,
): number {
  const windowStart = parseTimeOnDate(date, config.eveningStart);
  const windowEnd = parseTimeOnDate(date, config.eveningEnd);
  const windowMinutes = Math.max(0, (windowEnd.getTime() - windowStart.getTime()) / 60000);

  const clipped: [Date, Date][] = events
    .map((e): [Date, Date] => [
      new Date(Math.max(e.start.getTime(), windowStart.getTime())),
      new Date(Math.min(e.end.getTime(), windowEnd.getTime())),
    ])
    .filter(([s, e]) => e.getTime() > s.getTime());

  const busyMinutes = mergeIntervals(clipped).reduce(
    (sum, [s, e]) => sum + (e.getTime() - s.getTime()) / 60000,
    0,
  );

  return Math.max(0, Math.round(windowMinutes - busyMinutes));
}

export function categoryForFreeMinutes(
  freeMinutes: number,
  config: TimeBudgetConfig = DEFAULT_TIME_BUDGET_CONFIG,
): TimeCategory {
  if (freeMinutes < config.kjaptMaxMinutes) return "KJAPT";
  if (freeMinutes < config.middelsMaxMinutes) return "MIDDELS";
  return "TIDKREVENDE";
}

export interface DayTimeBudget {
  availableMinutes: number;
  timeCategory: TimeCategory;
}

/** Se ANTAKELSE i filkommentaren: bruker den mest ledige av de to. */
export function computeDayTimeBudget(
  userEventLists: CalendarEvent[][],
  date: Date,
  config: TimeBudgetConfig = DEFAULT_TIME_BUDGET_CONFIG,
): DayTimeBudget {
  const freeMinutesPerUser = userEventLists.map((events) =>
    freeMinutesForUser(events, date, config),
  );
  const availableMinutes = freeMinutesPerUser.length > 0 ? Math.max(...freeMinutesPerUser) : 0;
  return { availableMinutes, timeCategory: categoryForFreeMinutes(availableMinutes, config) };
}
