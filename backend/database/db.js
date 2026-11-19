const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const databaseDirectory = __dirname;
fs.mkdirSync(databaseDirectory, { recursive: true });
const db = new Database(path.join(databaseDirectory, "shop.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

// Compatibility for a Part 1 database created before the stock column existed.
const productColumns = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);
if (!productColumns.includes("stock")) {
  db.exec("ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 25 CHECK(stock >= 0)");
}

const count = db.prepare("SELECT COUNT(*) AS total FROM products").get().total;
if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO products (name, description, price, image_url, category, stock)
    VALUES (@name, @description, @price, @image_url, @category, @stock)
  `);
  const sampleProducts = [
    { name: "Wireless Headphones", description: "Comfortable over-ear headphones with clear sound, soft ear cushions and long battery life.", price: 2499, image_url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900", category: "Electronics", stock: 20 },
    { name: "Smart Watch", description: "A lightweight smart watch for activity tracking, notifications and everyday use.", price: 3299, image_url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900", category: "Electronics", stock: 15 },
    { name: "Classic Sneakers", description: "Versatile everyday sneakers with a clean design and a comfortable cushioned sole.", price: 1899, image_url: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=900", category: "Fashion", stock: 30 },
    { name: "Minimal Backpack", description: "A practical backpack with a roomy main compartment for work, college and travel.", price: 1499, image_url: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900", category: "Fashion", stock: 18 },
    { name: "Desk Lamp", description: "A modern desk lamp that provides focused light for reading and studying.", price: 999, image_url: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=900", category: "Home", stock: 25 },
    { name: "Ceramic Coffee Mug", description: "A simple ceramic mug for your daily coffee, tea or hot chocolate.", price: 399, image_url: "https://images.unsplash.com/photo-1514228742587-6b1558f?auto=format&fit=crop&w=900&q=80", category: "Home", stock: 40 }
  ];
  const seed = db.transaction(items => items.forEach(item => insert.run(item)));
  seed(sampleProducts);
}

module.exports = db;
