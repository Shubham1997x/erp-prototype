const Database = require('better-sqlite3');
const db = new Database('erp.db');

const customers = db.prepare("SELECT id FROM customers").all();
const products = db.prepare("SELECT id, price FROM products").all();

for (let i = 0; i < 6; i++) {
  const id = `so-seed-${Date.now()}-${i}`;
  const now = new Date();
  now.setDate(now.getDate() - (10 + i)); // make them older than current orders
  const dateStr = now.toISOString();

  const customerId = customers[i % customers.length].id;
  const status = ["DELIVERED", "DELIVERED", "SHIPPED", "IN_PRODUCTION"][i % 4];

  db.prepare(`INSERT INTO sales_orders (id, customer_id, status, notes, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`)
    .run(id, customerId, status, "Seed data for dashboard", "System", dateStr, dateStr);

  const numLines = Math.floor(Math.random() * 3) + 1;
  for (let j = 0; j < numLines; j++) {
    const product = products[j % products.length];
    db.prepare("INSERT INTO sales_order_lines (order_id, product_id, qty, unit_price) VALUES (?,?,?,?)")
      .run(id, product.id, Math.floor(Math.random() * 100) + 20, product.price);
  }
}
console.log("Seeded 6 additional sales orders.");
