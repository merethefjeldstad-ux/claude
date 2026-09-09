import { prisma } from "@/lib/db";
import { ShoppingList } from "@/components/ShoppingList";

export const dynamic = "force-dynamic";

export default async function HandlelistePage() {
  const items = await prisma.shoppingItem.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <ShoppingList
      initialItems={items.map((i) => ({ id: i.id, text: i.text, checked: i.checked }))}
    />
  );
}
