async function run() {
  try {
    const res = await fetch("http://localhost:3000/api/sales-orders/SO-1002/amend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Need to simulate auth, maybe next handles it? Or it'll fail with 401.
        // Actually, requireNotViewer checks cookies. We can't easily simulate it without cookies.
      },
      body: JSON.stringify({
        changeSummary: "Test edit",
        lines: [
            { productId: "PROD-201", qty: 200, unitPrice: 200 }
        ]
      })
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Body:", text);
  } catch (e) {
    console.error(e);
  }
}
run();
