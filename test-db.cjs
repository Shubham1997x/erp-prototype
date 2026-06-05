const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(process.cwd(), "data", "erp.db"));

try {
    const id = "SO-1002"; // Needs to be an existing order
    const authId = "user-1";
    const now = new Date().toISOString();
    const order = db.prepare("SELECT * FROM sales_orders WHERE id = ?").get(id);
    
    if (!order) {
        console.log("Order not found");
        process.exit(1);
    }

    const lines = [
        { productId: "PROD-201", qty: 200, unitPrice: 200 }
    ];

    const amendmentId = "soa-test-1";
    const newRevision = (order.revision_number || 1) + 1;
    const changeSummary = "Test";

    db.transaction(() => {
        const beforeLines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id = ?").all(id);
        const beforeOrder = { ...order };

        if (lines) {
          if (order.status === "READY_TO_SHIP") {
            for (const bl of beforeLines) {
              const product_id = bl.product_id;
              const qty = bl.qty;
              db.prepare("UPDATE products SET current_stock = current_stock + ? WHERE id=?").run(qty, product_id);
              db.prepare(`
                INSERT INTO stock_movements (entity_type, entity_id, delta, reason, reference_type, reference_id, created_by, created_at)
                VALUES ('product', ?, ?, 'Order amendment return', 'sales_order', ?, ?, ?)
              `).run(product_id, qty, id, authId, now);
            }
          }

          db.prepare("DELETE FROM sales_order_lines WHERE order_id = ?").run(id);

          for (const line of lines) {
            db.prepare(`
              INSERT INTO sales_order_lines (order_id, product_id, qty, unit_price, fulfilled_qty)
              VALUES (?, ?, ?, ?, 0)
            `).run(id, line.productId, line.qty, line.unitPrice);
          }
        }

        const orderUpdates = ["revision_number = ?", "updated_at = ?", "updated_by = ?"];
        const orderValues = [newRevision, now, authId];

        if (lines && order.status !== "DRAFT" && order.status !== "SUBMITTED") {
          orderUpdates.push("status = ?");
          orderValues.push("INVENTORY_CHECK");
        }

        orderValues.push(id);
        
        console.log("Executing update with values:", orderValues);
        console.log("SQL:", `UPDATE sales_orders SET ${orderUpdates.join(", ")} WHERE id = ?`);
        
        db.prepare(`UPDATE sales_orders SET ${orderUpdates.join(", ")} WHERE id = ?`).run(...orderValues);

        const afterLines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id = ?").all(id);
        const afterOrder = db.prepare("SELECT * FROM sales_orders WHERE id = ?").get(id);

        db.prepare(`
          INSERT INTO so_amendments
            (id, sales_order_id, revision_number, changed_by, change_summary, before_state, after_state, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          amendmentId,
          id,
          newRevision,
          authId,
          changeSummary,
          JSON.stringify({ order: beforeOrder, lines: beforeLines }),
          JSON.stringify({ order: afterOrder, lines: afterLines })
        );

    })();
    console.log("Success");
} catch (e) {
    console.error("ERROR:", e);
}
