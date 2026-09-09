import type { Chain } from "@prisma/client";

/**
 * Dealer-IDer i Tjek/etilbudsavis-APIet (api.etilbudsavis.dk/v2) for norske
 * kjeder. Disse er reverse-engineerede/uoffisielle og kan endre seg — se
 * README for kilder og hvordan man verifiserer/oppdaterer dem via
 * GET /v2/dealers?country_id=NO.
 *
 * "Coop Mega" har vi ikke funnet en bekreftet dealer-ID for ennå (se README).
 * Den står derfor uten id og hoppes over ved henting til den er fylt inn.
 */
export const DEALER_IDS: Partial<Record<Chain, string>> = {
  REMA_1000: "faa0Ym",
  KIWI: "257bxm",
  MENY: "4333pm",
  SPAR: "c062vm",
  COOP_PRIX: "f5d5lm",
  COOP_EXTRA: "80742m",
  COOP_OBS: "51dawm",
  // COOP_MEGA: ikke verifisert ennå — legg inn id her når den er funnet.
};

/** Kjedene fase 1 skal prioritere, i den rekkefølgen de er nevnt i kravet. */
export const PRIORITY_CHAINS: Chain[] = [
  "REMA_1000",
  "KIWI",
  "MENY",
  "SPAR",
  "COOP_PRIX",
  "COOP_MEGA",
  "COOP_EXTRA",
  "COOP_OBS",
];

export const CHAIN_DISPLAY_NAME: Record<Chain, string> = {
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

export function chainsWithKnownDealerId(): Chain[] {
  return PRIORITY_CHAINS.filter((c) => DEALER_IDS[c]);
}
