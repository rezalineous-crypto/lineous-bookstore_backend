# CLC Resource Integration — Customer Frontend Changes

---

## 1. Dynamic Navigation Menu

### 1.1 Menu Data Source

The navbar no longer uses hardcoded routes. Instead, it fetches menu data from the backend:

```
GET /categories/menu
```

This returns only non-hidden categories, ordered by `displayOrder`, with nested children.

### 1.2 Menu Structure

The navbar now renders dynamically from the API response. The menu endpoint returns **category hierarchy only** (categories and their sub-categories), not publication or subject data:

```
Home
├── Topical Past Papers (route: /topical-past-papers)
│   ├── AS & A-Level
│   ├── Cambridge IGCSE
│   └── GCE O-Level
├── Year-wise Past Papers (route: /year-wise-past-papers)
│   └── ...
├── Mock Papers (route: /mock-papers)
│   └── ...
├── My Account
└── Contact
```

Hidden categories (Text Books, Notes, etc.) do NOT appear in the menu.

**Important:** The menu shows category hierarchy only. Publication and subject data are fetched separately when the user clicks into a category (see Section 2). The menu does not need to return publication/subject data — it only needs category name, slug, route, icon, and children.

### 1.3 Menu Behavior

- **Desktop:** Dropdown menus showing publication > subject hierarchy (the menu returns categories; publication/subject data is fetched separately when the user clicks into a category)
- **Mobile:** Collapsible accordion menu
- **Active state:** Highlight current category in the menu
- **Icons:** Display category icon if provided

---

## 2. Category-Based Book Browsing

### 2.1 Category Pages

When a user clicks a menu item (e.g., "Topical Past Papers"), they navigate to a category page that:

- Displays the category name and description
- Shows books filtered by that category
- Books are grouped by publication > subject

### 2.2 Book Grid / List

Books are displayed with:
- Thumbnail
- Title
- Publication name
- Subject name
- Price range (from paper variants)
- Add to cart button

### 2.3 Breadcrumbs

Show the full path: `Home > Topical Past Papers > Cambridge > PHYSICS (9702)`

---

## 3. Book Detail Page

### 3.1 Category Context

The book detail page shows:
- Which category the book belongs to (breadcrumb)
- Related books in the same category
- Other categories the book belongs to (if multiple)

### 3.2 Paper Selection

Users select which paper variant to purchase:
- Paper 1, Paper 2, Paper 4, etc.
- Each with its own price, discount, and stock status

---

## 4. Shopping Cart

### 4.1 Cart Display

Each cart item shows:
- Book title
- Selected paper variant
- Category the book belongs to (the one captured at add-to-cart time)
- Quantity and price

### 4.2 Category Context

The cart may optionally group items by category for clarity.

### 4.3 Sending Category on Add to Cart

When the user clicks "Add to cart" from a category page, the frontend must send the current category's `id` (or `slug`) as the `categoryId` parameter in the `POST /cart/add` request. This is required — without it, the cart cannot preserve which category the user was browsing, and the order created at checkout would lose that context.

If the user adds the same book from two different categories, two separate cart line items are created (the backend matches on `bookId + paperId + categoryId`), so the browsing context is preserved for each.

---

## 5. Order History

### 5.1 Filter by Category

Users can filter their order history:

```
[All Categories] [Topical Past Papers] [Mock Papers] [Year-wise Past Papers] ...
```

### 5.2 Order Detail

Each order item shows which category the purchase was made under, preserving historical context. The category shown is the one captured at add-to-cart time (`CartItem.categoryId` → copied to `OrderItem.categoryId` at checkout), not derived from the book's current category assignments.

---

## 6. Responsive Design

### 6.1 Desktop

- Full dropdown navigation menu
- Sidebar filter for publications and subjects within a category
- Desktop-optimized book grid

### 6.2 Tablet

- Hamburger menu with slide-out drawer
- Tablet-optimized book grid (2-3 columns)

### 6.3 Mobile

- Collapsible accordion menu
- Bottom navigation bar for key categories
- Single-column book list
- Swipe-to-reveal cart actions

---

## 7. Search

### 7.1 Search Results

Search results now include category context:
- Show which category each result belongs to
- Allow filtering search results by category

### 7.2 Advanced Search

Users can filter by:
- Category
- Publication
- Subject

---

## 8. Summary of Frontend Changes

| Area | What Changes |
|------|-------------|
| Navbar | Dynamic menu from API, no hardcoded routes |
| Category Pages | Filter books by category, group by hierarchy |
| Book Detail | Category breadcrumb, related books |
| Cart | Category context per item |
| Order History | Filter by category |
| Search | Category filter and context |
| Responsive | New menu patterns for mobile/tablet |

---

## 9. API Reference: Endpoints and Request Bodies

All base URL is the API root (e.g. `http://localhost:3000`). Authenticated endpoints require an `Authorization: Bearer <jwt>` header.

### Navigation Menu

**`GET /categories/menu`** · `OptionalJwtAuthToken` (no auth required, but JWT is attached if present)
No request body. Returns only non-hidden categories ordered by `displayOrder`, with nested `children`. Admins see all categories (including hidden).
```json
{
  "data": [
    {
      "id": "cat-uuid",
      "name": "Topical Past Papers",
      "slug": "topical-past-papers",
      "isHidden": false,
      "displayOrder": 1,
      "icon": "file-text",
      "route": "/topical-past-papers",
      "parentId": null,
      "children": [ { "id": "...", "name": "...", ... } ]
    }
  ]
}
```

### Category-Based Book Browsing

**`GET /books`** · `OptionalJwtAuthToken` + `RolesGuard`
Query params (both optional):
- `?subjectId=<uuid>` — filter by subject
- `?categoryId=<uuid>` — filter by category (the new field)
Public users see `PUBLISHED` books only; admins see all.
```json
{ "data": [ { "id": "...", "title": "...", "publication": {...}, "subject": {...}, "categories": [...], "papers": [...] } ] }
```

**`GET /books/tree`** · Public
Query param: `?categoryId=<uuid>` (optional). Returns `publication > subject > books` filtered by category.
```json
{ "data": [ { "publication": {...}, "subjects": [ { "subject": {...}, "books": [...] } ] } ] }
```

**`GET /books/:id`** · `OptionalJwtAuthToken` + `RolesGuard`
Returns the book with its `categories` array (for breadcrumb and "other categories" display).

### Shopping Cart

**`POST /cart`** · `JwtAuthToken` (authenticated)
```json
{ "bookId": "book-uuid", "paperId": "paper-uuid", "categoryId": "cat-uuid", "quantity": 2 }
```
Required: `bookId`, `quantity`. Optional: `paperId`, **`categoryId`**.
`categoryId` is mandatory from the category page — without it the browsing context is lost. Duplicate matching is `bookId + paperId + categoryId`, so the same book added from two categories becomes two separate line items.

**`GET /cart`** · `JwtAuthToken` — returns cart items including each item's `categoryId` (and the category's name via include).
**`PATCH /cart/items/:id`** · body `{ "quantity": 3 }`
**`DELETE /cart/items/:id`**
**`DELETE /cart`** — clear cart

### Order History

**`GET /orders`** · `JwtAuthToken`
Query param: `?categoryId=<uuid>` (optional) — filters orders by `orderItems.some { categoryId }`. Users see their own orders; admins see all.
```json
{ "data": [ { "id": "...", "orderItems": [ { "bookId": "...", "bookTitle": "...", "categoryId": "cat-uuid", "subtotal": ... } ] } ] }
```

**`GET /orders/:id`** · `JwtAuthToken` — returns the order with `orderItems`, each carrying its `categoryId` (the category captured at add-to-cart time, not derived from the book's current categories).

**`POST /orders`** · `JwtAuthToken` — create order from cart. Body: `{ "address": {...}, "paymentMethod": "CARD", "discount": 0, "shipping": 0 }`. `OrderItem.categoryId` is copied automatically from each `CartItem.categoryId`; the frontend sends nothing extra.
**`POST /orders/test`** · `JwtAuthToken` — test order. Body:
```json
{
  "address": { "name": "...", "phone": "...", "addressLine1": "...", "city": "...", "region": "...", "postalCode": "..." },
  "items": [ { "bookId": "book-uuid", "paperId": "paper-uuid", "categoryId": "cat-uuid", "quantity": 1 } ]
}
```
Each item's `categoryId` flows `TestOrderItem.categoryId` → `CartItem.categoryId` → `OrderItem.categoryId`.
**`PATCH /orders/:id/status`** · Admin only · `{ "status": "SHIPPED" }`
**`PATCH /orders/:id/shipping`** · Admin only · `{ "shipping": 250 }`

### Search

Search endpoints (if any) should accept a `?categoryId=` filter. If the existing search endpoint does not yet support it, filter client-side against the `categories` array returned on each book.