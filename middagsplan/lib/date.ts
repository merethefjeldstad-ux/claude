/** Mandag (00:00 lokal tid) i uken som inneholder `date`. */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = søndag, 1 = mandag, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export const NORWEGIAN_WEEKDAYS = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
];

export function formatNorwegianDate(date: Date): string {
  return `${date.getDate()}.${date.getMonth() + 1}.`;
}

const NORWEGIAN_MONTHS = [
  "januar",
  "februar",
  "mars",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "desember",
];

/** ISO 8601-ukenummer. */
export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** F.eks. "7.–13. september" (evt. "28. sep.–4. okt." hvis uken krysser en måned). */
export function formatWeekDateRangeLabel(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  if (sameMonth) {
    return `${weekStart.getDate()}.–${weekEnd.getDate()}. ${NORWEGIAN_MONTHS[weekStart.getMonth()]}`;
  }
  return `${weekStart.getDate()}. ${NORWEGIAN_MONTHS[weekStart.getMonth()]}–${weekEnd.getDate()}. ${NORWEGIAN_MONTHS[weekEnd.getMonth()]}`;
}

export function isSameDate(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}
