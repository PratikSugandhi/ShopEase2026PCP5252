require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Umzug, JSONStorage } = require("umzug");
const db = require("./db");

const migrationDir = path.join(__dirname, "migrations");
const migration = {
  name: "001_users_and_carts",
  up: async () => db.exec(fs.readFileSync(path.join(migrationDir, "001_users_and_carts.sql"), "utf8")),
  down: async () => db.exec("DROP TABLE IF EXISTS cart_items; DROP TABLE IF EXISTS carts; DROP TABLE IF EXISTS users;")
};

const umzug = new Umzug({
  migrations: [migration],
  context: db,
  storage: new JSONStorage({ path: path.join(__dirname, "migrations", ".umzug.json") }),
  logger: console
});

umzug.up()
  .then(() => console.log("Database migrations are up to date. Existing product rows are preserved."))
  .catch(error => { console.error("Migration failed:", error); process.exitCode = 1; })
  .finally(() => db.close());
