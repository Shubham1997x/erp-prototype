fetch("http://localhost:3000/api/customers", {
  method: "GET"
})
  .then(res => console.log("Customers Status:", res.status))
  .catch(err => console.error("Error:", err));
