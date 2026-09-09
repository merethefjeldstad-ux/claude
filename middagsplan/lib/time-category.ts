import type { TimeCategory } from "@prisma/client";

/** Lavere rang = raskere. Brukes til å sammenligne "trenger/har tid". */
export const TIME_CATEGORY_RANK: Record<TimeCategory, number> = {
  KJAPT: 0,
  MIDDELS: 1,
  TIDKREVENDE: 2,
};

export const TIME_CATEGORY_LABEL: Record<TimeCategory, string> = {
  KJAPT: "Kjapt",
  MIDDELS: "Middels",
  TIDKREVENDE: "Tidkrevende",
};

/** true hvis en rett med `recipeCategory` tidsbruk passer en dag med `dayCategory` ledig tid. */
export function fitsTimeBudget(
  recipeCategory: TimeCategory,
  dayCategory: TimeCategory,
): boolean {
  return TIME_CATEGORY_RANK[recipeCategory] <= TIME_CATEGORY_RANK[dayCategory];
}
