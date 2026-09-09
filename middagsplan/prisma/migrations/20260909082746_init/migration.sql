-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "googleAccountId" TEXT NOT NULL,
    "refreshToken" TEXT,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "timeCategory" TEXT NOT NULL,
    "note" TEXT,
    "flexible" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL,
    "prePrice" REAL,
    "currency" TEXT NOT NULL DEFAULT 'NOK',
    "validFrom" DATETIME,
    "validTo" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceRaw" TEXT
);

-- CreateTable
CREATE TABLE "OfferFetchLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "chainsOk" TEXT,
    "chainsFailed" TEXT,
    "errorMessage" TEXT
);

-- CreateTable
CREATE TABLE "WeeklyMenu" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekStart" DATETIME NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MenuDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "timeCategory" TEXT NOT NULL,
    "availableMinutes" INTEGER NOT NULL,
    "wasRebalanced" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "MenuDay_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "WeeklyMenu" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MenuDay_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "MenuAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MenuAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "offerId" TEXT,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "MenuAssignment_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MenuAssignment_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShoppingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "addedBy" TEXT,
    "recipeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TimeBudgetConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "eveningStart" TEXT NOT NULL DEFAULT '16:00',
    "eveningEnd" TEXT NOT NULL DEFAULT '21:00',
    "kjaptMaxMinutes" INTEGER NOT NULL DEFAULT 30,
    "middelsMaxMinutes" INTEGER NOT NULL DEFAULT 60
);

-- CreateTable
CREATE TABLE "StoreSelectionConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "trumfPriceThreshold" REAL NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleAccountId_key" ON "User"("googleAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_name_key" ON "Recipe"("name");

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_idx" ON "RecipeIngredient"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_externalId_key" ON "Offer"("externalId");

-- CreateIndex
CREATE INDEX "Offer_chain_idx" ON "Offer"("chain");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyMenu_weekStart_key" ON "WeeklyMenu"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "MenuDay_weekId_dayIndex_key" ON "MenuDay"("weekId", "dayIndex");
