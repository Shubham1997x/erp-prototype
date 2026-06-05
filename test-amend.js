const { getDb } = require("./lib/db");

const db = getDb();
console.log("DB Loaded");
try {
    const order = db.prepare("SELECT * FROM sales_orders LIMIT 1").get();
    console.log("Order found:", order.id);
    
    // Attempt amendment logic manually
    // ...
} catch (e) {
    console.error(e);
}
