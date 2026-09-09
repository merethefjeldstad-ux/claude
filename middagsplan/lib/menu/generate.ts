import type { TimeCategory } from "@prisma/client";
import { prisma } from "../db";
import { getActiveOffers } from "../offers/refresh";
import { fetchCalendarEvents } from "../calendar/google";
import {
  computeDayTimeBudget,
  DEFAULT_TIME_BUDGET_CONFIG,
  type CalendarEvent,
  type TimeBudgetConfig,
} from "../calendar/time-budget";
import { fitsTimeBudget } from "../time-category";
import { findBestOfferMatch, type RecipeWithIngredients } from "./match";
import { addDays, getWeekStart } from "../date";
import { logger } from "../logger";

async function loadTimeBudgetConfig(): Promise<TimeBudgetConfig> {
  const row = await prisma.timeBudgetConfig.findUnique({ where: { id: 1 } });
  return row ?? DEFAULT_TIME_BUDGET_CONFIG;
}

/** Henter kalenderhendelser for hele uken for begge brukere (én liste per bruker). */
async function loadUserEventListsForWeek(
  weekStart: Date,
): Promise<CalendarEvent[][]> {
  const users = await prisma.user.findMany({ where: { refreshToken: { not: null } } });
  const weekEnd = addDays(weekStart, 7);

  if (users.length === 0) {
    logger.warn("Ingen brukere med kalendertilgang ennå — bruker full ledig tid som standard");
    return [[]]; // "virtuell bruker" uten avtaler -> hele vinduet ledig
  }

  const lists: CalendarEvent[][] = [];
  for (const user of users) {
    if (!user.refreshToken) continue;
    const events = await fetchCalendarEvents(
      user.refreshToken,
      user.calendarId,
      weekStart,
      weekEnd,
    );
    lists.push(events);
  }
  return lists;
}

function eventsOnDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  return events.filter((e) => e.start.toDateString() === date.toDateString());
}

/**
 * Genererer ukesmenyen for uken som starter på `referenceDate` (mandag
 * beregnes automatisk). Kjøres av mandagsjobben (10:00), men kan også
 * trigges manuelt.
 *
 * For hver dag: velg en rett der hovedingrediensen matcher et aktivt tilbud
 * OG tidsbruken passer dagens ledige tid. Ingen tilbudsmatchende rett passer
 * -> fallback til en favorittrett uten tilbud (markert tydelig).
 */
export async function generateWeeklyMenu(referenceDate: Date = new Date()) {
  const weekStart = getWeekStart(referenceDate);
  const config = await loadTimeBudgetConfig();
  const activeOffers = await getActiveOffers();
  const recipes = (await prisma.recipe.findMany({
    include: { ingredients: true },
    orderBy: { lastUsedAt: "asc" }, // minst nylig brukt først -> variasjon
  })) as RecipeWithIngredients[];

  const userEventLists = await loadUserEventListsForWeek(weekStart);

  const usedRecipeIds = new Set<string>();
  const dayPlans: {
    dayIndex: number;
    date: Date;
    timeCategory: TimeCategory;
    availableMinutes: number;
    recipeId: string;
    offerId: string | null;
    isFallback: boolean;
  }[] = [];

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const date = addDays(weekStart, dayIndex);
    const { availableMinutes, timeCategory } = computeDayTimeBudget(
      userEventLists.map((events) => eventsOnDate(events, date)),
      date,
      config,
    );

    const eligible = recipes.filter(
      (r) => !usedRecipeIds.has(r.id) && fitsTimeBudget(r.timeCategory, timeCategory),
    );

    let chosenRecipe: RecipeWithIngredients | null = null;
    let offerId: string | null = null;
    let isFallback = false;

    for (const recipe of eligible) {
      const match = findBestOfferMatch(recipe, activeOffers);
      if (match) {
        chosenRecipe = recipe;
        offerId = match.offer.id;
        break;
      }
    }

    if (!chosenRecipe) {
      // Fallback: favorittrett uten tilbud, men som passer tidsbudsjettet.
      chosenRecipe = eligible[0] ?? recipes.find((r) => !usedRecipeIds.has(r.id)) ?? recipes[0];
      isFallback = true;
      offerId = null;
    }

    usedRecipeIds.add(chosenRecipe.id);
    dayPlans.push({
      dayIndex,
      date,
      timeCategory,
      availableMinutes,
      recipeId: chosenRecipe.id,
      offerId,
      isFallback,
    });
  }

  const weeklyMenu = await prisma.$transaction(async (tx) => {
    await tx.weeklyMenu.deleteMany({ where: { weekStart } }); // regenerering: erstatt evt. eksisterende

    const menu = await tx.weeklyMenu.create({ data: { weekStart } });

    for (const plan of dayPlans) {
      const assignment = await tx.menuAssignment.create({
        data: {
          recipeId: plan.recipeId,
          offerId: plan.offerId,
          isFallback: plan.isFallback,
        },
      });
      await tx.menuDay.create({
        data: {
          weekId: menu.id,
          date: plan.date,
          dayIndex: plan.dayIndex,
          assignmentId: assignment.id,
          timeCategory: plan.timeCategory,
          availableMinutes: plan.availableMinutes,
        },
      });
      await tx.recipe.update({
        where: { id: plan.recipeId },
        data: { lastUsedAt: new Date() },
      });
    }

    return menu;
  });

  logger.info("Genererte ny ukesmeny", { weekStart, weeklyMenuId: weeklyMenu.id });
  return weeklyMenu.id;
}
