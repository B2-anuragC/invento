# Invento — Mobile App Development Plan

## Purpose

This document captures the recommended roadmap for building the Invento mobile app and integrating it with the existing backend API.

The app should be designed around real retail workflows, with a strong focus on speed, clarity, and low-friction daily operations.

---

## Product Goal

Invento is a mobile-first inventory and business management application for small retail shops in India.

The mobile experience should help users:

- manage products
- check stock instantly
- record purchases and sales quickly
- monitor low-stock items
- understand daily business activity
- operate without heavy manual data entry

---

## Design Principles

1. Mobile-first experience
2. Fast daily workflows
3. Large readable values and actions
4. Minimal friction for common tasks
5. Clear confirmation before inventory-changing actions
6. Trust-building UI for business-critical operations
7. Simple, retail-focused information hierarchy

---

## UX Objectives

The end user is a shopkeeper, not a power user.

The app should help them answer these questions immediately:

- How much stock do I have?
- What is low stock?
- What did I sell today?
- What did I buy today?
- How much money came in or went out?
- Can I record a sale quickly without confusion?

---

## Recommended Visual Style

### Color palette

- Primary green: #1F9D68
- Deep green: #0F766E
- Accent amber: #F59E0B
- White / off-white: #F8FAFC
- Background neutral: #F3F4F6
- Text dark: #111827
- Border: #E5E7EB
- Success: #22C55E
- Warning: #F59E0B
- Danger: #EF4444

### Design characteristics

- rounded cards
- bold summary values
- large tap targets
- low visual clutter
- simple status colors
- strong hierarchy between primary and secondary actions

---

## Recommended App Structure

```text
app/
  auth/
    login.tsx
    register.tsx
    business-select.tsx
  (tabs)/
    dashboard.tsx
    products.tsx
    sales.tsx
    purchases.tsx
    inventory.tsx
    profile.tsx
  product/
    [id].tsx
  sale/
    create.tsx
  purchase/
    create.tsx
components/
  AppShell.tsx
  Header.tsx
  SummaryCard.tsx
  ProductCard.tsx
  SearchBar.tsx
  EmptyState.tsx
  Button.tsx
  Input.tsx
  Modal.tsx
constants/
  theme.ts
services/
  api.ts
  auth.ts
  products.ts
  sales.ts
  purchases.ts
  inventory.ts
store/
  auth-store.ts
  business-store.ts
utils/
  formatting.ts
```

---

## Step-by-Step Development Plan

### Step 1 — App foundation

Build the base app shell and routing.

Tasks:

- Expo Router setup
- tab navigation
- stack screens
- app shell layout
- global theme
- shared component library

Outcome:

A clean, Invento-styled app shell that feels product-specific instead of starter-template based.

---

### Step 2 — Authentication and business setup

Build the first real user flow.

Screens:

- login
- register
- business selection
- create business

API integration:

- POST /api/auth/login
- POST /api/auth/register
- GET /api/businesses

State to store:

- access token
- refresh token
- selected business ID
- current user data

Outcome:

User can sign in and work inside a business context.

---

### Step 3 — Dashboard MVP

Create the first screen after sign in.

Include:

- total sales today
- total purchases today
- total products
- low-stock count
- recent transactions
- quick actions

Goal:

The user should immediately understand the health of the business.

---

### Step 4 — Product management

Build the product module next.

Features:

- product list
- search by name or SKU
- add product
- edit product
- view product details
- low-stock indicator

API integration:

- GET /api/products
- POST /api/products
- PATCH /api/products/:id
- GET /api/products/:id/stock

Goal:

The user can manage the catalog quickly and locate products without friction.

---

### Step 5 — Inventory overview

Build stock-focused screens.

Features:

- current stock list
- low-stock cards
- stock history
- quick inventory checks

API integration:

- GET /api/inventory
- GET /api/inventory/:productId
- GET /api/inventory/:productId/history

Goal:

Users can understand exact stock positions without confusion.

---

### Step 6 — Sales flow

This is a critical business action and should be implemented early.

User flow:

1. open new sale
2. search product
3. add quantity
4. select customer
5. choose payment method
6. review total
7. confirm and save

API integration:

- GET /api/products
- GET /api/customers
- POST /api/sales

UX rules:

- auto-calc totals
- validate stock before submit
- confirm before saving
- display success feedback

---

### Step 7 — Purchase flow

Mirror the sales flow for supplier purchases.

User flow:

1. open new purchase
2. select supplier
3. add product lines
4. set quantity and price
5. review totals
6. confirm and save

API integration:

- GET /api/suppliers
- GET /api/products
- POST /api/purchases

UX rules:

- finalize total clearly
- keep input minimal and readable
- show success/failure clearly

---

### Step 8 — Customers and suppliers modules

Build the business contacts and history management screens.

Features:

- list customers
- create customer
- list suppliers
- create supplier
- view sales / purchase history

API integration:

- GET /api/customers
- POST /api/customers
- GET /api/suppliers
- POST /api/suppliers

---

### Step 9 — UX polish and edge-case handling

After core flows become functional, improve quality.

Areas:

- loading indicators
- empty states
- form validation
- retry flows
- server errors
- search/filter UX
- retry / refresh flow
- confirmation modals

Goal:

The app should feel reliable in real-world use, not just functional in demos.

---

### Step 10 — MVP QA and release readiness

Test the complete business cycle.

Minimum flows:

- sign in
- create/select business
- add product
- purchase inventory
- sell product
- inspect stock
- check dashboard
- customer and supplier flows

Release criteria:

- auth works
- product management works
- sales flow works
- purchase flow works
- stock reflects reality
- dashboard numbers are accurate
- no major crash points

---

## Recommended Development Order

### Phase A

- app shell
- auth
- dashboard
- products

### Phase B

- sales
- purchases
- inventory

### Phase C

- customer/supplier management
- polish
- QA

This sequence gives the fastest path to a working retail app.

---

## Recommended Technical Stack for the Mobile App

- Expo
- Expo Router
- React Native
- TypeScript
- Zustand or lightweight app state management
- React Query / TanStack Query for API data handling
- AsyncStorage for auth/session persistence
- Axios or fetch wrapper for API calls
- Reusable UI component library

Keep the stack lean and practical.

---

## Important Principle

Do not spend too much time designing advanced features before the core retail flows are working.

The real value is in:

- quick product lookup
- fast sales capture
- clear stock visibility
- reliable totals
- minimal confusion

---

## Immediate Next Milestone

The next milestone should be:

- design the app shell
- implement auth flow
- implement dashboard
- connect products

This will create the first real user-facing version of the app.

---

## Summary

The best path is to combine design and backend integration in a staged manner:

1. design the shell and system
2. implement auth and business selection
3. build product flow
4. build sales and purchases
5. show stock and dashboard
6. polish and test

This keeps the app practical, mobile-first, and aligned with the Invento backend.
