import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

const DB_DIR = path.join(process.cwd(), "data")
const DB_PATH = path.join(DB_DIR, "erp.db")

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  _db = new Database(DB_PATH)
  _db.pragma("journal_mode = WAL")
  _db.pragma("foreign_keys = ON")
  initSchema(_db)
  runMigrations(_db)
  return _db
}

// ─── Safe column addition helper ──────────────────────────────────────────────
function addCol(db: Database.Database, table: string, col: string, def: string) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`) } catch { /* already exists */ }
}

// ─── Initial schema (v1 — preserved as-is) ────────────────────────────────────
function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT,
      email TEXT,
      address TEXT,
      credit_limit REAL DEFAULT 0,
      payment_terms TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT,
      lead_time_days INTEGER DEFAULT 7,
      payment_terms TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT,
      unit_of_measure TEXT DEFAULT 'pcs',
      price REAL DEFAULT 0,
      bom_id TEXT,
      current_stock REAL DEFAULT 0,
      reserved_stock REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS raw_materials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT,
      current_stock REAL DEFAULT 0,
      reserved_stock REAL DEFAULT 0,
      reorder_point REAL DEFAULT 0,
      supplier_id TEXT,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS boms (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      version TEXT DEFAULT 'v1.0',
      status TEXT DEFAULT 'DRAFT',
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS bom_components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bom_id TEXT NOT NULL,
      material_id TEXT NOT NULL,
      qty_per_unit REAL NOT NULL,
      FOREIGN KEY (bom_id) REFERENCES boms(id),
      FOREIGN KEY (material_id) REFERENCES raw_materials(id)
    );

    CREATE TABLE IF NOT EXISTS sales_orders (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      status TEXT DEFAULT 'DRAFT',
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS sales_order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      qty REAL NOT NULL,
      unit_price REAL NOT NULL,
      fulfilled_qty REAL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES sales_orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS production_orders (
      id TEXT PRIMARY KEY,
      sales_order_id TEXT,
      product_id TEXT NOT NULL,
      qty REAL NOT NULL,
      status TEXT DEFAULT 'PLANNED',
      bom_id TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (bom_id) REFERENCES boms(id)
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      sales_order_id TEXT,
      status TEXT DEFAULT 'READY_TO_SHIP',
      tracking_number TEXT,
      carrier TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      delta REAL NOT NULL,
      reason TEXT,
      reference_type TEXT,
      reference_id TEXT,
      created_by TEXT DEFAULT 'System',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      role TEXT DEFAULT 'Viewer',
      status TEXT DEFAULT 'Active',
      last_login TEXT DEFAULT (datetime('now')),
      password_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL,
      status TEXT DEFAULT 'DRAFT',
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      expected_date TEXT,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      material_id TEXT NOT NULL,
      qty REAL NOT NULL,
      unit_price REAL NOT NULL,
      received_qty REAL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES purchase_orders(id),
      FOREIGN KEY (material_id) REFERENCES raw_materials(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      before_state TEXT,
      after_state TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS _seed_done (done INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, ran_at TEXT DEFAULT (datetime('now')));
  `)

  const seeded = db.prepare("SELECT done FROM _seed_done LIMIT 1").get() as { done: number } | undefined
  if (!seeded) {
    seedDatabase(db)
    db.prepare("INSERT INTO _seed_done (done) VALUES (1)").run()
  }
}

// ─── Incremental migrations (v2+) ─────────────────────────────────────────────
function runMigrations(db: Database.Database) {
  const ran = new Set(
    (db.prepare("SELECT version FROM _migrations").all() as { version: number }[]).map(r => r.version)
  )

  // v2: soft-delete + extended fields on master data
  if (!ran.has(2)) {
    addCol(db, "customers",          "deleted_at",               "TEXT")
    addCol(db, "customers",          "is_active",                "INTEGER DEFAULT 1")
    addCol(db, "suppliers",          "deleted_at",               "TEXT")
    addCol(db, "suppliers",          "is_active",                "INTEGER DEFAULT 1")
    addCol(db, "suppliers",          "on_time_delivery_rate",    "REAL DEFAULT 0")
    addCol(db, "suppliers",          "quality_rating",           "REAL DEFAULT 0")
    addCol(db, "products",           "deleted_at",               "TEXT")
    addCol(db, "products",           "is_active",                "INTEGER DEFAULT 1")
    addCol(db, "products",           "unit_cost",                "REAL DEFAULT 0")
    addCol(db, "products",           "standard_cost",            "REAL DEFAULT 0")
    addCol(db, "products",           "category",                 "TEXT")
    addCol(db, "raw_materials",      "deleted_at",               "TEXT")
    addCol(db, "raw_materials",      "is_active",                "INTEGER DEFAULT 1")
    addCol(db, "raw_materials",      "unit_cost",                "REAL DEFAULT 0")
    addCol(db, "boms",               "updated_by",               "TEXT")
    addCol(db, "boms",               "updated_at",               "TEXT")
    addCol(db, "boms",               "parent_bom_id",            "TEXT")
    addCol(db, "sales_orders",       "updated_by",               "TEXT")
    addCol(db, "sales_orders",       "requested_delivery_date",  "TEXT")
    addCol(db, "sales_orders",       "promised_delivery_date",   "TEXT")
    addCol(db, "sales_orders",       "actual_delivery_date",     "TEXT")
    addCol(db, "sales_orders",       "parent_order_id",          "TEXT")
    addCol(db, "sales_orders",       "revision_number",          "INTEGER DEFAULT 1")
    addCol(db, "sales_orders",       "credit_check_passed",      "INTEGER DEFAULT 0")
    addCol(db, "sales_orders",       "approval_status",          "TEXT DEFAULT 'PENDING'")
    addCol(db, "production_orders",  "updated_by",               "TEXT")
    addCol(db, "production_orders",  "planned_start",            "TEXT")
    addCol(db, "production_orders",  "planned_end",              "TEXT")
    addCol(db, "production_orders",  "actual_start",             "TEXT")
    addCol(db, "production_orders",  "actual_end",               "TEXT")
    addCol(db, "production_orders",  "work_center_id",           "TEXT")
    addCol(db, "production_orders",  "produced_qty",             "REAL DEFAULT 0")
    addCol(db, "production_orders",  "scrapped_qty",             "REAL DEFAULT 0")
    addCol(db, "purchase_orders",    "updated_by",               "TEXT")
    addCol(db, "purchase_orders",    "approved_by",              "TEXT")
    addCol(db, "purchase_orders",    "approved_at",              "TEXT")
    addCol(db, "stock_movements",    "reference_type",           "TEXT")
    addCol(db, "stock_movements",    "reference_id",             "TEXT")
    addCol(db, "users",              "password_hash",            "TEXT")
    addCol(db, "sales_order_lines",  "fulfilled_qty",            "REAL DEFAULT 0")
    db.prepare("INSERT OR IGNORE INTO _migrations (version) VALUES (2)").run()
  }

  // v3: new feature tables
  if (!ran.has(3)) {
    db.exec(`
      -- Server-side auth sessions
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        ip_address TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      -- Customer invoices
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        sales_order_id TEXT,
        shipment_id TEXT,
        customer_id TEXT NOT NULL,
        status TEXT DEFAULT 'DRAFT',
        issue_date TEXT,
        due_date TEXT,
        subtotal REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        total REAL DEFAULT 0,
        paid_amount REAL DEFAULT 0,
        notes TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );

      CREATE TABLE IF NOT EXISTS invoice_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id TEXT NOT NULL,
        product_id TEXT,
        description TEXT,
        qty REAL NOT NULL,
        unit_price REAL NOT NULL,
        tax_rate REAL DEFAULT 0,
        line_total REAL NOT NULL,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_date TEXT NOT NULL,
        method TEXT DEFAULT 'Bank Transfer',
        reference TEXT,
        notes TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (invoice_id) REFERENCES invoices(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );

      -- Supplier invoices (AP)
      CREATE TABLE IF NOT EXISTS supplier_invoices (
        id TEXT PRIMARY KEY,
        purchase_order_id TEXT,
        supplier_id TEXT NOT NULL,
        status TEXT DEFAULT 'RECEIVED',
        invoice_number TEXT,
        invoice_date TEXT,
        due_date TEXT,
        subtotal REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        total REAL DEFAULT 0,
        paid_amount REAL DEFAULT 0,
        notes TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      );

      CREATE TABLE IF NOT EXISTS supplier_payments (
        id TEXT PRIMARY KEY,
        supplier_invoice_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_date TEXT NOT NULL,
        method TEXT DEFAULT 'Bank Transfer',
        reference TEXT,
        notes TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (supplier_invoice_id) REFERENCES supplier_invoices(id)
      );

      -- Quality inspections
      CREATE TABLE IF NOT EXISTS quality_inspections (
        id TEXT PRIMARY KEY,
        production_order_id TEXT NOT NULL,
        inspector_id TEXT,
        inspected_at TEXT,
        produced_qty REAL NOT NULL,
        passed_qty REAL NOT NULL,
        rejected_qty REAL DEFAULT 0,
        defect_codes TEXT,
        notes TEXT,
        status TEXT DEFAULT 'PENDING',
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (production_order_id) REFERENCES production_orders(id)
      );

      -- Scrap orders
      CREATE TABLE IF NOT EXISTS scrap_orders (
        id TEXT PRIMARY KEY,
        production_order_id TEXT,
        quality_inspection_id TEXT,
        product_id TEXT,
        qty_scrapped REAL NOT NULL,
        scrap_reason TEXT NOT NULL,
        material_cost_written_off REAL DEFAULT 0,
        disposed_by TEXT,
        disposed_at TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Rework orders
      CREATE TABLE IF NOT EXISTS rework_orders (
        id TEXT PRIMARY KEY,
        original_production_order_id TEXT,
        quality_inspection_id TEXT,
        product_id TEXT NOT NULL,
        qty REAL NOT NULL,
        status TEXT DEFAULT 'PENDING',
        rework_reason TEXT,
        work_center_id TEXT,
        planned_start TEXT,
        planned_end TEXT,
        completed_at TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Return orders (RMA)
      CREATE TABLE IF NOT EXISTS return_orders (
        id TEXT PRIMARY KEY,
        sales_order_id TEXT,
        shipment_id TEXT,
        customer_id TEXT NOT NULL,
        status TEXT DEFAULT 'REQUESTED',
        return_reason TEXT,
        return_type TEXT DEFAULT 'CUSTOMER_RETURN',
        notes TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );

      CREATE TABLE IF NOT EXISTS return_order_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        return_order_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        qty REAL NOT NULL,
        received_qty REAL DEFAULT 0,
        condition TEXT DEFAULT 'UNKNOWN',
        disposition TEXT DEFAULT 'PENDING',
        FOREIGN KEY (return_order_id) REFERENCES return_orders(id)
      );

      -- Source-traced inventory reservation ledger
      CREATE TABLE IF NOT EXISTS inventory_reservations (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        reserved_qty REAL NOT NULL,
        reservation_type TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        reference_type TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        released_at TEXT,
        is_active INTEGER DEFAULT 1
      );

      -- Approval workflow
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        required_role TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        approved_by TEXT,
        approved_at TEXT,
        rejected_by TEXT,
        rejected_at TEXT,
        rejection_reason TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- In-app notifications
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
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Work centers
      CREATE TABLE IF NOT EXISTS work_centers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        capacity_per_day REAL DEFAULT 8,
        unit TEXT DEFAULT 'hours',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Warehouses
      CREATE TABLE IF NOT EXISTS warehouses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS warehouse_locations (
        id TEXT PRIMARY KEY,
        warehouse_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'STORAGE',
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
      );

      -- Stock transfers between warehouses
      CREATE TABLE IF NOT EXISTS stock_transfers (
        id TEXT PRIMARY KEY,
        from_location_id TEXT,
        to_location_id TEXT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        qty REAL NOT NULL,
        status TEXT DEFAULT 'DRAFT',
        notes TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      );

      -- Customer price lists
      CREATE TABLE IF NOT EXISTS price_lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        customer_id TEXT,
        valid_from TEXT,
        valid_to TEXT,
        is_active INTEGER DEFAULT 1,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS price_list_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        price_list_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        unit_price REAL NOT NULL,
        min_qty REAL DEFAULT 1,
        FOREIGN KEY (price_list_id) REFERENCES price_lists(id)
      );

      -- Cycle counts (physical inventory)
      CREATE TABLE IF NOT EXISTS cycle_counts (
        id TEXT PRIMARY KEY,
        name TEXT,
        status TEXT DEFAULT 'DRAFT',
        entity_type TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS cycle_count_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle_count_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        system_qty REAL NOT NULL,
        counted_qty REAL,
        variance REAL,
        counted_by TEXT,
        counted_at TEXT,
        FOREIGN KEY (cycle_count_id) REFERENCES cycle_counts(id)
      );

      -- Replenishment suggestions
      CREATE TABLE IF NOT EXISTS replenishment_suggestions (
        id TEXT PRIMARY KEY,
        material_id TEXT NOT NULL,
        current_stock REAL NOT NULL,
        reorder_point REAL NOT NULL,
        suggested_qty REAL NOT NULL,
        supplier_id TEXT,
        status TEXT DEFAULT 'OPEN',
        created_at TEXT DEFAULT (datetime('now')),
        actioned_at TEXT,
        actioned_by TEXT
      );

      -- SO amendments (revision history)
      CREATE TABLE IF NOT EXISTS so_amendments (
        id TEXT PRIMARY KEY,
        sales_order_id TEXT NOT NULL,
        revision_number INTEGER NOT NULL,
        changed_by TEXT,
        change_summary TEXT,
        before_state TEXT,
        after_state TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id)
      );

      -- Unit of measure conversions
      CREATE TABLE IF NOT EXISTS unit_conversions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_unit TEXT NOT NULL,
        to_unit TEXT NOT NULL,
        factor REAL NOT NULL,
        UNIQUE(from_unit, to_unit)
      );

      -- Tax rates
      CREATE TABLE IF NOT EXISTS tax_rates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rate REAL NOT NULL,
        applies_to TEXT DEFAULT 'ALL',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Supplier price history
      CREATE TABLE IF NOT EXISTS supplier_price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id TEXT NOT NULL,
        supplier_id TEXT NOT NULL,
        unit_price REAL NOT NULL,
        effective_from TEXT NOT NULL,
        purchase_order_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `)
    db.prepare("INSERT OR IGNORE INTO _migrations (version) VALUES (3)").run()
  }

  // v4: seed work centers and default warehouse
  if (!ran.has(4)) {
    const now = new Date().toISOString()
    const seedWC = db.prepare("INSERT OR IGNORE INTO work_centers (id, name, capacity_per_day, unit) VALUES (?,?,?,?)")
    seedWC.run("wc-1", "Cutting",   8, "hours")
    seedWC.run("wc-2", "Stitching", 8, "hours")
    seedWC.run("wc-3", "Finishing", 8, "hours")
    seedWC.run("wc-4", "Packaging", 8, "hours")

    db.prepare("INSERT OR IGNORE INTO warehouses (id, name, address) VALUES (?,?,?)").run(
      "wh-1", "Main Warehouse", "ShirtCo Factory, MIDC, Pune 411019"
    )
    db.prepare("INSERT OR IGNORE INTO warehouse_locations (id, warehouse_id, name, type) VALUES (?,?,?,?)").run("wl-1", "wh-1", "Receiving Bay", "RECEIVING")
    db.prepare("INSERT OR IGNORE INTO warehouse_locations (id, warehouse_id, name, type) VALUES (?,?,?,?)").run("wl-2", "wh-1", "Raw Material Store", "STORAGE")
    db.prepare("INSERT OR IGNORE INTO warehouse_locations (id, warehouse_id, name, type) VALUES (?,?,?,?)").run("wl-3", "wh-1", "WIP Floor",          "WIP")
    db.prepare("INSERT OR IGNORE INTO warehouse_locations (id, warehouse_id, name, type) VALUES (?,?,?,?)").run("wl-4", "wh-1", "Finished Goods Store","STORAGE")
    db.prepare("INSERT OR IGNORE INTO warehouse_locations (id, warehouse_id, name, type) VALUES (?,?,?,?)").run("wl-5", "wh-1", "Dispatch Bay",       "DISPATCH")

    db.prepare("INSERT OR IGNORE INTO tax_rates (id, name, rate, applies_to) VALUES (?,?,?,?)").run("tax-gst18", "GST 18%", 18, "products")
    db.prepare("INSERT OR IGNORE INTO tax_rates (id, name, rate, applies_to) VALUES (?,?,?,?)").run("tax-gst12", "GST 12%", 12, "products")
    db.prepare("INSERT OR IGNORE INTO tax_rates (id, name, rate, applies_to) VALUES (?,?,?,?)").run("tax-gst5",  "GST 5%",  5,  "products")
    db.prepare("INSERT OR IGNORE INTO tax_rates (id, name, rate, applies_to) VALUES (?,?,?,?)").run("tax-exempt","Tax Exempt", 0, "ALL")

    db.prepare("INSERT OR IGNORE INTO _migrations (version) VALUES (4)").run()
  }
}

// ─── Seed data ────────────────────────────────────────────────────────────────
import {
  customers, products, rawMaterials, suppliers, users, boms, salesOrders, productionOrders, shipments,
} from "./seed"

function seedDatabase(db: Database.Database) {
  const now = new Date().toISOString()

  const insSupplier = db.prepare("INSERT OR IGNORE INTO suppliers (id,name,contact,lead_time_days,payment_terms) VALUES (?,?,?,?,?)")
  suppliers.forEach(s => insSupplier.run(s.id, s.name, s.contact, s.leadTimeDays, s.paymentTerms))

  const insCustomer = db.prepare("INSERT OR IGNORE INTO customers (id,name,contact,email,address,credit_limit,payment_terms,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
  customers.forEach(c => insCustomer.run(c.id, c.name, c.contact, c.email, c.address, c.creditLimit, c.paymentTerms, now, now))

  const insUser = db.prepare("INSERT OR IGNORE INTO users (id,name,email,role,status,last_login,password_hash) VALUES (?,?,?,?,?,?,?)")
  users.forEach(u => insUser.run(u.id, u.name, u.email, u.role, u.status, u.lastLogin, u.passwordHash ?? null))

  const insProduct = db.prepare("INSERT OR IGNORE INTO products (id,name,sku,unit_of_measure,price,bom_id,current_stock,reserved_stock) VALUES (?,?,?,?,?,?,?,?)")
  products.forEach(p => insProduct.run(p.id, p.name, p.sku, p.unitOfMeasure, p.price, p.bomId, p.currentStock, p.reservedStock))

  const insRM = db.prepare("INSERT OR IGNORE INTO raw_materials (id,name,unit,current_stock,reserved_stock,reorder_point,supplier_id) VALUES (?,?,?,?,?,?,?)")
  rawMaterials.forEach(r => insRM.run(r.id, r.name, r.unit, r.currentStock, r.reservedStock, r.reorderPoint, r.supplierId))

  const insBom  = db.prepare("INSERT OR IGNORE INTO boms (id,product_id,version,status,created_by,created_at) VALUES (?,?,?,?,?,?)")
  const insBomC = db.prepare("INSERT INTO bom_components (bom_id,material_id,qty_per_unit) VALUES (?,?,?)")
  boms.forEach(b => {
    insBom.run(b.id, b.productId, b.version, b.status, b.createdBy, b.createdAt)
    b.components.forEach(c => insBomC.run(b.id, c.materialId, c.qtyPerUnit))
  })

  const insSO   = db.prepare("INSERT OR IGNORE INTO sales_orders (id,customer_id,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?)")
  const insSOL  = db.prepare("INSERT INTO sales_order_lines (order_id,product_id,qty,unit_price) VALUES (?,?,?,?)")
  salesOrders.forEach(so => {
    insSO.run(so.id, so.customerId, so.status, so.createdBy, so.createdAt, so.updatedAt)
    so.lines.forEach(l => insSOL.run(so.id, l.productId, l.qty, l.unitPrice))
  })

  const insPO = db.prepare("INSERT OR IGNORE INTO production_orders (id,sales_order_id,product_id,qty,status,bom_id,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
  productionOrders.forEach(po => insPO.run(po.id, po.salesOrderId, po.productId, po.qty, po.status, po.bomId, po.notes ?? null, po.createdAt, po.updatedAt))

  const insShp = db.prepare("INSERT OR IGNORE INTO shipments (id,sales_order_id,status,tracking_number,carrier,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
  shipments.forEach(sh => insShp.run(sh.id, sh.salesOrderId, sh.status, sh.trackingNumber ?? null, sh.carrier ?? null, sh.createdAt, sh.updatedAt))
}
