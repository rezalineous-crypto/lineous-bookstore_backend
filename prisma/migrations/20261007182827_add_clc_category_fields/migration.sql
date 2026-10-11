-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "categoryId" TEXT;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "route" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "CartItem_categoryId_idx" ON "CartItem"("categoryId");

-- CreateIndex
CREATE INDEX "Category_isHidden_idx" ON "Category"("isHidden");

-- CreateIndex
CREATE INDEX "Category_displayOrder_idx" ON "Category"("displayOrder");

-- CreateIndex
CREATE INDEX "OrderItem_categoryId_idx" ON "OrderItem"("categoryId");

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
