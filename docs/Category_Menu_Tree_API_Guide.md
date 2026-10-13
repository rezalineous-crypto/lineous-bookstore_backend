# Category Menu Tree API — Frontend Guide

**New endpoint:** `GET /categories/menu/tree`
**Purpose:** Powers the navbar dropdown with the full hierarchy **Category → Publication → Subject → Book** in a single request.

---

## 1. What changed and which API it replaces

| Endpoint | Status | What it returns |
|---|---|---|
| `GET /categories/menu` | **Keep** (still used) | Category list with nested sub-categories (`children`) only. No publication/subject/book data. |
| `GET /categories/menu/tree` | **NEW — use this for the navbar dropdown** | Everything `/categories/menu` returns, **plus** the full `publications → subjects → books` tree under each category. |
| `GET /books/tree` | Optional | Same Category → Pub → Sub → Book hierarchy, but built from books only: categories with no published books are **omitted**, hidden categories are **not** filtered, and every book includes `priceRange` + `thumbnail` (heavy payload). |

**Recommendation for the frontend:**

- Use `GET /categories/menu/tree` as the **single source for the navbar** (top-level items + dropdown content).
- You no longer need to call `/books/tree` just to build the dropdown.
- Keep `/categories/menu` only if some other part of the app needs the plain category list.

---

## 2. Request

```
GET /categories/menu/tree
```

**Authentication:** None required. The endpoint uses `OptionalJwtAuthGuard`:

- **No token / customer token** → public menu: only non-hidden categories, active publications/subjects, published books.
- **Admin token** (`Authorization: Bearer <admin-jwt>`) → full menu including hidden categories, inactive publications/subjects, and draft books. Useful for admin menu preview.

No query parameters, no request body.

---

## 3. Response body

```json
{
  "message": "Menu tree retrieved successfully",
  "status": "success",
  "data": [
    {
      "id": "e6b86a2f-dc1a-40a9-ae26-490898a2ecdb",
      "name": "Test Papers",
      "slug": "test-papers",
      "parentId": null,
      "isHidden": false,
      "displayOrder": 0,
      "icon": null,
      "route": "/test_paper",
      "createdAt": "2026-10-11T18:45:35.810Z",
      "updatedAt": "2026-10-11T18:45:35.810Z",
      "deletedAt": null,
      "children": [],
      "publications": [
        {
          "id": "9f1c2e3a-1111-4a55-b777-000000000001",
          "name": "CLC",
          "slug": "clc",
          "subjects": [
            {
              "id": "8a2b1c4d-2222-4a55-b777-000000000002",
              "name": "Mathematics",
              "slug": "mathematics",
              "books": [
                {
                  "id": "b1k00001-3333-4a55-b777-000000000003",
                  "title": "Math Test Paper 2024",
                  "slug": "math-test-paper-2024"
                },
                {
                  "id": "b1k00002-3333-4a55-b777-000000000003",
                  "title": "Math Test Paper 2023",
                  "slug": "math-test-paper-2023"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "c6cbd49d-73e2-4796-8d6f-c1842606911d",
      "name": "Topical Past Papers",
      "slug": "topical-past-papers",
      "parentId": null,
      "isHidden": false,
      "displayOrder": 0,
      "icon": null,
      "route": "/tropical-past-papers",
      "createdAt": "2026-10-11T18:53:49.365Z",
      "updatedAt": "2026-10-11T18:53:49.365Z",
      "deletedAt": null,
      "children": [],
      "publications": []
    }
  ]
}
```

### Field reference

**Category node** (recursive — same shape at every level)

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | Category ID |
| `name` | string | Display name for the menu item |
| `slug` | string | URL-friendly identifier |
| `parentId` | string \| null | `null` = top-level menu item |
| `isHidden` | boolean | Always `false` for public requests (hidden ones are filtered out); admins may see `true` |
| `displayOrder` | number | Sort order — **lower appears first** |
| `icon` | string \| null | Icon name/class if the admin set one |
| `route` | string \| null | **The category's URL** (e.g. `/test_paper`) — use this for the top-level link |
| `createdAt` / `updatedAt` / `deletedAt` | string \| null | Timestamps (ignore for UI) |
| `children` | Category[] | Sub-categories, same shape recursively (empty array if none) |
| `publications` | Publication[] | Dropdown content (empty array if the category has no visible books) |

**Publication node**

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | Publication ID |
| `name` | string | Display name |
| `slug` | string | Use to build the link (see §4) |
| `subjects` | Subject[] | Subjects under this publication |

**Subject node**

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | Subject ID |
| `name` | string | Display name |
| `slug` | string | Use to build the link (see §4) |
| `books` | Book[] | Books under this subject |

**Book node** (lightweight — title only, by design)

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | Book ID |
| `title` | string | Book title — the only display field |
| `slug` | string | Use to build the book page link (see §4) |

> No prices, thumbnails, or descriptions in the menu tree. Fetch full book details from `GET /books` / `GET /books/:slug` when the user opens a book or category page.

---

## 4. How to build links

Publications and subjects have **no `route` field in the database** — only categories do. Build the nested links from slugs:

| Level | Link |
|---|---|
| Category | `category.route` (e.g. `/test_paper`) — fall back to `/categories/${category.slug}` if `route` is null |
| Publication | `${category.route}/${publication.slug}` (e.g. `/test_paper/clc`) |
| Subject | `${category.route}/${publication.slug}/${subject.slug}` (e.g. `/test_paper/clc/mathematics`) |
| Book | `/books/${book.slug}` (e.g. `/books/math-test-paper-2024`) |

> If your router uses a different convention, adjust the pattern — the slugs are stable identifiers.

---

## 5. Frontend usage example (navbar dropdown)

```ts
const res = await fetch('/api/categories/menu/tree'); // no auth header needed
const { data } = await res.json();

// Top-level items = categories with parentId === null (already the only
// entries in `data`). Render each as a dropdown:
data.map((category) => (
  <NavItem key={category.id} to={category.route} icon={category.icon}>
    {category.publications.map((pub) => (
      <DropdownColumn key={pub.id} title={pub.name}>
        {pub.subjects.map((subj) => (
          <DropdownLink
            key={subj.id}
            to={`${category.route}/${pub.slug}/${subj.slug}`}
          >
            {subj.name}
            {/* optional: book titles as a third level */}
            {subj.books.map((book) => (
              <SubLink key={book.id} to={`/books/${book.slug}`}>
                {book.title}
              </SubLink>
            ))}
          </DropdownLink>
        ))}
      </DropdownColumn>
    ))}
  </NavItem>
));
```

Rendering rules:

- **Desktop:** hover/click dropdown — publication columns, subject links inside, optional book titles as a third level.
- **Mobile:** collapsible accordion using the same nested structure.
- **Empty dropdowns:** a category with `publications: []` still renders as a link to its category page (no dropdown).
- **Active state:** match the current URL against `category.route` / built pub/sub paths.
- **Icons:** render `category.icon` when present.

---

## 6. Ordering & visibility rules (what the backend guarantees)

1. **Category order:** `displayOrder` ascending, ties broken A→Z by `name`. Render in array order — no client-side sorting needed.
2. **Publication / subject / book order:** A→Z by `name` / `title`.
3. **Public requests:** hidden categories (`isHidden: true`), inactive publications/subjects (`isActive: false`), and non-published books (e.g. `DRAFT`) are excluded.
4. **Admin requests:** everything is included so the menu can be previewed. If you build an admin preview screen, filter on `isHidden` / `isActive` client-side if you want to simulate the public view.
5. **Empty categories are intentional:** they appear with `"publications": []` so the navbar can still link to the category page. Admins control visibility via the `isHidden` toggle — do not filter them out client-side.
6. **Multi-category books:** a book assigned to multiple categories appears under each one.

---

## 7. Migration checklist for the frontend

- [ ] Replace the navbar dropdown data source with `GET /categories/menu/tree` (single call, no auth header).
- [ ] Remove any `/books/tree` call that existed only to build the dropdown.
- [ ] Keep `/categories/menu` only if another screen needs the plain category list.
- [ ] Build pub/sub/book links from slugs per §4.
- [ ] Render categories with empty `publications` as plain links (no dropdown).
- [ ] Trust the backend ordering — do not re-sort.
- [ ] Book cards still need full details from `GET /books` — the menu tree only carries `id`, `title`, `slug`.
