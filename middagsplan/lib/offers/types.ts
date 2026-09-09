import type { Chain } from "@prisma/client";

/** Én normalisert tilbudslinje, uavhengig av kildens rå format. */
export interface NormalizedOffer {
  externalId: string;
  chain: Chain;
  storeName: string;
  productName: string;
  description: string | null;
  price: number | null;
  prePrice: number | null;
  currency: string;
  validFrom: Date | null;
  validTo: Date | null;
  sourceRaw: unknown;
}

export interface OfferFetchResult {
  offers: NormalizedOffer[];
  chainsOk: Chain[];
  chainsFailed: { chain: Chain; error: string }[];
}
