import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { refreshOffers } from "@/lib/offers/refresh";
import { generateWeeklyMenu } from "@/lib/menu/generate";
import { logger } from "@/lib/logger";

/**
 * Kalles hver mandag kl. 10:00 norsk tid av scripts/scheduler.ts: hent
 * ukens tilbud, les kalenderen for uken, generer ny meny.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }

  try {
    const offerResult = await refreshOffers();
    const weeklyMenuId = await generateWeeklyMenu();
    return NextResponse.json({ ok: true, offerResult, weeklyMenuId });
  } catch (err) {
    logger.error("Mandagsjobb (hent tilbud + generer meny) feilet", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, error: "Intern feil" }, { status: 500 });
  }
}
