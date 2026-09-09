import { prisma } from "../db";
import { logger } from "../logger";
import { fetchWeeklyOffers } from "./tjek-adapter";
import { CHAIN_DISPLAY_NAME } from "./dealers";

/**
 * Henter ukens tilbud via adapteren, lagrer dem, og skriver en
 * OfferFetchLog-rad (fungerer som "varsel" — sjekkes i UI/README ved behov).
 * Feiler aldri hardt: hvis ALLE kjeder feiler, beholdes forrige ukes tilbud
 * i databasen (bedre med gamle tilbud enn ingen), og feilen logges.
 */
export async function refreshOffers(): Promise<{ success: boolean; savedCount: number }> {
  const startedAt = new Date();
  const result = await fetchWeeklyOffers();

  let savedCount = 0;
  for (const offer of result.offers) {
    await prisma.offer.upsert({
      where: { externalId: offer.externalId },
      create: {
        externalId: offer.externalId,
        chain: offer.chain,
        storeName: offer.storeName,
        productName: offer.productName,
        description: offer.description,
        price: offer.price,
        prePrice: offer.prePrice,
        currency: offer.currency,
        validFrom: offer.validFrom,
        validTo: offer.validTo,
        sourceRaw: offer.sourceRaw ? JSON.stringify(offer.sourceRaw) : null,
      },
      update: {
        storeName: offer.storeName,
        productName: offer.productName,
        description: offer.description,
        price: offer.price,
        prePrice: offer.prePrice,
        currency: offer.currency,
        validFrom: offer.validFrom,
        validTo: offer.validTo,
        sourceRaw: offer.sourceRaw ? JSON.stringify(offer.sourceRaw) : null,
        fetchedAt: new Date(),
      },
    });
    savedCount++;
  }

  const success = result.chainsFailed.length === 0 && result.chainsOk.length > 0;

  await prisma.offerFetchLog.create({
    data: {
      startedAt,
      finishedAt: new Date(),
      success,
      chainsOk: result.chainsOk.map((c) => CHAIN_DISPLAY_NAME[c]).join(", "),
      chainsFailed: result.chainsFailed
        .map((f) => `${CHAIN_DISPLAY_NAME[f.chain]}: ${f.error}`)
        .join(" | "),
      errorMessage:
        result.chainsOk.length === 0
          ? "Ingen kjeder svarte — beholder forrige henting av tilbud."
          : null,
    },
  });

  if (result.chainsOk.length === 0) {
    logger.error("Tilbudshenting feilet fullstendig for alle kjeder", {
      failed: result.chainsFailed,
    });
  }

  return { success, savedCount };
}

/** Aktive tilbud (innenfor gyldighetsperiode, eller uten oppgitt periode). */
export async function getActiveOffers() {
  const now = new Date();
  return prisma.offer.findMany({
    where: {
      OR: [
        { validTo: null },
        { validTo: { gte: now } },
      ],
    },
  });
}
