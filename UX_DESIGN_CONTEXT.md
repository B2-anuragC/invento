# Invento UX Design Context

## 1. Product context
This app is designed for a multi-product trade and inventory business, especially suited to businesses that sell a large number of items with different pricing and unit types. The business is not a simple one-product store; it deals with many product families, pricing structures, and stock units.

The app is currently structured as a mobile inventory and sales dashboard for a small-to-mid business, with:
- dashboard overview
- product listing
- stock tracking
- sales and purchase transactions
- basic customer and supplier management

This matches a business model where the shop owner frequently needs to:
- find a product quickly
- check stock availability
- know buy and sell price
- create a sale or purchase without browsing a large catalog manually
- manage categories of products with different units and pricing logic

---

## 2. Current app design state

### 2.1 Visual system
The current design uses a clean, card-based mobile interface with:
- neutral background
- green accent for positive states
- amber for warnings
- red for stock risk
- white cards for content blocks
- simple list layouts for inventory and transactions

Core UI primitives can be seen in:
- frontend/components/invento-ui.tsx
- frontend/app/(tabs)/index.tsx
- frontend/app/(tabs)/products.tsx

This is a strong base for a light business app, especially for MVP and early product validation.

### 2.2 Existing screens and patterns
Current design patterns include:
- dashboard cards with totals and summaries
- product list with search input
- low-stock summary cards
- status pills for stock and product conditions
- list cards for recent activity and stock levels
- transaction form screens for purchase and sale creation

These patterns are useful and relatively consistent, but they are still mainly functional and not deeply optimized for a product-heavy trading business.

---

## 3. Business reality that should influence design
The app is serving a shop where products are not generic. The user has to manage many product types with different sales logic.

Examples of product complexity:
- Aluminium profiles sold by kg
- Some products sold by piece
- Jali or glass sold by square feet
- Hardware and fittings sold as units or sets
- Different product groups with different pricing conventions

This means the app must support more than just a flat product list.

---

## 4. Key UX problem in the current design
The main issue is that the current design still feels like a general product management dashboard rather than a trade catalog optimized for quick selling and buying.

### Current gaps
1. Flat product list behavior
   - Users must scroll and scan too much when product count grows
   - This becomes inefficient for stores with large catalogs

2. Limited category-based browsing
   - The shop owner naturally thinks in categories, not just a generic product list
   - A category-based workflow is much faster than manually searching every item

3. Pricing visibility is not strong enough
   - Buy price and sell price should be visible early and clearly
   - Users cannot rely on memory for every product in a large catalog

4. Unit handling is not emphasized enough
   - Kg, sq ft, piece, feet, box, set are all different contexts
   - The app needs consistent unit-aware display and quantity input

5. Transaction flow is more form-like than catalog-like
   - The user needs to search, filter, confirm, and add quickly
   - Current flows are usable, but not optimized for speed in large product catalogs

6. Product discovery is not contextual enough
   - Recent products, favorites, and category-first browsing would reduce search friction

---

## 5. Design direction that suits the business
The strongest design direction for this app is:

### Catalog-first commerce UX
The app should behave like a smart trade catalog, not only a dashboard or CRUD list.

A catalog-first UX should support:
- quick search
- category tabs
- smart filtering
- visible pricing
- stock status
- unit-specific quantity handling
- fast add-to-sale and add-to-purchase actions

---

## 6. Best UX recommendations for this app

### 6.1 Product listing screen should be category-driven
Recommended top experience:
- search bar
- category chips/tabs
- filters for stock and unit type
- sort options
- quick action buttons

Example categories:
- All
- Aluminium Profiles
- Hardware
- Glass & Jali
- Accessories
- Miscellaneous

This is much better than a single long list.

### 6.2 Product cards should prioritize business-critical information
Each product card should show:
- product name
- category
- SKU or barcode
- stock quantity
- unit
- buy price
- sell price
- low-stock indicator

This reduces mental effort and prevents pricing mistakes.

### 6.3 Search should support product identity and context
Users should be able to search by:
- product name
- SKU
- barcode
- category
- material type or item name

This matters a lot for wholesale and metal trade products.

### 6.4 Unit-aware design is essential
Products should always show:
- unit label clearly
- price per unit
- quantity input matching that unit

Examples:
- Aluminium profile: ₹620 / kg
- Glass: ₹220 / sq ft
- Door fitting: ₹180 / piece

This should be visually obvious and consistent.

### 6.5 Recent and favorite products should be surfaced
Use sections like:
- Recently sold
- Recently purchased
- Frequently used products
- Favorites

This speeds daily work and reduces repeated searching.

### 6.6 Sale and purchase creation should feel like catalog actions
The transaction flow should be:
1. Search product
2. Filter by category
3. Confirm unit and price
4. Enter quantity
5. Review summary
6. Save transaction

This is much faster than scanning a full list and manually selecting every item.

---

## 7. Recommended product categories for this shop
A realistic category model for this business could be:

- Aluminium Profiles
  - angles
  - channels
  - tubes
  - casings
  - frames

- Hardware
  - door fittings
  - window fittings
  - handles
  - locks
  - accessories

- Glass & Jali
  - glass sheets
  - decorative jali
  - panels
  - custom glass items

- Accessories
  - sealants
  - gaskets
  - fasteners
  - adhesives

- Miscellaneous / Other

This structure supports quick visual organization and product discovery.

---

## 8. Future scope roadmap

### Phase 1: Better catalog UX
- category tabs
- product card redesign
- visible pricing and stock status
- improved search/filtering
- recent products

### Phase 2: Faster transaction UX
- search-first sale/purchase entry
- product quick add
- quantity validation by unit
- review-before-save workflow

### Phase 3: Sales and purchase intelligence
- margin view
- price history
- top-selling products
- category-wise sales summary
- low-stock alerts with reorder suggestions

### Phase 4: Advanced inventory management
- stock movement history
- reorder planning
- product performance analytics
- multi-warehouse or branch support

---

## 9. Design summary for Figma handoff
The app should be redesigned as a business catalog and quick transaction workflow for a trading and hardware business.

### Core idea
A product-first, category-driven inventory UI where users can:
- find items quickly
- compare stock and price at a glance
- work in different units without confusion
- create sales and purchases efficiently

### Primary design goals
- reduce search friction
- make pricing visible and hard to miss
- support multiple units and categories
- speed up stock and transaction work
- feel natural for daily trade operations

---

## 10. Final recommendation
The current app already has the right foundation, but the next design should move from a generic business dashboard to a trade-specific catalog experience.

The biggest improvement needed is:
- category-aware product discovery
- unit-aware pricing cards
- quick transaction selection
- better visibility of stock and price

This is the nearest fit to how a real aluminium/hardware shop owner actually thinks and works.
