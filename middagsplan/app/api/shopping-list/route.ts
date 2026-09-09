import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const items = await prisma.shoppingItem.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  const text = body?.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Mangler tekst" }, { status: 400 });
  }
  const item = await prisma.shoppingItem.create({ data: { text } });
  return NextResponse.json({ item }, { status: 201 });
}
