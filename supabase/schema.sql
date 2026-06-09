-- ERP Prototype — Supabase / PostgreSQL Schema
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)

-- ── Core master data ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT,
  email TEXT,
  address TEXT,
  credit_limit DOUBLE PRECISION DEFAULT 0,
  payment_terms TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT,
  lead_time_days INTEGER DEFAULT 7,
  payment_terms TEXT,
  deleted_at TIMESTAMPTZ,
  is_active INTEGER DEFAULT 1,
  on_time_delivery_rate DOUBLE PRECISION DEFAULT 0,
  quality_rating DOUBLE PRECISION DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT,
  unit_of_measure TEXT DEFAULT 'pcs',
  price DOUBLE PRECISION DEFAULT 0,
  bom_id TEXT,
  current_stock DOUBLE PRECISION DEFAULT 0,
  reserved_stock DOUBLE PRECISION DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  is_active INTEGER DEFAULT 1,
  unit_cost DOUBLE PRECISION DEFAULT 0,
  standard_cost DOUBLE PRECISION DEFAULT 0,
  category TEXT,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS raw_materials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT,
  current_stock DOUBLE PRECISION DEFAULT 0,
  reserved_stock DOUBLE PRECISION DEFAULT 0,
  reorder_point DOUBLE PRECISION DEFAULT 0,
  supplier_id TEXT REFERENCES suppliers(id),
  deleted_at TIMESTAMPTZ,
  is_active INTEGER DEFAULT 1,
  unit_cost DOUBLE PRECISION DEFAULT 0
);

-- ── BOMs ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS boms (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  version TEXT DEFAULT 'v1.0',
  status TEXT DEFAULT 'DRAFT',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  updated_at TIMESTAMPTZ,
  parent_bom_id TEXT
);

CREATE TABLE IF NOT EXISTS bom_components (
  id BIGSERIAL PRIMARY KEY,
  bom_id TEXT NOT NULL REFERENCES boms(id),
  material_id TEXT NOT NULL REFERENCES raw_materials(id),
  qty_per_unit DOUBLE PRECISION NOT NULL
);

-- ── Sales orders ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT DEFAULT 'DRAFT',
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  tracking_number TEXT,
  carrier TEXT,
  requested_delivery_date TIMESTAMPTZ,
  promised_delivery_date TIMESTAMPTZ,
  actual_delivery_date TIMESTAMPTZ,
  parent_order_id TEXT,
  revision_number INTEGER DEFAULT 1,
  credit_check_passed INTEGER DEFAULT 0,
  approval_status TEXT DEFAULT 'PENDING'
);

CREATE TABLE IF NOT EXISTS sales_order_lines (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES sales_orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  qty DOUBLE PRECISION NOT NULL,
  unit_price DOUBLE PRECISION NOT NULL,
  fulfilled_qty DOUBLE PRECISION DEFAULT 0,
  gst_rate DOUBLE PRECISION
);

-- ── Production ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS production_orders (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT,
  product_id TEXT NOT NULL REFERENCES products(id),
  qty DOUBLE PRECISION NOT NULL,
  status TEXT DEFAULT 'PLANNED',
  bom_id TEXT NOT NULL REFERENCES boms(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  planned_start TIMESTAMPTZ,
  planned_end TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  work_center_id TEXT,
  produced_qty DOUBLE PRECISION DEFAULT 0,
  scrapped_qty DOUBLE PRECISION DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT REFERENCES sales_orders(id),
  status TEXT DEFAULT 'READY_TO_SHIP',
  tracking_number TEXT,
  carrier TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Inventory ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  delta DOUBLE PRECISION NOT NULL,
  reason TEXT,
  reference_type TEXT,
  reference_id TEXT,
  created_by TEXT DEFAULT 'System',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reserved_qty DOUBLE PRECISION NOT NULL,
  reservation_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  is_active INTEGER DEFAULT 1
);

-- ── Users & Auth ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  role TEXT DEFAULT 'Viewer',
  status TEXT DEFAULT 'Active',
  last_login TIMESTAMPTZ DEFAULT NOW(),
  password_hash TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT
);

-- ── Purchase orders ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  status TEXT DEFAULT 'DRAFT',
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expected_date TIMESTAMPTZ,
  updated_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES purchase_orders(id),
  material_id TEXT NOT NULL REFERENCES raw_materials(id),
  qty DOUBLE PRECISION NOT NULL,
  unit_price DOUBLE PRECISION NOT NULL,
  received_qty DOUBLE PRECISION DEFAULT 0
);

-- ── Audit & Notifications ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_state TEXT,
  after_state TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  role TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Invoicing (AR) ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT,
  shipment_id TEXT,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT DEFAULT 'DRAFT',
  issue_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  subtotal DOUBLE PRECISION DEFAULT 0,
  tax_amount DOUBLE PRECISION DEFAULT 0,
  total DOUBLE PRECISION DEFAULT 0,
  paid_amount DOUBLE PRECISION DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id BIGSERIAL PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  product_id TEXT,
  description TEXT,
  qty DOUBLE PRECISION NOT NULL,
  unit_price DOUBLE PRECISION NOT NULL,
  tax_rate DOUBLE PRECISION DEFAULT 0,
  line_total DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  amount DOUBLE PRECISION NOT NULL,
  payment_date TIMESTAMPTZ NOT NULL,
  method TEXT DEFAULT 'Bank Transfer',
  reference TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Supplier invoicing (AP) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  status TEXT DEFAULT 'RECEIVED',
  invoice_number TEXT,
  invoice_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  subtotal DOUBLE PRECISION DEFAULT 0,
  tax_amount DOUBLE PRECISION DEFAULT 0,
  total DOUBLE PRECISION DEFAULT 0,
  paid_amount DOUBLE PRECISION DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY,
  supplier_invoice_id TEXT NOT NULL REFERENCES supplier_invoices(id),
  supplier_id TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  payment_date TIMESTAMPTZ NOT NULL,
  method TEXT DEFAULT 'Bank Transfer',
  reference TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Quality & Rework ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quality_inspections (
  id TEXT PRIMARY KEY,
  production_order_id TEXT NOT NULL REFERENCES production_orders(id),
  inspector_id TEXT,
  inspected_at TIMESTAMPTZ,
  produced_qty DOUBLE PRECISION NOT NULL,
  passed_qty DOUBLE PRECISION NOT NULL,
  rejected_qty DOUBLE PRECISION DEFAULT 0,
  defect_codes TEXT,
  notes TEXT,
  status TEXT DEFAULT 'PENDING',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scrap_orders (
  id TEXT PRIMARY KEY,
  production_order_id TEXT,
  quality_inspection_id TEXT,
  product_id TEXT,
  qty_scrapped DOUBLE PRECISION NOT NULL,
  scrap_reason TEXT NOT NULL,
  material_cost_written_off DOUBLE PRECISION DEFAULT 0,
  disposed_by TEXT,
  disposed_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rework_orders (
  id TEXT PRIMARY KEY,
  original_production_order_id TEXT,
  quality_inspection_id TEXT,
  product_id TEXT NOT NULL,
  qty DOUBLE PRECISION NOT NULL,
  status TEXT DEFAULT 'PENDING',
  rework_reason TEXT,
  work_center_id TEXT,
  planned_start TIMESTAMPTZ,
  planned_end TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Returns (RMA) ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS return_orders (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT,
  shipment_id TEXT,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT DEFAULT 'REQUESTED',
  return_reason TEXT,
  return_type TEXT DEFAULT 'CUSTOMER_RETURN',
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS return_order_lines (
  id BIGSERIAL PRIMARY KEY,
  return_order_id TEXT NOT NULL REFERENCES return_orders(id),
  product_id TEXT NOT NULL,
  qty DOUBLE PRECISION NOT NULL,
  received_qty DOUBLE PRECISION DEFAULT 0,
  condition TEXT DEFAULT 'UNKNOWN',
  disposition TEXT DEFAULT 'PENDING'
);

-- ── Approvals ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  required_role TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Warehouse & Locations ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS work_centers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capacity_per_day DOUBLE PRECISION DEFAULT 8,
  unit TEXT DEFAULT 'hours',
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_locations (
  id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'STORAGE',
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY,
  from_location_id TEXT,
  to_location_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  qty DOUBLE PRECISION NOT NULL,
  status TEXT DEFAULT 'DRAFT',
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ── Pricing ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  customer_id TEXT,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  is_active INTEGER DEFAULT 1,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_list_lines (
  id BIGSERIAL PRIMARY KEY,
  price_list_id TEXT NOT NULL REFERENCES price_lists(id),
  product_id TEXT NOT NULL,
  unit_price DOUBLE PRECISION NOT NULL,
  min_qty DOUBLE PRECISION DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tax_rates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rate DOUBLE PRECISION NOT NULL,
  applies_to TEXT DEFAULT 'ALL',
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_price_history (
  id BIGSERIAL PRIMARY KEY,
  material_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  unit_price DOUBLE PRECISION NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  purchase_order_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Cycle counts ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cycle_counts (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT DEFAULT 'DRAFT',
  entity_type TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS cycle_count_lines (
  id BIGSERIAL PRIMARY KEY,
  cycle_count_id TEXT NOT NULL REFERENCES cycle_counts(id),
  entity_id TEXT NOT NULL,
  system_qty DOUBLE PRECISION NOT NULL,
  counted_qty DOUBLE PRECISION,
  variance DOUBLE PRECISION,
  counted_by TEXT,
  counted_at TIMESTAMPTZ
);

-- ── Replenishment ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS replenishment_suggestions (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  current_stock DOUBLE PRECISION NOT NULL,
  reorder_point DOUBLE PRECISION NOT NULL,
  suggested_qty DOUBLE PRECISION NOT NULL,
  supplier_id TEXT,
  status TEXT DEFAULT 'OPEN',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  actioned_at TIMESTAMPTZ,
  actioned_by TEXT
);

-- ── SO amendments ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS so_amendments (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id),
  revision_number INTEGER NOT NULL,
  changed_by TEXT,
  change_summary TEXT,
  before_state TEXT,
  after_state TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unit_conversions (
  id BIGSERIAL PRIMARY KEY,
  from_unit TEXT NOT NULL,
  to_unit TEXT NOT NULL,
  factor DOUBLE PRECISION NOT NULL,
  UNIQUE(from_unit, to_unit)
);

-- ── Default reference data ────────────────────────────────────────────────────

INSERT INTO work_centers (id, name, capacity_per_day, unit) VALUES
  ('wc-1', 'Cutting',   8, 'hours'),
  ('wc-2', 'Stitching', 8, 'hours'),
  ('wc-3', 'Finishing', 8, 'hours'),
  ('wc-4', 'Packaging', 8, 'hours')
ON CONFLICT (id) DO NOTHING;

INSERT INTO warehouses (id, name, address) VALUES
  ('wh-1', 'Main Warehouse', 'ShirtCo Factory, MIDC, Pune 411019')
ON CONFLICT (id) DO NOTHING;

INSERT INTO warehouse_locations (id, warehouse_id, name, type) VALUES
  ('wl-1', 'wh-1', 'Receiving Bay',        'RECEIVING'),
  ('wl-2', 'wh-1', 'Raw Material Store',   'STORAGE'),
  ('wl-3', 'wh-1', 'WIP Floor',            'WIP'),
  ('wl-4', 'wh-1', 'Finished Goods Store', 'STORAGE'),
  ('wl-5', 'wh-1', 'Dispatch Bay',         'DISPATCH')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tax_rates (id, name, rate, applies_to) VALUES
  ('tax-gst18', 'GST 18%',   18, 'products'),
  ('tax-gst12', 'GST 12%',   12, 'products'),
  ('tax-gst5',  'GST 5%',     5, 'products'),
  ('tax-exempt','Tax Exempt', 0, 'ALL')
ON CONFLICT (id) DO NOTHING;
