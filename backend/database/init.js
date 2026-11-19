require("dotenv").config();
const db = require("./db");
console.log("SQLite database is ready. Existing product data is preserved.");
db.close();
