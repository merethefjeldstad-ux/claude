import { prisma } from "../db";
import { getWeekStart, formatNorwegianDate, formatWeekDateRangeLabel, getISOWeekNumber, isSameDate } from "../date";
import { TIME_CATEGORY_LABEL } from "../time-category";

export interface MenuDayView {
  dayIndex: number;
  day: string;
  date: string;
  dish: string;
  timeCategory: string;
  timeLabel: string;
  availableMinutesLabel: string;
  hasOffer: boolean;
  offerLabel: string | null;
  store: string | null;
  isFallback: boolean;
  isToday: boolean;
  wasRebalanced: boolean;
}

export interface WeeklyMenuView {
  weekLabel: string;
  dateRangeLabel: string;
  days: MenuDayView[];
}

const NORWEGIAN_WEEKDAYS = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
];

const CHAIN_DISPLAY: Record<string, string> = {
  REMA_1000: "Rema 1000",
  KIWI: "Kiwi",
  MENY: "Meny",
  SPAR: "Spar",
  COOP_PRIX: "Coop Prix",
  COOP_MEGA: "Coop Mega",
  COOP_EXTRA: "Coop Extra",
  COOP_OBS: "Coop Obs",
  UKJENT: "Ukjent kjede",
};

function formatMinutes(minutes: number): string {
  return `${minutes} min`;
}

/** Henter og formaterer inneværende ukes meny for UI-et. Null hvis ikke generert ennå. */
export async function getWeeklyMenuView(referenceDate: Date = new Date()): Promise<WeeklyMenuView | null> {
  const weekStart = getWeekStart(referenceDate);
  const menu = await prisma.weeklyMenu.findUnique({
    where: { weekStart },
    include: {
      days: {
        include: { assignment: { include: { recipe: true, offer: true } } },
        orderBy: { dayIndex: "asc" },
      },
    },
  });

  if (!menu) return null;

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  return {
    weekLabel: `Uke ${getISOWeekNumber(weekStart)}`,
    dateRangeLabel: formatWeekDateRangeLabel(weekStart),
    days: menu.days.map((d) => ({
      dayIndex: d.dayIndex,
      day: NORWEGIAN_WEEKDAYS[d.dayIndex],
      date: formatNorwegianDate(d.date),
      dish: d.assignment.recipe.name,
      timeCategory: d.timeCategory,
      timeLabel: TIME_CATEGORY_LABEL[d.timeCategory],
      availableMinutesLabel: formatMinutes(d.availableMinutes),
      hasOffer: !d.assignment.isFallback && !!d.assignment.offer,
      offerLabel: d.assignment.offer?.productName ?? null,
      store: d.assignment.offer ? CHAIN_DISPLAY[d.assignment.offer.chain] : null,
      isFallback: d.assignment.isFallback,
      isToday: isSameDate(d.date, today),
      wasRebalanced: d.wasRebalanced,
    })),
  };
}
