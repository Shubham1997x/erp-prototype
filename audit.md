# Manufacturing ERP — Comprehensive Gap Analysis

**System**: Shirt Manufacturing ERP (Next.js 16 + SQLite + TypeScript)
**Review Date**: June 3, 2026
**Reviewer**: Senior ERP Solution Architect

---

## ERP Maturity Score: **32 / 100** *(Prototype / Proof-of-Concept)*

| Dimension | Score | Weight | Notes |
|---|---|---|---|
| Sales Order Management | 5/10 | 15% | Workflow exists; cancellation, partial fill, credit checks missing |
| Production / Manufacturing | 4/10 | 15% | State machine exists; QC, scrap, rework, scheduling absent |
| Inventory Management | 5/10 | 15% | Basic tracking; multi-warehouse, reconciliation, costing absent |
| Procurement | 3/10 | 10% | Basic PO; partial receipt broken, no 3-way match, no approval |
| Finance / Accounting | 0/10 | 15% | **Module does not exist** |
| Workflow & Automation | 4/10 | 10% | Some automations; approvals, notifications, backorders absent |
| Reporting & Analytics | 2/10 | 10% | One static dashboard; all meaningful reports absent |
| Security & RBAC | 2/10 | 5% | Skeleton RBAC; trivially bypassed at every level |
| Audit & Compliance | 2/10 | 5% | audit_logs table exists but **is never written to** |

---

## Critical Issues

---

**Issue**: Double stock deduction — finished goods deducted twice for every shipped order
**Severity**: Critical
**Module**: Inventory / Sales Orders / Shipments
**Business Impact**: Inventory shows deeply negative or incorrect stock balances. After ~50 shipped orders the inventory is completely unreliable. All reorder decisions, production plans, and financial valuations are wrong.
**Example Scenario**: SO-001 for 100 shirts is approved. Status → READY_TO_SHIP deducts 100 from `product.current_stock`. Then a Shipment is created and advanced to DISPATCHED — the Shipment handler also checks `current_stock` and deducts another 100. Net result: 200 units removed for a 100-unit order.
**Recommended Fix**: Pick one authoritative deduction point. The canonical ERP pattern is: SO→APPROVED reserves stock (increment `reserved_stock`); Shipment→DISPATCHED deducts `current_stock` AND `reserved_stock` simultaneously in a single atomic transaction. The SO→READY_TO_SHIP transition should **not** deduct stock — only reserve it.

---

**Issue**: Authentication is entirely client-controllable — any user can claim any role
**Severity**: Critical
**Module**: Security / RBAC / All Modules
**Business Impact**: Any browser user can open DevTools, set `localStorage.current_user` to `{"role":"Admin"}`, and immediately gain full system access — including approving their own sales orders, completing production, and adjusting inventory. Zero separation of duties. Completely non-compliant with ISO 27001, SOX, and any manufacturing audit standard.
**Example Scenario**: A Sales Executive opens the browser console, sets their role to "Production Manager", navigates to MES, and marks all quality checks as passed — bypassing QC entirely.
**Recommended Fix**: Implement server-side sessions with signed JWT or session cookies. Never trust client-supplied role headers. Authentication must be validated on every request against a server-side credential store with bcrypt-hashed passwords, MFA for finance/admin roles, and session expiry.

---

**Issue**: `audit_logs` table exists but is **never written to** anywhere in the codebase
**Severity**: Critical
**Module**: Audit / Compliance
**Business Impact**: Zero audit trail for any business action except raw inventory movements. Cannot answer: who approved this order? who changed this BOM? who completed this production run? This makes the system non-compliant with ISO 9001, GAAP, and any manufacturing quality standard. In a dispute or fraud investigation there is no evidence.
**Example Scenario**: An inventory manager increases stock of a raw material by 10,000 units with reason "adjustment". There is a `stock_movement` entry but no audit log entry showing who, when, from which IP, or what the before/after state was. If fraud is suspected, there is no investigation trail.
**Recommended Fix**: Implement a `writeAuditLog(userId, action, entityType, entityId, before, after)` function called inside every database transaction that modifies business data. Log before and after states as JSON. Audit logs must be immutable (INSERT only, no UPDATE/DELETE permission on table).

---

**Issue**: Race condition on concurrent stock reservations — no database-level locking
**Severity**: Critical
**Module**: Inventory / Sales Orders / Production
**Business Impact**: Under concurrent load (multiple sales staff submitting orders simultaneously), two requests can both read the same available stock quantity, both pass the "sufficient stock" check, and both proceed to reserve/deduct the same inventory. Result: overselling, negative stock, and corrupted inventory balances.
**Example Scenario**: Two sales executives simultaneously submit orders for 500 shirts each. Available stock: 600. Both requests read 600 > 500 (pass), both deduct 500. Final stock: -400. The system allowed 1,000 units to be committed against 600 in stock.
**Recommended Fix**: Use `SELECT ... FOR UPDATE` (or SQLite `BEGIN IMMEDIATE` / `BEGIN EXCLUSIVE`) to lock the row before reading stock during reservation. Alternatively, use optimistic concurrency with a version column and retry on conflict. All stock-modifying operations must use `db.transaction()` with exclusive read-writes.

---

**Issue**: Customer credit limit exists in the data model but is **never enforced**
**Severity**: Critical
**Module**: Sales / Finance / Credit Control
**Business Impact**: Customers with zero or exceeded credit limits can place unlimited orders. Outstanding debt accumulates without any system control. Finance loses ability to manage credit exposure. Risk of bad debt is unquantifiable.
**Example Scenario**: Customer "FabIndia" has a credit limit of ₹500,000. They already have ₹480,000 in open orders. A Sales Executive creates a new ₹200,000 order — the system accepts it without any warning, taking exposure to ₹680,000 against a ₹500,000 limit.
**Recommended Fix**: On `POST /api/sales-orders`, calculate the customer's total value of all non-cancelled, non-delivered open orders, add the new order value, and reject (or require admin override) if it exceeds `creditLimit`. Surface the credit utilisation on the customer record and the order creation dialog.

---

**Issue**: `CANCELLED` status exists in the type system but there is no API endpoint or business logic to cancel orders
**Severity**: Critical
**Module**: Sales Orders / Production / Inventory
**Business Impact**: Orders that are wrong, duplicate, or need to be stopped cannot be cancelled. Business is forced to let bad orders run through the full pipeline. Reserved stock and reserved raw materials are never released, causing phantom reservations that block legitimate orders indefinitely.
**Example Scenario**: A Sales Executive creates a duplicate order for the same customer. There is no cancel button that works — the CANCELLED status appears in the type definition but clicking it would result in a stock state that is never cleaned up.
**Recommended Fix**: Implement `PATCH /api/sales-orders/[id]/cancel` that: (1) validates the current status is cancellable (DRAFT, SUBMITTED, INVENTORY_CHECK, APPROVED); (2) releases reserved finished goods stock; (3) cancels all linked PLANNED/RELEASED production orders; (4) releases reserved raw materials from those production orders; (5) writes audit log; (6) notifies relevant stakeholders.

---

**Issue**: Production Order IDs and Purchase Order IDs share the same format `po-{6-digit-random}` — guaranteed eventual collision
**Severity**: Critical
**Module**: Production / Procurement / Data Integrity
**Business Impact**: When a Production Order ID collides with a Purchase Order ID, any system or report that queries by `po-XXXXXX` returns ambiguous results. Financial reports, stock movements, and audit trails all become corrupted and untrustworthy.
**Example Scenario**: Production Order `po-483921` is created for a shirt run. Later, Purchase Order `po-483921` is created for fabric procurement. Any `stock_movement` linked to `po-483921` now cannot be traced to the correct business entity.
**Recommended Fix**: Use distinct ID prefixes: `prod-` for Production Orders and `purch-` for Purchase Orders. Better yet, replace the timestamp/random ID scheme with a proper sequential ID generator (e.g., `SO-2024-00001`) that is human-readable, sequential, collision-free, and carries business context.

---

**Issue**: Purchase Order receive endpoint always marks PO as `RECEIVED` — `PARTIALLY_RECEIVED` status is never used
**Severity**: Critical
**Module**: Procurement / Inventory
**Business Impact**: Suppliers routinely deliver partial quantities. The system forces an all-or-nothing receipt, meaning staff must either: (a) record a receipt before all goods arrive and lose track of the outstanding balance, or (b) wait until everything arrives and delay production due to material shortages that appear on paper as "on order" when some material is already on the warehouse floor.
**Example Scenario**: PO for 500m of fabric ordered. Supplier delivers 300m first. Staff cannot record the 300m without closing the PO. If they close it at 300m, the system shows 200m received that wasn't. If they wait, the 300m doesn't appear in inventory and production is blocked.
**Recommended Fix**: The receive endpoint must accept a `receivedQty` per line. If any line's `receivedQty < qty`, set PO status to `PARTIALLY_RECEIVED` and only update `current_stock` for what was actually received. Allow multiple partial receipts until the PO is fully received.

---

**Issue**: Finance / Accounting module is completely absent
**Severity**: Critical
**Module**: Finance
**Business Impact**: The system cannot function as a business tool without financial management. There are no invoices to send customers, no supplier invoice matching, no payment tracking, no accounts receivable aging, no accounts payable, no cost of goods sold, no profit/loss visibility, and no financial audit trail. The company is running operationally blind.
**Example Scenario**: Goods are shipped to Zara (₹2.4M order). There is no invoice generated, no payment terms tracked, no due date, no AR aging. Finance has no idea what is owed, by whom, or when it's overdue. Cash flow management is impossible.
**Recommended Fix**: Implement as P0: Customer Invoice (linked to SO/Shipment), Supplier Invoice (linked to PO/GRN), Payment recording, AR/AP aging reports, basic P&L by period.

---

## High Severity Issues

---

**Issue**: No backorder creation when insufficient stock for partial fulfillment
**Severity**: High
**Module**: Sales Orders / Inventory
**Business Impact**: When a sales order cannot be fully filled from stock, the system throws an error and stops. There is no ability to ship what is available and create a backorder for the remainder. Customer communication and delivery commitment management is impossible.
**Example Scenario**: Order for 200 white shirts, 150 blue shirts. Stock: 200 white, 80 blue. The system rejects the entire order because blue shirts are insufficient rather than shipping the 200 white shirts immediately and backordering the 70 missing blue shirts.
**Recommended Fix**: Add `POST /api/sales-orders/[id]/partial-fulfill` that creates a split: a fulfillment line for available stock and a backorder line with remaining qty. Track parent-child SO relationships. Show backorder status prominently on the SO detail.

---

**Issue**: No formal approval workflow with authority limits and segregation of duties
**Severity**: High
**Module**: Sales Orders / Production / Procurement
**Business Impact**: Any Sales Executive can create and self-approve an order of any value. A Production Manager can approve their own production orders. There is no monetary threshold that triggers escalation. This violates the most basic internal control principle (segregation of duties) and creates fraud risk.
**Example Scenario**: A Sales Executive creates a fraudulent order worth ₹50,000,000 and advances it to APPROVED with no second signature required. Goods ship before anyone notices.
**Recommended Fix**: Implement an approval matrix: orders below ₹X are auto-approved; ₹X–₹Y require Sales Manager approval; above ₹Y require Finance Director approval. Approval by the creator of the record must be blocked. Track approver identity and timestamp in a dedicated `approvals` table.

---

**Issue**: BOM update deletes all components and re-inserts — no version history preserved
**Severity**: High
**Module**: BOM / Production
**Business Impact**: When a BOM is updated (e.g., material substitution), the historical version used in completed production orders is permanently lost. Cannot answer: "what components were used in the production run last month?" Cannot perform root cause analysis on quality issues. Violates ISO 9001 document control requirements.
**Example Scenario**: BOM v1.0 used component "Button Type A". After a supplier change, BOM is updated to v1.1 with "Button Type B". All historical production orders that reference this BOM now point to v1.1 — the historical record of what was actually manufactured is gone.
**Recommended Fix**: Implement immutable BOM versioning. A BOM update creates a NEW BOM record (new ID, incremented version) linked to the product. The old BOM is archived, not overwritten. Production orders store a snapshot of the BOM at the time of creation. The `PATCH /api/boms/[id]` endpoint should be disabled for ACTIVE BOMs — changes require creating a new version.

---

**Issue**: Raw material reservation during production conflicts with finished goods reservation for sales
**Severity**: High
**Module**: Inventory / Production
**Business Impact**: The system uses a single `reserved_stock` field for both "reserved for a sales order" and "reserved for a production run", but these are different business events managed by different teams. The reserved quantity is not traceable to the source reservation. Inventory Manager cannot see which reservations belong to which orders.
**Example Scenario**: 500m fabric is reserved (200m for SO-001 production, 300m for SO-002 production). The Inventory Manager sees `reserved_stock = 500` but cannot determine the breakdown. If SO-001 is cancelled, the correct 200m must be released — but there is no linkage to know which amount to release.
**Recommended Fix**: Create a dedicated `inventory_reservations` table with columns: `material_id/product_id`, `reserved_qty`, `reservation_type` (sales_order / production_order), `reference_id`, `created_by`, `created_at`. All reservation/release operations work against this table. `reserved_stock` becomes a derived sum.

---

**Issue**: Quality Control is a status transition only — no actual QC data captured
**Severity**: High
**Module**: Production / Quality
**Business Impact**: Production orders advance through QUALITY_CHECK to COMPLETED with no QC criteria, no pass/fail recording, no inspector identity, no defect counts, and no rejection reason. This is a liability issue for a garment manufacturer shipping to Zara and H&M — both require documented quality inspection records.
**Example Scenario**: A production run of 500 shirts has 50 defective units with collar stitching defects. The QC inspector advances the order to COMPLETED in the MES. The 50 defective units are counted as finished goods. They ship to the customer. There is no record of the QC check, the defect, or who approved shipment.
**Recommended Fix**: Implement a `quality_inspections` table: producedQty, passedQty, rejectedQty, defectCodes[], inspectorId, inspectedAt, notes. The COMPLETE button in MES must require a completed quality inspection record. Rejected quantity should trigger a rework or scrap production order.

---

**Issue**: No scrap or rework workflow in production
**Severity**: High
**Module**: Production / Inventory
**Business Impact**: All manufacturing has waste. Without scrap recording, raw material consumption records are wrong, production cost is understated, and inventory balances diverge from physical stock over time. Rework orders cannot be tracked, creating invisible labor and material costs.
**Example Scenario**: Production run of 200 shirts. 15 shirts fail QC and are scrapped (materials consumed, no finished goods). The system has no way to record this. Either: (a) they're not recorded (raw material stock shows more than is physically present), or (b) they're included in finished goods count (inflating FG stock with unsellable items).
**Recommended Fix**: Add `scrap_orders` table tracking: production_order_id, qty_scrapped, scrap_reason, material_cost_written_off, disposed_by, date. The production completion flow must accept `producedQty` and `scrappedQty` separately. Raw material deductions must account for scrap. Add scrap rate to production KPIs.

---

**Issue**: Deleting a customer or supplier performs a hard delete with no referential integrity check
**Severity**: High
**Module**: Data Integrity / All Modules
**Business Impact**: Deleting a customer that has open sales orders breaks foreign key relationships. All their order history becomes orphaned. Financial reports, audit trails, and customer analytics lose that customer's data entirely. Similarly, deleting a supplier with open POs or linked raw materials corrupts procurement history.
**Example Scenario**: Customer "H&M" is accidentally deleted. Their 6 open orders still exist in `sales_orders` with `customer_id = 'hm-001'` but the customer record is gone. The order list shows null customer names. Revenue reports undercount. An accountant tries to invoice H&M — there is no record of who to invoice.
**Recommended Fix**: Never hard-delete master data that has transactional history. Implement soft-delete with an `is_active` flag. Before any delete, check for linked records and either block the delete with a clear error ("Cannot delete: 6 active sales orders") or require the user to explicitly reassign or archive linked records first.

---

**Issue**: Shipment cancellation is allowed from `DELIVERED` status — restores stock for delivered goods
**Severity**: High
**Module**: Shipments / Inventory
**Business Impact**: A delivered shipment can be "cancelled", which restores stock to the warehouse even though the goods are physically with the customer. This creates phantom inventory — the system thinks goods are in stock but they're at the customer site. Subsequent orders will oversell non-existent inventory.
**Example Scenario**: Shipment SHP-001 is marked DELIVERED. Someone accidentally clicks "Cancel Shipment". The system restores 500 shirts to `current_stock`. The shirts are not in the warehouse. A new order is placed for those 500 shirts. They cannot be fulfilled. Customer dispute.
**Recommended Fix**: DELIVERED is a terminal state — it must not be cancellable. Post-delivery corrections require a dedicated **Return / RMA workflow** with a separate `returns` entity that records: reason, condition of returned goods, restocking decision (restock / scrap / rework), and creates the appropriate stock movement only after physical receipt is confirmed.

---

**Issue**: No production scheduling — no dates, no capacity, no lead time visibility
**Severity**: High
**Module**: Production / Operations
**Business Impact**: Production orders have no scheduled start date, no planned completion date, and no work center capacity constraints. It is impossible to commit a delivery date to a customer, impossible to prioritize production runs, and impossible to detect scheduling conflicts.
**Example Scenario**: Five large production orders are released simultaneously, each requiring the same cutting machine. There is no way to know they conflict, sequence them, or tell the sales team which orders will be delayed.
**Recommended Fix**: Add `planned_start`, `planned_end`, `actual_start`, `actual_end` to production orders. Implement work centers with capacity (hours/day). Add a basic scheduling algorithm (FIFO or EDD) that assigns production orders to time slots. Show a simple Gantt view in the production module.

---

**Issue**: Automatic reorder point on raw materials exists in data but no automatic replenishment action
**Severity**: High
**Module**: Procurement / Inventory
**Business Impact**: Materials can fall below `reorder_point` with no system response. A human must manually check the inventory screen, notice the amber indicator, and manually create a purchase order. In a real operation with 100+ materials this leads to stockouts and production halts.
**Example Scenario**: Fabric stock falls to 50m, reorder_point is 200m. The production floor runs out 3 days later. Nobody noticed because the inventory screen wasn't checked. Production halts for a week waiting for the emergency PO to arrive.
**Recommended Fix**: Implement a replenishment job that runs on a schedule (or on every stock decrement): if `current_stock - reserved_stock < reorder_point`, create a draft PO suggestion and send a notification to the Procurement team. Add a "Replenishment Suggestions" dashboard widget.

---

**Issue**: `stock_movements` entries have no foreign key linkage to the originating business document
**Severity**: High
**Module**: Inventory / Audit
**Business Impact**: The stock movement log records a `reason` as free text (e.g., "PO po-123456 Goods Receipt") but has no structured FK to the purchase order, sales order, or production order that caused it. Audit queries cannot join movements to orders. Financial reconciliation by period or order is manual and error-prone.
**Example Scenario**: Auditor asks: "Show me all inventory movements for Sales Order SO-001." There is no query that can reliably answer this — only a text search on the `reason` field, which is fragile and incomplete.
**Recommended Fix**: Add `reference_type` (enum: purchase_order, sales_order, production_order, manual_adjustment, initial_stock) and `reference_id` (FK) to `stock_movements`. Every programmatic stock movement must populate these fields. Manual adjustments require a mandatory reason and approver.

---

## Medium Severity Issues

---

**Issue**: No explicit status transition guard — invalid transitions are not blocked server-side
**Severity**: Medium
**Module**: Sales Orders / Production / Shipments
**Business Impact**: The status machine exists conceptually but is not enforced. A carefully crafted API call can move an order from CANCELLED to IN_PRODUCTION, or from DRAFT directly to SHIPPED. The UI prevents this, but the API does not.
**Example Scenario**: An integration partner's script sends `PATCH /api/sales-orders/SO-001/status` with `{status: "SHIPPED"}` while the order is in DRAFT. The API updates the status. Inventory is not deducted. Shipment is not created. The order shows as shipped but nothing has happened operationally.
**Recommended Fix**: Define an explicit transition matrix as a constant: `const ALLOWED_TRANSITIONS = { DRAFT: ['SUBMITTED', 'CANCELLED'], SUBMITTED: ['INVENTORY_CHECK', 'CANCELLED'], ... }`. Every status PATCH validates `newStatus in ALLOWED_TRANSITIONS[currentStatus]` and rejects with a 422 if not.

---

**Issue**: BOM allows multiple ACTIVE versions for the same product — no database constraint
**Severity**: Medium
**Module**: BOM / Production
**Business Impact**: Two simultaneous ACTIVE BOMs for the same product cause non-deterministic BOM selection in production. The system's fallback logic (ACTIVE BOM → any BOM) can silently use the wrong version, producing goods with incorrect specifications or material quantities.
**Recommended Fix**: Add a `UNIQUE(product_id)` partial index on `boms` where `status = 'ACTIVE'`. Or enforce this in the status transition: when activating a BOM, first archive all other ACTIVE BOMs for that product.

---

**Issue**: No unit of measure conversion between BOM components and purchase orders
**Severity**: Medium
**Module**: BOM / Procurement / Inventory
**Business Impact**: Fabric may be stocked in meters, ordered in rolls (100m per roll), and BOMs specify per-unit consumption in meters. The system cannot bridge these — all quantities must be manually converted before entry, introducing data entry errors.
**Recommended Fix**: Implement a `unit_conversions` table with `from_unit`, `to_unit`, `conversion_factor`. The BOM and PO modules use this to show equivalent quantities and validate conversions.

---

**Issue**: No inventory reconciliation (cycle count) workflow
**Severity**: Medium
**Module**: Inventory / Warehouse
**Business Impact**: The system's stock quantities will inevitably diverge from physical reality due to theft, damage, miscounts, and data entry errors. Without a periodic reconciliation process, variances accumulate silently. Financial inventory valuation becomes unreliable.
**Recommended Fix**: Implement cycle count workflow: select materials for counting → generate count sheets → enter physical counts → system calculates variances → approval to post variance adjustments with mandatory reason. Log all adjustments as stock movements with `reference_type = 'cycle_count'`.

---

**Issue**: No multi-warehouse or warehouse location tracking
**Severity**: Medium
**Module**: Inventory / Warehouse
**Business Impact**: All stock exists in a single undifferentiated location. Cannot support a manufacturing plant with a receiving bay, raw material store, work-in-progress floor, and finished goods warehouse. Inter-warehouse transfers, location-specific stock counts, and warehouse-level reporting are impossible.
**Recommended Fix**: Add `warehouses` and `warehouse_locations` tables. Add `location_id` to stock movements and inventory balances. Implement stock transfer transactions between locations.

---

**Issue**: No cost of goods sold (COGS) or inventory valuation method
**Severity**: Medium
**Module**: Finance / Inventory
**Business Impact**: Inventory on the balance sheet is valued at current selling price rather than actual cost. There is no weighted average cost, FIFO, or standard cost assigned to raw materials or finished goods. Gross margin per product is unknown. P&L cannot be calculated.
**Recommended Fix**: Add `unit_cost` to raw materials (updated on PO receipt using weighted average or FIFO). Add `standard_cost` to products (rolled up from BOM). On production completion, post COGS at standard cost. Create variance accounts for actual vs standard.

---

**Issue**: `updated_by` is not tracked on any record — only `created_by`
**Severity**: Medium
**Module**: Audit / All Modules
**Business Impact**: When a BOM, sales order, or inventory record is changed, there is no record of who made the change. Status transitions only log the new status, not the user who caused it. Fraud investigation and SOX compliance require this.
**Recommended Fix**: Add `updated_by` column to all business entity tables. Populate from the authenticated user on every PATCH/POST operation. This should be part of the same transaction as the record update.

---

**Issue**: No email or in-app notification system
**Severity**: Medium
**Module**: Operations / All Modules
**Business Impact**: Critical events (low stock, PO received, production complete, shipment delayed) produce no alerts. Staff must proactively check screens to discover state changes. This causes delayed responses and missed SLAs. The Notifications tab in the dashboard is disabled.
**Recommended Fix**: Implement an `events` / `notifications` table. Key triggers: stock below reorder point, production order overdue, shipment delayed, PO not received by expected date, QC rejection, credit limit breach. At minimum: in-app notification badge + email via SMTP.

---

**Issue**: No goods return (RMA) process
**Severity**: Medium
**Module**: Sales / Inventory / Finance
**Business Impact**: Customer returns are a reality in garment manufacturing. Without an RMA workflow, returned goods create a credit note debate, stock cannot be formally restocked or quarantined, and quality teams cannot track return reasons for improvement.
**Recommended Fix**: Implement `return_orders`: linked to original SO/Shipment, customer return reason, qty returned per product, QC inspection result, disposition (restock/scrap/rework), credit note generation.

---

**Issue**: No sales order amendment or revision tracking after submission
**Severity**: Medium
**Module**: Sales Orders
**Business Impact**: Customers routinely change orders — quantity adjustments, product swaps, delivery date changes. The system has no mechanism for this. Staff must cancel and recreate orders, losing history and disrupting production.
**Recommended Fix**: Implement SO amendments with revision numbers. An amendment creates a new version of the order lines with a reference to the previous version. If production is already started, amendments trigger a review workflow.

---

**Issue**: No delivery date promised to customer, no OTD (On-Time Delivery) tracking
**Severity**: Medium
**Module**: Sales Orders / Operations
**Business Impact**: Sales cannot commit a delivery date to customers. There is no system-calculated lead time (production lead time + shipping time). No KPI for delivery performance. H&M and Zara measure supplier OTD rigorously — breaches can result in chargebacks or delisted supplier status.
**Recommended Fix**: Add `requested_delivery_date` (from customer), `promised_delivery_date` (from sales), `actual_delivery_date` (from shipment). Calculate OTD % as delivered orders where `actual_delivery_date <= promised_delivery_date`. Flag at-risk orders where current date is within 2 days of promised date and order is not yet shipped.

---

**Issue**: No customer-specific pricing or volume discounts
**Severity**: Medium
**Module**: Sales / Finance
**Business Impact**: A single `price` on the product master is used for all customers and all quantities. In a B2B garment manufacturer, Zara gets different pricing than a local retailer. Volume orders get tiered discounts. Without this, sales staff manually override prices in the `unit_price` field of order lines with no validation or history.
**Recommended Fix**: Implement a `price_lists` table with customer-specific and volume-tier pricing. The order line creation auto-populates `unit_price` from the applicable price list. Sales Executives cannot override price beyond a defined discount % without manager approval.

---

**Issue**: No pagination on any list API endpoint
**Severity**: Medium
**Module**: All Modules / Performance
**Business Impact**: Every API returns the full dataset. A company with 10,000 sales orders will load all 10,000 on every page load. At scale, this causes browser crashes, slow response times, and server memory exhaustion.
**Recommended Fix**: Add `?page=1&limit=50` query parameters to all list endpoints. Return `{ data: [...], total: N, page: P, limit: L }`. Implement cursor-based pagination for high-frequency endpoints like `stock_movements`.

---

**Issue**: ID generation uses timestamp — two requests in the same millisecond create duplicate IDs
**Severity**: Medium
**Module**: Data Integrity / All Modules
**Business Impact**: Under normal concurrent use, ID collisions will occur. Two simultaneous sales order creations produce `so-1717344000000` twice. The second INSERT may succeed (SQLite allows it without a UNIQUE constraint), creating two records with the same primary key, or fail silently.
**Recommended Fix**: Replace `{prefix}-{Date.now()}` with UUIDs (`crypto.randomUUID()`) or a database sequence. For human-readable IDs, use a dedicated sequence table to generate `SO-2024-00001`.

---

## Low Severity Issues

---

**Issue**: No product categories or family classification
**Severity**: Low
**Module**: Products / Reporting
**Business Impact**: Cannot filter production, inventory, or sales reports by product line. Cannot set category-level reorder rules or pricing strategies.
**Recommended Fix**: Add `categories` master table. Products have `category_id` FK. All reports and filters support category grouping.

---

**Issue**: No document attachments on any entity
**Severity**: Low
**Module**: All Modules
**Business Impact**: Cannot attach supplier invoices to POs, quality certificates to production orders, customer PO documents to sales orders, or shipping documents to shipments. All document management is offline.
**Recommended Fix**: Implement file attachments table (`attachments`: entity_type, entity_id, filename, storage_path, uploaded_by, uploaded_at). Store files in object storage (S3-compatible).

---

**Issue**: No data export (CSV/Excel) from any module
**Severity**: Low
**Module**: Reporting / All Modules
**Business Impact**: Finance, operations, and sales teams routinely need to export data to Excel for analysis, board reporting, and external sharing. The absence of export forces manual data re-entry.
**Recommended Fix**: Add `?format=csv` query parameter to all list endpoints. Implement server-side CSV generation using a streaming response for large datasets.

---

**Issue**: No time zone configuration — all timestamps in local server time
**Severity**: Low
**Module**: All Modules
**Business Impact**: A manufacturer with factories and customers in different time zones sees inconsistent "created at" times. The 3PM Bangalore production completion shows as 9:30AM UTC in reports consumed by London finance.
**Recommended Fix**: Store all timestamps as UTC in the database. Add `timezone` to company configuration. Convert to user's local timezone in the UI using the browser's `Intl.DateTimeFormat`.

---

**Issue**: Mobile layout not optimized for shop floor use
**Severity**: Low
**Module**: MES / Production
**Business Impact**: The MES is used on the production floor where tablets are the standard device. Complex data tables are not responsive and are unusable on mobile screens. Production staff cannot update order status from the floor.
**Recommended Fix**: Implement a dedicated mobile-first MES view with large touch targets, simplified status buttons, and minimal data display. The `use-mobile.ts` hook is already implemented — wire it to conditional mobile layouts in the MES page.

---

## Summary Tables

### Missing Features

| # | Feature | Priority | Module |
|---|---|---|---|
| 1 | Finance / Accounting module (Invoicing, AR, AP, Payments) | P0 | Finance |
| 2 | Server-side authentication (JWT/sessions, password management) | P0 | Security |
| 3 | Sales order cancellation with stock release | P0 | Sales |
| 4 | Database-level concurrency control (row locking) | P0 | Inventory |
| 5 | Credit limit enforcement on order creation | P0 | Sales/Finance |
| 6 | Partial goods receipt on Purchase Orders | P0 | Procurement |
| 7 | Audit log population (every business action) | P0 | Compliance |
| 8 | Production scrap and rework workflows | P1 | Production |
| 9 | Quality inspection record (actual QC data capture) | P1 | Quality |
| 10 | BOM immutable versioning with history | P1 | BOM |
| 11 | Backorder creation and management | P1 | Sales |
| 12 | Formal approval workflow with authority matrix | P1 | All |
| 13 | Inventory reservation ledger (source-traced reservations) | P1 | Inventory |
| 14 | Production scheduling (dates, capacity, work centers) | P1 | Production |
| 15 | Automated reorder / replenishment suggestions | P1 | Procurement |
| 16 | Return / RMA workflow | P1 | Sales |
| 17 | Inventory reconciliation / cycle count | P1 | Inventory |
| 18 | Multi-warehouse / warehouse locations | P2 | Warehouse |
| 19 | COGS and inventory valuation (weighted avg / FIFO) | P1 | Finance |
| 20 | Email and in-app notification system | P1 | Operations |
| 21 | Customer pricing tiers and volume discounts | P2 | Sales |
| 22 | Delivery date commitment and OTD tracking | P1 | Sales/Ops |
| 23 | Sales order amendment and revision history | P2 | Sales |
| 24 | Supplier performance management | P2 | Procurement |
| 25 | 3-way matching (PO / GRN / Invoice) | P1 | Finance |
| 26 | API pagination | P1 | Architecture |
| 27 | Data export (CSV/Excel) | P2 | Reporting |
| 28 | Document attachments | P2 | All |
| 29 | Unit of measure conversions | P2 | BOM/Inventory |
| 30 | Mobile-optimized MES view | P2 | MES |

---

### Missing Workflows

| Workflow | Severity | Impact |
|---|---|---|
| Sales Order Cancellation (with cascading stock release) | Critical | Phantom reservations, locked inventory |
| Partial Shipment / Backorder Creation | High | Lost sales, customer dissatisfaction |
| Customer Return (RMA → Goods Receipt → QC → Restock/Scrap) | High | Inventory inaccuracy, credit note disputes |
| Purchase Order Partial Receipt (multi-delivery) | Critical | Stock records wrong, production delays |
| Production Scrap Recording | High | RM consumption wrong, cost understated |
| Rework Production Order | High | Hidden cost, defects shipped to customers |
| BOM Version Change Control (create new version, archive old) | High | Audit violation, production inconsistency |
| Cycle Count / Physical Inventory Reconciliation | Medium | Inventory variance undetected |
| Credit Hold Workflow (auto-hold orders when limit breached) | High | Bad debt accumulation |
| Approval Escalation Workflow (multi-level by value) | High | Fraud risk, segregation of duties violation |
| Goods in Transit Tracking (multi-leg shipments) | Medium | Customer visibility gap |
| Supplier Invoice Matching and Approval | Critical | Payment without verification |
| Inter-warehouse Transfer | Medium | Cannot move stock between locations |
| Automated Replenishment Trigger | High | Production stockouts |
| QC Rejection Routing (to rework or scrap) | High | Defective goods shipped |

---

### Missing Validations

| Validation | Severity | Module |
|---|---|---|
| Prevent order creation if credit limit exceeded | Critical | Sales |
| Block status transitions not in allowed matrix | High | All |
| Prevent ACTIVE BOM creation if another ACTIVE BOM exists for same product | High | BOM |
| Block deletion of customer/supplier with linked open records | High | Data Integrity |
| Validate `unit_price > 0` on order lines | Medium | Sales |
| Validate `qty > 0` on all order/BOM/PO lines | Medium | All |
| Prevent duplicate SO line items for the same product | Medium | Sales |
| Validate PO `expected_date` is in the future | Low | Procurement |
| Prevent production order creation with qty = 0 | Medium | Production |
| Block BOM component `qty_per_unit <= 0` | Medium | BOM |
| Validate stock adjustment reason is not blank | High | Inventory |
| Block SO approval if no BOM exists for any line item product | High | Sales/Production |
| Prevent shipment creation if SO is not in READY_TO_SHIP status | Medium | Shipments |
| Block manual production order completion if not in QUALITY_CHECK status | Medium | Production |
| Validate PO received qty does not exceed ordered qty per line | High | Procurement |

---

### Missing Statuses

| Entity | Missing Status | Purpose |
|---|---|---|
| Sales Order | `CREDIT_HOLD` | Auto-hold when customer exceeds credit limit |
| Sales Order | `PARTIALLY_FULFILLED` | Some lines shipped, some backlogged |
| Sales Order | `INVOICED` | Invoice sent to customer post-shipment |
| Sales Order | `PAID` | Payment received against invoice |
| Sales Order | `DISPUTED` | Customer has raised a dispute |
| Production Order | `AWAITING_MATERIALS` | Materials on order but not yet received |
| Production Order | `PARTIALLY_COMPLETED` | Part of the qty completed, rest pending |
| Shipment | `RETURNED` | No actual return flow exists to populate it |
| Shipment | `LOST` | Carrier has lost the shipment |
| Purchase Order | `PENDING_APPROVAL` | PO awaiting procurement manager approval |
| Purchase Order | `INVOICED` | Supplier invoice received against PO |
| Purchase Order | `PAID` | Supplier payment made |
| Raw Material | `QUARANTINED` | Received but held for QC inspection |
| Raw Material | `SCRAPPED` | Written off |
| BOM | `UNDER_REVIEW` | Submitted for engineering change review |

---

### Missing Database Entities

| Table | Purpose | Priority |
|---|---|---|
| `invoices` | Customer invoices linked to SO/Shipment | P0 |
| `invoice_lines` | Line items per invoice with quantity, price, tax | P0 |
| `payments` | Customer payment receipts against invoices | P0 |
| `supplier_invoices` | Supplier invoices linked to PO/GRN | P1 |
| `supplier_payments` | Payments to suppliers | P1 |
| `quality_inspections` | QC records per production order | P1 |
| `scrap_orders` | Scrap transactions with reason and material write-off | P1 |
| `rework_orders` | Rework jobs referencing a production order | P1 |
| `return_orders` | Customer returns (RMA) | P1 |
| `return_order_lines` | Line items per return | P1 |
| `inventory_reservations` | Source-traced reservation ledger | P0 |
| `approvals` | Approval workflow records for any approvable entity | P1 |
| `price_lists` | Customer-specific and volume-tier pricing | P2 |
| `price_list_lines` | Per-product prices in a price list | P2 |
| `warehouses` | Warehouse master (multiple locations) | P2 |
| `warehouse_locations` | Bin/rack/shelf within warehouse | P2 |
| `stock_transfers` | Inter-warehouse / inter-location transfers | P2 |
| `work_centers` | Production work centers with capacity | P1 |
| `production_schedule` | Scheduled time slots per production order | P1 |
| `notifications` | In-app notification queue | P1 |
| `bom_versions` | Immutable historical BOM snapshots | P1 |
| `cycle_counts` | Inventory count sessions | P2 |
| `cycle_count_lines` | Per-material count vs system qty | P2 |
| `replenishment_suggestions` | Auto-generated reorder suggestions | P1 |
| `attachments` | Document/file attachments for any entity | P2 |
| `so_amendments` | Sales order revision history | P2 |
| `delivery_commitments` | Promised delivery dates per SO | P1 |
| `supplier_price_lists` | Supplier-quoted prices per material | P2 |
| `tax_rates` | Tax configuration (GST slabs, etc.) | P1 |

---

### Missing Reports and Dashboards

| Report | Module | Priority |
|---|---|---|
| Inventory Aging Report (stock age by receipt date) | Inventory | P0 |
| Stock Valuation Report (by FIFO/weighted avg cost) | Finance | P0 |
| AR Aging Report (outstanding customer invoices by age) | Finance | P0 |
| AP Aging Report (outstanding supplier invoices by age) | Finance | P0 |
| Gross Margin by Product (revenue minus COGS) | Finance | P0 |
| Production Efficiency Report (planned vs actual qty, time) | Production | P1 |
| Scrap / Yield Report (scrap rate by product / period) | Production | P1 |
| On-Time Delivery Report (OTD % by customer, period) | Sales | P1 |
| Sales Order Fulfillment Rate (orders fully filled vs partial) | Sales | P1 |
| Purchase Order Lead Time Actuals (ordered vs received date) | Procurement | P1 |
| Supplier Performance Scorecard | Procurement | P1 |
| BOM Cost Rollup Report (standard cost per product) | Finance | P1 |
| Low Stock / Stockout Risk Report | Inventory | P1 |
| Production Schedule / Gantt View | Production | P1 |
| Customer Revenue Ranking (Pareto) | Sales | P2 |
| Material Consumption Analysis (actual vs standard) | Production | P2 |
| Open Backorders Report | Sales | P1 |
| Quality Defect Rate Report (by product, defect type) | Quality | P1 |
| Cash Flow Forecast (AR expected receipts vs AP payments due) | Finance | P0 |

---

## Recommended Roadmap

### P0 — Production Blocker (implement before going live)

1. Replace localStorage auth with server-side sessions, password hashing (bcrypt), and HTTPS-only cookies
2. Fix double stock deduction bug — choose one authoritative deduction point, reconcile existing data
3. Implement audit log population for every API mutation
4. Add status transition matrix enforcement server-side
5. Sales order cancellation with cascading reservation release
6. Fix partial PO receipt — `PARTIALLY_RECEIVED` status, per-line received quantities
7. Enforce credit limit on order creation
8. Unique ID generation (UUIDs or sequential IDs) replacing timestamp-based IDs
9. Remove hard deletes from master data — replace with soft-delete + FK validation
10. Finance module MVP: Invoice creation, basic AR tracking, payment recording

### P1 — First Production Release (within 3 months)

11. Immutable BOM versioning
12. Quality inspection records (actual QC data capture)
13. Scrap and rework production workflows
14. Production order scheduling (dates, work centers)
15. Inventory reservation ledger (source-traced)
16. Backorder creation and management
17. Approval workflow matrix (value-based escalation)
18. Automated replenishment suggestions
19. Email and in-app notifications
20. Delivery date commitment and OTD tracking
21. 3-way matching (PO / GRN / Supplier Invoice)
22. API pagination on all list endpoints
23. Inventory cycle count workflow
24. COGS and weighted average cost tracking
25. Tax configuration (GST / VAT)

### P2 — Operational Excellence (within 6 months)

26. Multi-warehouse and location management
27. Stock transfer workflow
28. Customer RMA and return workflow
29. Customer pricing tiers and volume discounts
30. Sales order amendment and revision history
31. Supplier performance management and scorecard
32. Advanced production scheduling (Gantt, capacity loading)
33. Mobile-optimized MES for shop floor tablets
34. Data export (CSV/Excel) from all modules
35. Document attachments across all entities
36. Unit of measure conversion framework
37. Full reporting suite (all reports listed above)

---

## Critical Issues Summary

| # | Issue | Severity |
|---|---|---|
| 1 | Double stock deduction for shipped orders | Critical |
| 2 | localStorage authentication — trivially bypassed | Critical |
| 3 | `audit_logs` table never written to | Critical |
| 4 | Race condition on concurrent stock reservations | Critical |
| 5 | Customer credit limit never enforced | Critical |
| 6 | CANCELLED status has no implementation | Critical |
| 7 | Production Order and Purchase Order ID namespace collision | Critical |
| 8 | PO receive always full receipt — PARTIALLY_RECEIVED never set | Critical |
| 9 | Finance module entirely absent | Critical |
| 10 | No backorder handling | High |
| 11 | No approval authority matrix | High |
| 12 | BOM update destroys version history | High |
| 13 | Reserved stock not source-traced | High |
| 14 | QC is a status, not a data capture | High |
| 15 | Hard deletes with no referential integrity check | High |
| 16 | DELIVERED shipment can be cancelled, restoring phantom stock | High |
| 17 | No production scheduling or capacity management | High |
| 18 | No automated reorder triggers | High |
| 19 | Stock movements have no FK to originating document | High |

---

*End of Gap Analysis Report*
