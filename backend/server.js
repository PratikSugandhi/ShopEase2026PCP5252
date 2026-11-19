require("dotenv").config();
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pino = require("pino");
const pinoHttp = require("pino-http");
const client = require("prom-client");
const { z } = require("zod");
const db = require("./database/db");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "local-development-secret-change-before-submission";
const isProduction = process.env.NODE_ENV === "production";
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

app.disable("x-powered-by");
app.use((req, res, next) => {
  const { randomUUID } = require("crypto");
  req.requestId = randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  next();
});
app.use(pinoHttp({
  logger,
  genReqId: req => req.requestId,
  redact: {
    paths: ["req.headers.cookie", "req.headers.authorization", "res.headers['set-cookie']"],
    censor: "[REDACTED]"
  },
  customLogLevel: (_req, res, err) => err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"
}));
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "shopease_" });
const httpRequests = new client.Counter({
  name: "shopease_http_requests_total",
  help: "Total HTTP requests served by the application",
  labelNames: ["method", "route", "status_code"],
  registers: [register]
});
const httpErrors = new client.Counter({
  name: "shopease_http_request_errors_total",
  help: "HTTP responses with 4xx or 5xx status",
  labelNames: ["method", "route", "status_code"],
  registers: [register]
});
const httpDuration = new client.Histogram({
  name: "shopease_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register]
});
const cartAdds = new client.Counter({
  name: "shopease_cart_items_added_total",
  help: "Number of successful product additions to shopping carts",
  registers: [register]
});

app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    if (req.path === "/metrics") return;
    const route = req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : req.path;
    const labels = { method: req.method, route: route || "unknown", status_code: String(res.statusCode) };
    httpRequests.inc(labels);
    if (res.statusCode >= 400) httpErrors.inc(labels);
    httpDuration.observe(labels, Number(process.hrtime.bigint() - started) / 1e9);
  });
  next();
});

const safeUser = row => ({ id: row.id, name: row.name, email: row.email });
function authenticate(req, res, next) {
  const token = req.cookies.shopease_session;
  if (!token) return res.status(401).json({ error: "Please log in to continue." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(payload.sub);
    if (!user) return res.status(401).json({ error: "Session is no longer valid. Please log in again." });
    req.user = user;
    next();
  } catch {
    req.log.warn({ event: "authentication_failed", requestId: req.requestId });
    return res.status(401).json({ error: "Your session has expired. Please log in again." });
  }
}
function getOrCreateCart(userId) {
  let cart = db.prepare("SELECT id FROM carts WHERE user_id = ?").get(userId);
  if (!cart) {
    const result = db.prepare("INSERT INTO carts (user_id) VALUES (?)").run(userId);
    cart = { id: Number(result.lastInsertRowid) };
  }
  return cart.id;
}
function readCart(userId) {
  const cart = db.prepare("SELECT id FROM carts WHERE user_id = ?").get(userId);
  if (!cart) return { items: [], total: 0, itemCount: 0 };
  const items = db.prepare(`
    SELECT p.id AS product_id, p.name, p.image_url, p.price, p.stock, ci.quantity,
           ROUND(p.price * ci.quantity, 2) AS subtotal
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id = ? ORDER BY ci.id DESC
  `).all(cart.id);
  return {
    items,
    total: Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)),
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0)
  };
}

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/metrics", async (_req, res, next) => {
  try { res.set("Content-Type", register.contentType); res.end(await register.metrics()); }
  catch (error) { next(error); }
});

// Part 1 catalogue endpoints remain available.
app.get("/api/products", (req, res) => {
  const search = String(req.query.search || "").trim();
  const category = String(req.query.category || "").trim();
  if (search.length > 100 || category.length > 60) return res.status(400).json({ error: "Search or category value is too long." });
  let sql = "SELECT id, name, description, price, image_url, category, stock FROM products WHERE 1=1";
  const params = [];
  if (search) { sql += " AND (name LIKE ? OR description LIKE ? OR category LIKE ?)"; const term = `%${search}%`; params.push(term, term, term); }
  if (category && category !== "All") { sql += " AND category = ?"; params.push(category); }
  sql += " ORDER BY id DESC";
  const products = db.prepare(sql).all(...params);
  res.json({ count: products.length, products });
});
app.get("/api/products/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Product id must be a positive integer." });
  const product = db.prepare("SELECT id, name, description, price, image_url, category, stock FROM products WHERE id = ?").get(id);
  if (!product) return res.status(404).json({ error: "Product not found." });
  res.json({ product });
});
app.get("/api/categories", (_req, res) => {
  const categories = db.prepare("SELECT DISTINCT category FROM products ORDER BY category").all().map(row => row.category);
  res.json({ categories });
});

// Authentication: passwords are bcrypt-hashed; JWT is held only in an HttpOnly cookie.
const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(72)
});
const loginSchema = z.object({ email: z.string().trim().email().max(120), password: z.string().min(1).max(72) });
function setSession(res, user) {
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("shopease_session", token, {
    httpOnly: true, secure: isProduction, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000, path: "/"
  });
}
app.post("/api/auth/register", async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a name, valid email and password of at least 8 characters." });
  try {
    const { name, email, password } = parsed.data;
    if (db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email)) return res.status(409).json({ error: "An account with this email already exists." });
    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)").run(name, email.toLowerCase(), passwordHash);
    const user = { id: Number(result.lastInsertRowid), name, email: email.toLowerCase() };
    setSession(res, user);
    req.log.info({ event: "user_registered", userId: user.id });
    res.status(201).json({ user: safeUser(user) });
  } catch (error) { next(error); }
});
app.post("/api/auth/login", async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email and password." });
  try {
    const user = db.prepare("SELECT id, name, email, password_hash FROM users WHERE email = ? COLLATE NOCASE").get(parsed.data.email);
    if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
      req.log.warn({ event: "login_failed" });
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    setSession(res, user);
    req.log.info({ event: "user_logged_in", userId: user.id });
    res.json({ user: safeUser(user) });
  } catch (error) { next(error); }
});
app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("shopease_session", { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/" });
  res.json({ message: "Logged out successfully." });
});
app.get("/api/auth/me", authenticate, (req, res) => res.json({ user: safeUser(req.user) }));

// All cart routes derive the owner from the verified session, never from request data.
app.get("/api/cart", authenticate, (req, res) => res.json(readCart(req.user.id)));
app.post("/api/cart/items", authenticate, (req, res) => {
  const parsed = z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(99).default(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Provide a valid productId and quantity (1–99)." });
  const { productId, quantity } = parsed.data;
  const product = db.prepare("SELECT id, stock FROM products WHERE id = ?").get(productId);
  if (!product) return res.status(404).json({ error: "Product not found." });
  const cartId = getOrCreateCart(req.user.id);
  const existing = db.prepare("SELECT quantity FROM cart_items WHERE cart_id = ? AND product_id = ?").get(cartId, productId);
  const nextQuantity = (existing?.quantity || 0) + quantity;
  if (nextQuantity > product.stock) return res.status(409).json({ error: `Only ${product.stock} item(s) are currently in stock.` });
  db.prepare(`
    INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)
    ON CONFLICT(cart_id, product_id) DO UPDATE SET quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP
  `).run(cartId, productId, nextQuantity);
  db.prepare("UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(cartId);
  cartAdds.inc(quantity);
  req.log.info({ event: "cart_item_added", userId: req.user.id, productId, quantity });
  res.status(201).json(readCart(req.user.id));
});
app.patch("/api/cart/items/:productId", authenticate, (req, res) => {
  const productId = Number(req.params.productId);
  const parsed = z.object({ quantity: z.number().int().min(1).max(99) }).safeParse(req.body);
  if (!Number.isInteger(productId) || productId < 1 || !parsed.success) return res.status(400).json({ error: "Provide a valid product id and quantity (1–99)." });
  const cart = db.prepare("SELECT id FROM carts WHERE user_id = ?").get(req.user.id);
  if (!cart) return res.status(404).json({ error: "Cart item not found." });
  const product = db.prepare("SELECT stock FROM products WHERE id = ?").get(productId);
  if (!product) return res.status(404).json({ error: "Product not found." });
  if (parsed.data.quantity > product.stock) return res.status(409).json({ error: `Only ${product.stock} item(s) are currently in stock.` });
  const result = db.prepare("UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE cart_id = ? AND product_id = ?").run(parsed.data.quantity, cart.id, productId);
  if (!result.changes) return res.status(404).json({ error: "Cart item not found." });
  res.json(readCart(req.user.id));
});
app.delete("/api/cart/items/:productId", authenticate, (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId) || productId < 1) return res.status(400).json({ error: "Invalid product id." });
  const cart = db.prepare("SELECT id FROM carts WHERE user_id = ?").get(req.user.id);
  if (!cart) return res.status(404).json({ error: "Cart item not found." });
  const result = db.prepare("DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?").run(cart.id, productId);
  if (!result.changes) return res.status(404).json({ error: "Cart item not found." });
  res.json(readCart(req.user.id));
});

// A deliberate 500 endpoint for the required controlled-failure demonstration.
app.get("/api/demo/failure", (_req, _res, next) => next(new Error("Controlled demo failure requested by the operator.")));

app.use(express.static(path.join(__dirname, "..", "frontend", "dist")));
app.use((err, req, res, _next) => {
  const status = err.status && err.status < 500 ? err.status : 500;
  req.log.error({ err, requestId: req.requestId }, "Request failed");
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) return res.status(400).json({ error: "Invalid JSON request body." });
  res.status(status).json({ error: status === 500 ? "Internal server error." : err.message, requestId: req.requestId });
});

const server = app.listen(PORT, () => logger.info({ port: PORT }, `ShopEase API listening on http://localhost:${PORT}`));
function shutdown() { server.close(() => { db.close(); process.exit(0); }); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
