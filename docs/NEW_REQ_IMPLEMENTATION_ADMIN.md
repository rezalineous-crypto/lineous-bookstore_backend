# CLC Resource Integration — Admin Panel Changes

---

## 1. Category Management

### 1.1 Create Category Form — new fields

Admins now need to set these fields when creating a category:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | Text | Yes | Category name (e.g., "Topical Past Papers") |
| `slug` | Text | Yes | URL-friendly identifier |
| `parentId` | Dropdown | No | Parent category (for hierarchy) |
| `isHidden` | Checkbox | No | Hide from customer navbar (default: unchecked) |
| `displayOrder` | Number | No | Sort order in menu (default: 0) |
| `icon` | Text | No | Icon name or class for menu item |
| `route` | Text | No | URL path for menu item |

### 1.2 Edit Category Form — new fields

Same fields as create, all editable. Changes to `isHidden` and `displayOrder` should immediately affect the customer navbar.

### 1.3 Category List View — new columns

| Column | Description |
|--------|-------------|
| Name | Category name |
| Slug | URL slug |
| Parent | Parent category name |
| Hidden | Yes/No (toggle) |
| Display Order | Number (editable inline) |
| Icon | Icon name |
| Route | URL path |
| Books Count | Number of books assigned |

### 1.4 Bulk Actions

- **Toggle Hidden:** Select multiple categories, show/hide them all at once
- **Reorder:** Drag-and-drop or bulk update `displayOrder` for menu items

---

## 2. Book Management

### 2.1 Create Book Form — new field

Admins now need to assign categories when creating a book:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `categoryIds` | Multi-select dropdown | No | One or more categories this book belongs to |

The dropdown should show all categories (including hidden ones, since admins may want to assign books to hidden categories like "Text Books").

### 2.2 Edit Book Form — new field

Same `categoryIds` multi-select dropdown. Changes should replace all existing category assignments.

### 2.3 Book Detail View — new section

Show which categories the book belongs to, with the ability to:
- Add/remove categories inline
- Click a category to navigate to the category detail page

### 2.4 Book List View — new column

| Column | Description |
|--------|-------------|
| Categories | Comma-separated list of category names, or count with hover tooltip |

---

## 3. Order Management

### 3.1 Order List — new filter

| Filter | Type | Description |
|--------|------|-------------|
| `categoryId` | Dropdown | Filter orders by category (all categories, including hidden) |

### 3.2 Order Detail — new section

Show which category each order item was purchased under. This preserves historical data even if categories are later reorganized.

The category shown is the one captured at purchase time (`OrderItem.categoryId`), which was copied from the user's cart at checkout (`CartItem.categoryId`). This is the category the user was browsing when they added the item to the cart — not derived from the book's current category assignments (which may have changed since the purchase).

### 3.3 Order Status Update — no changes

Existing status transitions remain unchanged.

---

## 4. Admin Dashboard Analytics

### 4.1 New Widget — Sales by Category

A chart or table showing revenue grouped by category:

| Category | Orders | Revenue | % of Total |
|----------|--------|---------|------------|
| Topical Past Papers | 120 | $12,000 | 35% |
| Mock Papers | 80 | $8,000 | 25% |
| Year-wise Past Papers | 60 | $6,000 | 18% |
| Text Books (Hidden) | 30 | $3,000 | 9% |
| Notes (Hidden) | 20 | $2,000 | 6% |

### 4.2 Time Range Filter

The category analytics widget should support the same time range filters as other analytics (today, week, month, custom date range).

### 4.3 Export

Allow exporting category analytics to CSV or PDF.

---

## 5. Navigation / Menu Management

### 5.1 Menu Preview

A live preview of how the customer navbar will look, reflecting:
- Which categories are hidden
- Display order
- Icons
- Routes

### 5.2 Quick Toggle

Admins should be able to toggle `isHidden` directly from the category list without opening the edit form.

---

## 6. Workflow Changes

### 6.1 Creating a New CLC Category

1. Admin creates "Topical Past Papers" as a top-level category
2. Sets `displayOrder: 1`, `icon: "file-text"`, `route: "/topical-past-papers"`
3. Leaves `isHidden: false`
4. Creates child categories for each curriculum level (AS & A-Level, IGCSE, etc.)
5. Creates subjects under each level
6. Creates books under each subject and assigns them to the "Topical Past Papers" category

### 6.2 Hiding a Category

1. Admin finds "Text Books" in the category list
2. Toggles `isHidden: true`
3. The category immediately disappears from the customer navbar
4. Existing books assigned to "Text Books" remain accessible via direct links but not via the menu

---

## 7. Summary of Admin Panel Changes

| Area | What Changes |
|------|-------------|
| Category Form | 4 new fields: `isHidden`, `displayOrder`, `icon`, `route` |
| Category List | 4 new columns + bulk toggle + reorder |
| Book Form | 1 new field: `categoryIds` (multi-select) |
| Book Detail | Category assignment section |
| Book List | Categories column |
| Order List | `categoryId` filter dropdown |
| Order Detail | Category context on order items |
| Dashboard | New "Sales by Category" analytics widget |
| Menu | Live preview + quick toggle |