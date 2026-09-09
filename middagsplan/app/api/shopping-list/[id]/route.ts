import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = (await request.json().catch(() => null)) as { checked?: boolean } | null;
  if (typeof body?.checked !== "boolean") {
    return NextResponse.json({ error: "Mangler 'checked'" }, { status: 400 });
  }
  const item = await prisma.shoppingItem.update({
    where: { id: params.id },
    data: { checked: body.checked },
  });
  return NextResponse.json({ item });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  await prisma.shoppingItem.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
