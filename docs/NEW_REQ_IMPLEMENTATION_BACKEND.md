# CLC Resource Integration — Backend Changes Only

---

## 1. Prisma Schema (`prisma/schema.prisma`)

### 1.1 Add 4 fields to `Category` model

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `isHidden` | `Boolean` | `false` | Hide category from navbar (e.g., "Text Books", "Notes") |
| `displayOrder` | `Int` | `0` | Sort order in menu |
| `icon` | `String?` | — | Icon name/class for menu item |
| `route` | `String?` | — | URL path for menu item |

Add two indexes:
- `@@index([isHidden])`
- `@@index([displayOrder])`

### 1.2 Two additional model changes: `CartItem` and `OrderItem`

To preserve category context at purchase time (so historical data survives even if categories are later reorganized):

**`CartItem`** — add a `categoryId` field (`String?` + relation to `Category` + index). This captures the exact category the user was browsing when they added the item to the cart. It is required because a book can belong to multiple categories — without it, the browsing context is lost and cannot be reconstructed at checkout.

**`OrderItem`** — add a `categoryId` field (`String?` + relation to `Category` + index). At checkout, copy `categoryId` from the cart item to the order item so the purchase context is permanently recorded.

All other models (`Publication`, `Subject`, `Book`, `BookPaper`, `BookAttachment`, `Order`, `BookCategory`) remain as-is.

---

## 2. DTO Changes

### 2.1 `CreateCategoryDto` — add 4 fields

```
isHidden?: boolean
displayOrder?: number
icon?: string
route?: string
```

### 2.2 `UpdateCategoryDto` — add 4 fields

```
isHidden?: boolean
displayOrder?: number
icon?: string
route?: string
```

### 2.3 `CreateBookDto` — add 1 field

```
categoryIds?: string[]
```

### 2.4 `UpdateBookDto` — add 1 field

```
categoryIds?: string[]
```

### 2.5 `AddToCartDto` — add 1 field

```
categoryId?: string
```

Optional. Lets the frontend tell the backend which category the user was browsing when they clicked "Add to cart". Required for the cart→order flow to preserve browsing context (see 3.11).

---

## 3. Service Changes

### 3.1 `CategoryService.create()` — handle new fields

Accept and persist `isHidden`, `displayOrder`, `icon`, `route`.

### 3.2 `CategoryService.update()` — handle new fields

Accept and update `isHidden`, `displayOrder`, `icon`, `route`.

### 3.3 `CategoryService` — add new method `findMenu()`

Returns visible categories (where `isHidden: false`), ordered by `displayOrder`, with children included. Admin sees all; public sees only non-hidden.

### 3.4 `BookService.create()` — handle category associations

After creating the book, if `categoryIds` is provided, create `BookCategory` records linking the book to each category.

### 3.5 `BookService.update()` — handle category associations

If `categoryIds` is provided, delete all existing `BookCategory` records for the book, then create new ones from the provided list.

### 3.6 `BookService.findAll()` — support `categoryId` filter

Accept optional `categoryId` parameter. When provided, filter books to only those associated with the category via `BookCategory`.

### 3.7 `BookService.getTree()` — support `categoryId` filter

Accept optional `categoryId` parameter. When provided, only include books that belong to that category in the tree output.

### 3.8 `CartService.addToCart()` — store category context

Accept the new `categoryId` field from `AddToCartDto` and persist it on the `CartItem`. When matching an existing item to increment quantity, include `categoryId` in the match so the same book added from two different categories creates two separate line items.

### 3.9 `OrderService.create()` — copy category context to order items

When creating an order from cart items, copy `categoryId` from each `CartItem` onto the corresponding `OrderItem` so the purchase context is permanently recorded even if categories are later reorganized.

### 3.10 `OrderService.testOrder()` — capture category context

Same as above for the test order endpoint — copy `categoryId` from the cart item to the order item.

### 3.10 `OrderService.findAll()` — support `categoryId` filter

Accept optional `categoryId` parameter to filter orders by category (for both customer and admin).

---

## 4. Controller Changes

### 4.1 `CategoryController` — add new endpoint

```
GET /categories/menu
```

Returns menu data for navbar. Public sees only non-hidden categories; admin sees all.

**Implementation note:** This endpoint should use `OptionalJwtAuthToken` (not `JwtAuthToken`) so it works for both authenticated and unauthenticated users. The `findMenu()` method checks the user's role from the request — if role is `ADMIN`, return all categories; otherwise return only `isHidden: false` categories. If no user is authenticated, treat as public (non-hidden only).

### 4.2 `BookController` — add query params

- `GET /books` — add `?categoryId=` query param
- `GET /books/tree` — add `?categoryId=` query param

### 4.3 `OrderController` — add query param

- `GET /orders` — add `?categoryId=` query param (for both customer and admin filtering)

---

## 5. Prisma Migration

Create and run a new migration adding the 4 fields to the `Category` table plus `categoryId` to `CartItem` and `OrderItem`:

```sql
-- Category menu fields
ALTER TABLE "Category" ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Category" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Category" ADD COLUMN "icon" TEXT;
ALTER TABLE "Category" ADD COLUMN "route" TEXT;
CREATE INDEX "Category_isHidden_idx" ON "Category"("isHidden");
CREATE INDEX "Category_displayOrder_idx" ON "Category"("displayOrder");

-- Cart item category context
ALTER TABLE "CartItem" ADD COLUMN "categoryId" TEXT;
CREATE INDEX "CartItem_categoryId_idx" ON "CartItem"("categoryId");

-- Order item category context (preserved at purchase time)
ALTER TABLE "OrderItem" ADD COLUMN "categoryId" TEXT;
CREATE INDEX "OrderItem_categoryId_idx" ON "OrderItem"("categoryId");
```

---

## 6. Seed Data (`prisma/seed.ts`)

Add CLC-specific categories:
- Topical Past Papers
- Year-wise Past Papers
- Mock Papers
- Text Books (set `isHidden: true`)
- Notes (set `isHidden: true`)

Set `displayOrder`, `icon`, and `route` for each.

---

## 7. Summary of Files to Modify

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add 4 fields + 2 indexes to `Category` model; add `categoryId` to `CartItem` and `OrderItem` |
| `src/category/dto/create-category.dto.ts` | Add 4 fields |
| `src/category/dto/update-category.dto.ts` | Add 4 fields |
| `src/book/dto/create-book.dto.ts` | Add `categoryIds` |
| `src/book/dto/update-book.dto.ts` | Add `categoryIds` |
| `src/cart/dto/add-to-cart.dto.ts` | Add `categoryId` |
| `src/category/category.service.ts` | Handle new fields in create/update; add `findMenu()` |
| `src/book/book.service.ts` | Handle categories in create/update; add `categoryId` filter to `findAll()` and `getTree()` |
| `src/cart/cart.service.ts` | Store `categoryId` on `CartItem`; include it in duplicate-item matching |
| `src/order/order.service.ts` | Copy `categoryId` from cart items to order items in create/testOrder; add `categoryId` filter to `findAll()` |
| `src/category/category.controller.ts` | Add `GET /categories/menu` |
| `src/book/book.controller.ts` | Add `categoryId` query param to `GET /books` and `GET /books/tree` |
| `src/order/order.controller.ts` | Add `categoryId` query param to `GET /orders` |
| `prisma/seed.ts` | Add CLC categories |
| `prisma/migrations/` | New migration for Category fields + `CartItem.categoryId` + `OrderItem.categoryId` |

---

## 8. What Does NOT Need to Change

- `Publication`, `Subject`, `Book`, `BookPaper`, `BookAttachment` models
- `Wishlist`, `Receipt`, `Payment` models
- Authentication and authorization
- No breaking changes — all new fields are optional with defaults