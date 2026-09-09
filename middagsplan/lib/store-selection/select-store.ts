import type { Chain, ChainGroup } from "@prisma/client";

/**
 * Butikkvalg-regel (relevant fra fase 2 — full handlekurv-sammenligning
 * krever den aggregerte handlelisten, som ikke bygges i fase 1). Denne
 * pure-funksjonen og datamodellen (StoreSelectionConfig) er klare til bruk,
 * men kalles ikke fra menylogikken i fase 1 — der vises kun hvilken butikk
 * det enkelttilbudet som utløste en rett kom fra.
 *
 * Regel:
 *  1. Rema 1000 er standard.
 *  2. Bytt til NorgesGruppen (Kiwi/Spar/Meny) hvis prisforskjellen for hele
 *     handelen er >= trumfPriceThreshold (Rema vinner ved uavgjort).
 *  3. Coop er lavest prioritert — velges aldri automatisk i denne
 *     sammenligningen, kun relevant hvis et enkelttilbud kommer derfra.
 */

export const CHAIN_GROUP: Record<Chain, ChainGroup> = {
  REMA_1000: "REMA",
  KIWI: "NORGESGRUPPEN",
  MENY: "NORGESGRUPPEN",
  SPAR: "NORGESGRUPPEN",
  COOP_PRIX: "COOP",
  COOP_MEGA: "COOP",
  COOP_EXTRA: "COOP",
  COOP_OBS: "COOP",
  UKJENT: "ANNET",
};

export interface StoreBasketTotals {
  remaTotal: number;
  norgesgruppenTotal: number;
}

export interface StoreSelectionConfig {
  trumfPriceThreshold: number;
}

export type ChosenGroup = "REMA" | "NORGESGRUPPEN";

/**
 * Velger butikkgruppe for en gitt handlekurv. Coop er ikke med i denne
 * sammenligningen (se regel 3 over) — funksjonen svarer kun Rema vs.
 * NorgesGruppen.
 */
export function chooseStoreGroup(
  totals: StoreBasketTotals,
  config: StoreSelectionConfig,
): ChosenGroup {
  // Avrundet til øre for å unngå at flyttallsavrunding i kronebeløp gir
  // feil svar rett på terskelen (f.eks. 500 - 499.99 !== 0.01 i JS).
  const savings =
    Math.round((totals.remaTotal - totals.norgesgruppenTotal) * 100) / 100;
  if (savings > 0 && savings >= config.trumfPriceThreshold) {
    return "NORGESGRUPPEN";
  }
  return "REMA";
}
