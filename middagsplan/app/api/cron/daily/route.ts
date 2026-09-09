import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { rebalanceWeek } from "@/lib/menu/rebalance";
import { logger } from "@/lib/logger";

/**
 * Kalles hver dag kl. 22:00 norsk tid av scripts/scheduler.ts: sjekk om
 * kalenderen er endret, og bytt om på dagene i den allerede valgte
 * ukesmenyen ved behov.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }

  try {
    const result = await rebalanceWeek();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("Daglig ombalansering feilet", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, error: "Intern feil" }, { status: 500 });
  }
}
