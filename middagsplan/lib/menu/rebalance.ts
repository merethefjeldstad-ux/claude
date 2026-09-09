import { prisma } from "../db";
import { fetchCalendarEvents } from "../calendar/google";
import {
  computeDayTimeBudget,
  DEFAULT_TIME_BUDGET_CONFIG,
  type CalendarEvent,
} from "../calendar/time-budget";
import { TIME_CATEGORY_RANK, fitsTimeBudget } from "../time-category";
import { addDays, getWeekStart } from "../date";
import { logger } from "../logger";

/**
 * Daglig sjekk (22:00): les kalenderen på nytt for resten av uken. Hvis en
 * dags tidsbudsjett ikke lenger stemmer med den tildelte retten, bytt om
 * hvilke dager som får hvilke retter BLANT DE ALLEREDE VALGTE rettene for
 * uken — henter aldri inn en ny rett (den er ikke sjekket mot ukens tilbud).
 *
 * Kun dagens dato og fremover justeres; allerede passerte dager i uken
 * røres ikke.
 */
export async function rebalanceWeek(referenceDate: Date = new Date()) {
  const weekStart = getWeekStart(referenceDate);
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  const menu = await prisma.weeklyMenu.findUnique({
    where: { weekStart },
    include: {
      days: {
        include: { assignment: { include: { recipe: true } } },
        orderBy: { dayIndex: "asc" },
      },
    },
  });

  if (!menu) {
    logger.warn("Ingen ukesmeny funnet å ombalansere", { weekStart });
    return { adjustedDays: 0 };
  }

  const futureDays = menu.days.filter((d) => d.date.getTime() >= today.getTime());
  if (futureDays.length === 0) {
    return { adjustedDays: 0 };
  }

  const config = await prisma.timeBudgetConfig
    .findUnique({ where: { id: 1 } })
    .then((row) => row ?? DEFAULT_TIME_BUDGET_CONFIG);

  const users = await prisma.user.findMany({ where: { refreshToken: { not: null } } });
  const weekEnd = addDays(weekStart, 7);
  const userEventLists: CalendarEvent[][] =
    users.length > 0
      ? await Promise.all(
          users.map((u) =>
            fetchCalendarEvents(u.refreshToken as string, u.calendarId, weekStart, weekEnd),
          ),
        )
      : [[]];

  // 1. Regn ut oppdatert tidsbudsjett for hver fremtidig dag.
  const recomputed = futureDays.map((day) => {
    const eventsForDay = userEventLists.map((events) =>
      events.filter((e) => e.start.toDateString() === day.date.toDateString()),
    );
    const budget = computeDayTimeBudget(eventsForDay, day.date, config);
    return { day, ...budget };
  });

  const anyMismatch = recomputed.some(
    (r) => !fitsTimeBudget(r.day.assignment.recipe.timeCategory, r.timeCategory),
  );

  if (!anyMismatch) {
    // Ingenting endret nok til å kreve ombytting — men oppdater like fullt
    // lagrede budsjett-tall hvis kalenderen har endret seg litt.
    for (const r of recomputed) {
      if (
        r.timeCategory !== r.day.timeCategory ||
        r.availableMinutes !== r.day.availableMinutes
      ) {
        await prisma.menuDay.update({
          where: { id: r.day.id },
          data: { timeCategory: r.timeCategory, availableMinutes: r.availableMinutes },
        });
      }
    }
    return { adjustedDays: 0 };
  }

  // 2. Bytt om assignments blant de fremtidige dagene (grådig: mest
  //    tidsbegrensede dager får først velge blant de gjenværende rettene).
  const pool = recomputed.map((r) => r.day.assignment);
  const order = [...recomputed].sort(
    (a, b) => TIME_CATEGORY_RANK[a.timeCategory] - TIME_CATEGORY_RANK[b.timeCategory],
  );

  const remaining = [...pool];
  const newAssignmentForDay = new Map<string, (typeof pool)[number]>();

  for (const r of order) {
    const dayRank = TIME_CATEGORY_RANK[r.timeCategory];
    // Beste treff: høyest rang som fortsatt er <= dagens rang.
    let bestIdx = -1;
    let bestRank = -1;
    for (let i = 0; i < remaining.length; i++) {
      const rank = TIME_CATEGORY_RANK[remaining[i].recipe.timeCategory];
      if (rank <= dayRank && rank > bestRank) {
        bestRank = rank;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) {
      // Ingen gjenværende rett passer perfekt — velg den minst tidkrevende
      // som best-effort fremfor å hente inn noe nytt.
      let minRank = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const rank = TIME_CATEGORY_RANK[remaining[i].recipe.timeCategory];
        if (rank < minRank) {
          minRank = rank;
          bestIdx = i;
        }
      }
    }
    const [chosen] = remaining.splice(bestIdx, 1);
    newAssignmentForDay.set(r.day.id, chosen);
  }

  let adjustedDays = 0;
  for (const r of recomputed) {
    const newAssignment = newAssignmentForDay.get(r.day.id)!;
    const changed = newAssignment.id !== r.day.assignmentId;
    if (changed) adjustedDays++;
    await prisma.menuDay.update({
      where: { id: r.day.id },
      data: {
        assignmentId: newAssignment.id,
        timeCategory: r.timeCategory,
        availableMinutes: r.availableMinutes,
        wasRebalanced: changed,
      },
    });
  }

  logger.info("Ombalanserte ukesmeny", { weekStart, adjustedDays });
  return { adjustedDays };
}
