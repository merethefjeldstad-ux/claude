/**
 * Klient mot kassal.app (kassal.app/api/docs) — offisiell, dokumentert API.
 * Gratis for ikke-kommersiell bruk (60 kall/min). Brukes til
 * prissammenligning mellom butikker (current_price + prishistorikk).
 *
 * OBS: Kassalapp har IKKE noe tilbuds-/kampanjeendepunkt — bare pris og
 * prishistorikk. Ukens tilbud kommer fra lib/offers (Tjek-adapteren), ikke
 * herfra. Denne klienten er i fase 1 kun forberedt for prissammenligning i
 * lib/store-selection og for fase 2 (kassal.app har også et
 * /shopping-lists-endepunkt som blir nyttig da).
 */

import { logger } from "../logger";

const API_BASE = "https://kassal.app/api/v1";

function apiKey(): string | null {
  return process.env.KASSALAPP_API_KEY || null;
}

export interface KassalappProduct {
  id: number;
  name: string;
  current_price: number | null;
  vendor: string | null;
}

/** Søk etter produkter (for prissammenligning). Returnerer [] ved feil. */
export async function searchProducts(query: string): Promise<KassalappProduct[]> {
  const key = apiKey();
  if (!key) {
    logger.warn("KASSALAPP_API_KEY er ikke satt — hopper over prissøk", { query });
    return [];
  }

  try {
    const res = await fetch(
      `${API_BASE}/products?search=${encodeURIComponent(query)}&size=20`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) {
      logger.warn("Kassalapp-søk feilet", { query, status: res.status });
      return [];
    }
    const body = (await res.json()) as { data?: KassalappProduct[] };
    return body.data ?? [];
  } catch (err) {
    logger.warn("Kassalapp-søk feilet", {
      query,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
