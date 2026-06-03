# ShirtCo ERP — Todo

## Foundation
- [x] Define all TypeScript types (`lib/types.ts`)
- [x] Create shirt-manufacturing seed data (`lib/seed.ts`)
- [x] Global state store with React Context + useReducer (`lib/store.tsx`)
- [x] Root page redirect to `/dashboard`

## Layout & Shell
- [x] ERP route group `app/(erp)/layout.tsx`
- [x] Collapsible sidebar with active links & notification badges (`components/layout/sidebar.tsx`)
- [x] Client shell wrapper with ERPProvider (`components/layout/erp-shell.tsx`)

## Module Pages
- [x] Dashboard — KPI cards, recent orders, low-stock alerts, production summary
- [x] Sales Orders — table, status filter pills, transitions, create dialog
- [x] Inventory — raw materials + finished goods tabs, stock bars, adjust dialog
- [x] BOM — per-product component tables with can-produce analysis
- [x] Production Orders — status workflow, status summary, create dialog
- [x] MES — material consumption preview, complete production → auto-inventory update
- [x] Shipments — carrier/tracking, status flow, create dialog
- [x] Settings/RBAC — user table, role permission cards

## Polish & Quality
- [x] Add `metadata` exports (title tags) to each page
- [x] Audit Trail tab on Settings page (stock movements log)
- [x] Add product detail view / BOM edit capability
- [x] Add customer management page
- [x] Add supplier management page
- [x] Auto-create production order when Sales Order → IN_PRODUCTION
- [x] Dashboard charts — revenue trend, production by status
- [x] Mobile responsive layout (hamburger menu for sidebar)

## Gap Analysis Roadmap

### P0: Critical Stabilizations
- [ ] Migrate in-memory reducer to SQLite DB with ACID transactions
- [ ] Implement Inventory Hard Stops (prevent negative stock)
- [ ] Implement ATP (Available to Promise) logic for stock reservations
- [ ] Enforce Backend RBAC on API routes

### P1: Core Operational Completeness
- [ ] Implement Procurement & Goods Receipt Workflow
- [ ] Allow partial shipments and partial production completions
- [ ] Implement Sales Order cancellation sagas
- [ ] Add system-wide Audit Trails for master data and orders

### P2: Advanced Manufacturing & Finance
- [ ] Add Routings & Work Center capacity tracking
- [ ] Implement Multi-Location & Lot Traceability
- [ ] Automate AR Invoices and AP Bills generation
- [ ] Add MRP Engine for automated PO generation

## Backlog
- [ ] Persistent state (localStorage or IndexedDB)
- [ ] Print / export to PDF for Sales Orders and Production Orders
- [ ] Search & filter across all tables
