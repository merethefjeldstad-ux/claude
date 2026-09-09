import { PrismaClient } from "@prisma/client";
import recipesData from "../data/recipes.json";

const prisma = new PrismaClient();

async function main() {
  for (const r of recipesData as {
    name: string;
    timeCategory: "KJAPT" | "MIDDELS" | "TIDKREVENDE";
    note: string | null;
    flexible: boolean;
    keywords: string[];
  }[]) {
    await prisma.recipe.upsert({
      where: { name: r.name },
      create: {
        name: r.name,
        timeCategory: r.timeCategory,
        note: r.note,
        flexible: r.flexible,
        ingredients: { create: r.keywords.map((keyword) => ({ keyword })) },
      },
      update: {
        timeCategory: r.timeCategory,
        note: r.note,
        flexible: r.flexible,
      },
    });
  }

  await prisma.timeBudgetConfig.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });

  await prisma.storeSelectionConfig.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });

  console.log(`Seedet ${(recipesData as unknown[]).length} retter.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
