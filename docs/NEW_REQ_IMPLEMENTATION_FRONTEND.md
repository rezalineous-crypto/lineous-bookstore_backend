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