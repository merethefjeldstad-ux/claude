import { NextResponse } from "next/server";
import { getWeeklyMenuView } from "@/lib/menu/view";

export async function GET() {
  const menu = await getWeeklyMenuView();
  return NextResponse.json({ menu });
}
