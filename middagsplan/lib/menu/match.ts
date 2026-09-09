import type { Offer, Recipe, RecipeIngredient } from "@prisma/client";

export interface RecipeWithIngredients extends Recipe {
  ingredients: RecipeIngredient[];
}

export interface RecipeOfferMatch {
  offer: Offer;
  matchedKeyword: string;
}

function discountFraction(offer: Offer): number {
  if (offer.price == null || offer.prePrice == null || offer.prePrice <= 0) return 0;
  return Math.max(0, (offer.prePrice - offer.price) / offer.prePrice);
}

/**
 * Finner det beste aktive tilbudet som matcher en retts hovedingrediens(er)
 * (nøkkelord). Matching er en enkel case-insensitiv substring-sjekk mot
 * tilbudets produktnavn — bevisst enkelt fremfor en tung
 * ingrediens-taksonomi, siden dette skal være lett å forstå og feilsøke.
 * Ved flere treff velges tilbudet med størst rabatt.
 */
export function findBestOfferMatch(
  recipe: RecipeWithIngredients,
  activeOffers: Offer[],
): RecipeOfferMatch | null {
  let best: RecipeOfferMatch | null = null;

  for (const ingredient of recipe.ingredients) {
    const keyword = ingredient.keyword.toLowerCase();
    for (const offer of activeOffers) {
      if (!offer.productName.toLowerCase().includes(keyword)) continue;
      if (!best || discountFraction(offer) > discountFraction(best.offer)) {
        best = { offer, matchedKeyword: ingredient.keyword };
      }
    }
  }

  return best;
}
