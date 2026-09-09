/**
 * Isolert adapter mot Tjek/etilbudsavis-APIet (samme datagrunnlag som driver
 * etilbudsavis.no og Mattilbud-appen).
 *
 * VIKTIG: Dette er en UOFFISIELL, ikke-dokumentert API. Den kan endre
 * skjema, rate-begrense hardere, eller slutte å svare uten varsel. Derfor:
 *  - All kontakt med kilden skjer KUN i denne filen (+ dealers.ts/types.ts).
 *    Resten av appen forholder seg til NormalizedOffer og
 *    OfferFetchResult — aldri til rå Tjek-respons.
 *  - Funksjonen kaster ALDRI ved nettverks-/parse-feil. Feil for én kjede
 *    logges og rapporteres i returverdien (chainsFailed); henting fortsetter
 *    for de andre kjedene.
 *  - Kilder brukt til å verifisere endepunkt/dealer-IDer under bygging (se
 *    README): github.com/olgasafonova/tilbudstrolden-mcp (MCP-server som
 *    bruker samme API) og github.com/elvios/discount-getter.
 *
 * Endepunkt: https://api.etilbudsavis.dk/v2/offers?dealer_ids=<id>&limit=..&offset=..
 * Ingen autentisering er nødvendig. Parameternavnet `dealer_ids` er ikke
 * offisielt dokumentert — verifiser mot /v2/dealers?country_id=NO hvis
 * henting slutter å gi treff for en kjede.
 */

import type { Chain } from "@prisma/client";
import { DEALER_IDS, chainsWithKnownDealerId } from "./dealers";
import type { NormalizedOffer, OfferFetchResult } from "./types";
import { logger } from "../logger";

const API_BASE = "https://api.etilbudsavis.dk/v2";
const PAGE_SIZE = 100;
const MAX_PAGES_PER_CHAIN = 5; // hard cap: maks 500 tilbud per kjede per henting
const FETCH_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;
const USER_AGENT = "middagsplan-app/1.0 (husholdningsverktoy, privat bruk)";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string): Promise<unknown[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (res.ok) {
        const body = (await res.json()) as unknown;
        return Array.isArray(body) ? body : [];
      }

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) {
        throw new Error(`API-kall feilet (status ${res.status})`);
      }
      lastError = new Error(`API-kall feilet (status ${res.status})`);
    } catch (err) {
      lastError = err;
    }

    if (attempt < MAX_ATTEMPTS - 1) {
      await sleep(RETRY_BASE_MS * 2 ** attempt);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("API-kall feilet etter flere forsøk");
}

function pickString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return null;
}

function pickNumber(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function pickDate(...vals: unknown[]): Date | null {
  for (const v of vals) {
    if (typeof v === "string") {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

/** Normaliserer ett rått offer-objekt fra Tjek-APIet defensivt. */
function normalizeOffer(chain: Chain, raw: unknown): NormalizedOffer | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const id = pickString(r.id, r.ean, r.offer_id);
  const productName = pickString(r.heading, r.name, r.title);
  if (!id || !productName) return null; // ikke nok data til å bruke tilbudet

  const pricing = (r.pricing ?? {}) as Record<string, unknown>;
  const dealer = (r.dealer ?? {}) as Record<string, unknown>;
  const branding = (r.branding ?? {}) as Record<string, unknown>;

  return {
    externalId: id,
    chain,
    storeName:
      pickString(branding.name, dealer.name, r.store_name) ??
      chain.replace(/_/g, " "),
    productName,
    description: pickString(r.description),
    price: pickNumber(pricing.price, r.price),
    prePrice: pickNumber(pricing.pre_price, r.prePrice, r.pre_price),
    currency: pickString(pricing.currency, r.currency) ?? "NOK",
    validFrom: pickDate(r.run_from, r.runFrom),
    validTo: pickDate(r.run_till, r.runTill, r.run_to),
    sourceRaw: raw,
  };
}

async function fetchOffersForChain(chain: Chain): Promise<NormalizedOffer[]> {
  const dealerId = DEALER_IDS[chain];
  if (!dealerId) {
    throw new Error(`Ingen kjent dealer-ID for ${chain} — hopper over`);
  }

  const offers: NormalizedOffer[] = [];
  for (let page = 0; page < MAX_PAGES_PER_CHAIN; page++) {
    const offset = page * PAGE_SIZE;
    const url = `${API_BASE}/offers?dealer_ids=${encodeURIComponent(dealerId)}&limit=${PAGE_SIZE}&offset=${offset}`;
    const raw = await fetchWithRetry(url);
    if (raw.length === 0) break;

    for (const item of raw) {
      const normalized = normalizeOffer(chain, item);
      if (normalized) offers.push(normalized);
    }

    if (raw.length < PAGE_SIZE) break; // siste side
  }
  return offers;
}

/**
 * Henter ukens tilbud for de gitte kjedene (default: alle med kjent
 * dealer-ID blant de prioriterte kjedene). Kaster aldri — feil per kjede
 * rapporteres i `chainsFailed`, og logges via lib/logger.
 */
export async function fetchWeeklyOffers(
  chains: Chain[] = chainsWithKnownDealerId(),
): Promise<OfferFetchResult> {
  const offers: NormalizedOffer[] = [];
  const chainsOk: Chain[] = [];
  const chainsFailed: { chain: Chain; error: string }[] = [];

  for (const chain of chains) {
    try {
      const chainOffers = await fetchOffersForChain(chain);
      offers.push(...chainOffers);
      chainsOk.push(chain);
      logger.info("Hentet tilbud for kjede", { chain, count: chainOffers.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      chainsFailed.push({ chain, error: message });
      logger.error("Klarte ikke hente tilbud for kjede", { chain, error: message });
    }
  }

  return { offers, chainsOk, chainsFailed };
}
