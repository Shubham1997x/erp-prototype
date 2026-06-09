const email = "arjun@shirtco.in";
const password = "Password@123";

fetch("http://localhost:3000/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password })
})
  .then(async (res) => {
    console.log("Status:", res.status);
    console.log("Headers:", res.headers);
    const text = await res.text();
    console.log("Body:", text);
  })
  .catch((err) => console.error("Error:", err));
