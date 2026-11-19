# ShopEase — Full-Stack E-Commerce Lab (Parts 1, 2 & 3)

This repository extends the original Part 1 product-listing application. It keeps the same **React + Vite frontend, Node.js + Express REST API, and SQLite database**, and adds the Part 2 authentication/cart features and Part 3 logging/monitoring stack.

## What is included

### Part 1 — Product listing
- Product catalogue with name, description, price, image and category.
- Product detail modal.
- Search and category filtering.
- Express API endpoints backed by SQLite.

### Part 2 — Shopping cart, authentication and authorization
- User registration and login.
- Passwords hashed with `bcryptjs` (never stored as plain text).
- Signed JWT session stored in an `HttpOnly` cookie.
- Authenticated users can add products, update quantities and remove products.
- Each cart belongs to one user. The backend gets the user ID from the verified session; cart APIs do not accept a user ID from the browser.
- Server validates product IDs, quantities and available stock.
- Cart totals are calculated using product prices read from SQLite, not prices sent by the client.
- Cart data persists in SQLite across application restarts.
- Umzug migration adds `users`, `carts` and `cart_items` to the existing Part 1 database. Existing product records are retained.

### Part 3 — Logging and monitoring
- Structured JSON logs using Pino, with timestamps, log levels and request IDs.
- HTTP request logging, failed-login events and unexpected-error logging.
- Cookie and authorization headers are redacted; passwords and JWTs are not logged.
- Prometheus metrics: total requests, HTTP errors, request latency, endpoint/status labels, and products added to carts.
- Prometheus scrape configuration and an automatically provisioned Grafana dashboard.
- A controlled failure endpoint (`GET /api/demo/failure`) for the required failure demonstration.

## Folder structure

```text
ShopEase/
├── backend/
│   ├── database/
│   │   ├── migrations/
│   │   │   └── 001_users_and_carts.sql
│   │   ├── db.js
│   │   ├── init.js
│   │   ├── migrate.js
│   │   └── schema.sql
│   ├── .env.example
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── monitoring/
│   ├── prometheus/prometheus.yml
│   └── grafana/
│       ├── dashboards/shopease-overview.json
│       └── provisioning/ (datasource and dashboard provisioning)
├── submission/screenshots/ (put your own evidence screenshots here)
├── docker-compose.yml
└── README.md
```

## Prerequisites

- Node.js 20 or newer and npm.
- Docker Desktop with Docker Compose (for Prometheus and Grafana).
- An internet connection for the first npm install and Docker image downloads, and for the externally hosted sample product photos.
- No MySQL server, XAMPP or separate SQLite server is required. SQLite is a local database file.

## Run the complete project on Windows

Open the extracted `ShopEase` folder in VS Code. Run the following in **three separate terminals**. Do not close the terminals while using the application.

### 1. Backend (Terminal 1)

```powershell
cd backend
npm install
Copy-Item .env.example .env
npm run db:init
npm run db:migrate
npm run dev
```

The API runs at `http://localhost:3000`.

`db:init` creates/opens the SQLite database and makes sure the Part 1 products table exists. `db:migrate` applies the Part 2 migration. Run both on first setup. The migration adds the user/cart tables and does not delete the existing products.

Before submitting, open `backend/.env` and replace `JWT_SECRET` with a long random secret. Do not commit `.env`; only `.env.example` belongs in Git.

### 2. React frontend (Terminal 2)

From the project root, open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` calls to the backend on port 3000.

### 3. Prometheus and Grafana (Terminal 3)

Make sure Docker Desktop is running. From the project root:

```powershell
docker compose up -d
```

Open:
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`
- Backend metrics: `http://localhost:3000/metrics`

Grafana's initial local lab login is username `admin`, password `admin`. Change the password when prompted. The **ShopEase Application Monitoring** dashboard is provisioned automatically. Prometheus scrapes the backend every 5 seconds.

To stop monitoring containers:

```powershell
docker compose down
```

To stop and also remove stored Prometheus/Grafana data:

```powershell
docker compose down -v
```

## Production-style single-server run (optional)

After installing dependencies and applying the migration, build React and let Express serve it:

```powershell
cd frontend
npm run build
cd ../backend
npm start
```

Open `http://localhost:3000`. Keep Docker Compose running separately if you want monitoring in this mode.

## API reference

| Method | Endpoint | Authentication | Purpose |
|---|---|---:|---|
| GET | `/api/health` | No | Health check |
| GET | `/api/products` | No | List products; supports `search` and `category` |
| GET | `/api/products/:id` | No | Product details |
| GET | `/api/categories` | No | Product categories |
| POST | `/api/auth/register` | No | Register; body: `{ "name", "email", "password" }` |
| POST | `/api/auth/login` | No | Login; body: `{ "email", "password" }` |
| POST | `/api/auth/logout` | No | Clear session cookie |
| GET | `/api/auth/me` | Yes | Current signed-in user |
| GET | `/api/cart` | Yes | Current user's cart |
| POST | `/api/cart/items` | Yes | Add item; body: `{ "productId": 1, "quantity": 1 }` |
| PATCH | `/api/cart/items/:productId` | Yes | Set quantity; body: `{ "quantity": 2 }` |
| DELETE | `/api/cart/items/:productId` | Yes | Remove item |
| GET | `/metrics` | No | Prometheus metrics |
| GET | `/api/demo/failure` | No | Deliberate HTTP 500 for lab demonstration |

## Demonstrate Part 2

1. Open the frontend and create **User A** using Sign up.
2. Add one or more products. Open Cart, change a quantity, and remove an item. Refresh the page or restart the backend; the cart should still be saved after logging in again.
3. Log out and create **User B** with a different email. User B should have an empty cart and should not see User A's items.
4. The backend does not accept a `userId` in cart routes. It always uses the user ID in the verified session cookie. This is the authorization control.

### Optional API-level ownership test (PowerShell)

Use two separate cookie jars. Replace the sample emails/passwords with test values. `curl.exe` is used explicitly because Windows PowerShell may alias `curl` to another command.

```powershell
# Register User A and save A's session cookie
curl.exe -i -c userA.txt -H "Content-Type: application/json" -d "{`"name`":`"User A`",`"email`":`"a@example.com`",`"password`":`"Password123`"}" http://localhost:3000/api/auth/register

# Add product 1 to User A's cart
curl.exe -i -b userA.txt -H "Content-Type: application/json" -d "{`"productId`":1,`"quantity`":1}" http://localhost:3000/api/cart/items

# Register User B and save B's different session cookie
curl.exe -i -c userB.txt -H "Content-Type: application/json" -d "{`"name`":`"User B`",`"email`":`"b@example.com`",`"password`":`"Password123`"}" http://localhost:3000/api/auth/register

# User B's cart should be empty
curl.exe -i -b userB.txt http://localhost:3000/api/cart

# Try to manipulate the request by guessing User A's id; the API ignores it and still returns B's cart
curl.exe -i -b userB.txt "http://localhost:3000/api/cart?userId=1"
```

Expected result: User B receives their own empty cart. The cart API has no `userId` parameter; changing a guessed user ID in a request cannot select another person's cart. You can also test an unauthenticated request: `curl.exe -i http://localhost:3000/api/cart` should return HTTP 401.

## Demonstrate Part 3

1. Start the backend and monitoring stack.
2. Browse the product list, log in, add products to the cart, and change quantities.
3. Open Grafana at `http://localhost:3001` and select **ShopEase Application Monitoring**. Wait a few scrape intervals; request volume and cart-addition panels should change.
4. Trigger the controlled failure in a browser or terminal:

```powershell
curl.exe -i http://localhost:3000/api/demo/failure
```

It should return HTTP 500. The request should appear in the structured backend log with its request ID, and the HTTP error metric/error-rate panel should increase after Prometheus scrapes it. You can also inspect `http://localhost:3000/metrics` and search for `shopease_http_request_errors_total`.
5. For a screenshot, show the Grafana dashboard after generating traffic and after triggering the failure.

### Metrics implemented

| Metric | Meaning |
|---|---|
| `shopease_http_requests_total` | Total HTTP requests, labelled by method, route and status code |
| `shopease_http_request_errors_total` | HTTP 4xx and 5xx responses |
| `shopease_http_request_duration_seconds` | Request-latency histogram, including buckets for percentile calculations |
| `shopease_cart_items_added_total` | Successfully added product quantities |

Default Node.js process metrics are also exposed by `prom-client`.

## Database and migration notes

- SQLite database: `backend/database/shop.db` (created locally on first initialization; not committed to Git).
- Part 1 schema: `backend/database/schema.sql`.
- Part 2 migration: `backend/database/migrations/001_users_and_carts.sql`.
- Migration runner: Umzug, invoked by `npm run db:migrate`.
- Existing Part 1 product records remain in the `products` table; the migration adds the user/cart tables and foreign keys.
- Do not delete `shop.db` when you want to preserve your products, users and carts.

## Submission checklist

Before uploading the Git repository, complete these items:

- [ ] Push the complete `ShopEase` repository with frontend and backend source code.
- [ ] Include `schema.sql`, the SQL migration and migration runner.
- [ ] Include `docker-compose.yml`, Prometheus configuration and Grafana dashboard JSON/provisioning.
- [ ] Include this README with prerequisites, configuration, architecture and all run commands.
- [ ] Add your own screenshots to `submission/screenshots/`:
  - [ ] Product listing and product details (Part 1).
  - [ ] Registration and login flow (Part 2).
  - [ ] Shopping cart with more than one item or a changed quantity (Part 2).
  - [ ] User B's separate/empty cart or API ownership test (Part 2).
  - [ ] Grafana dashboard showing request volume, latency, HTTP errors and cart additions (Part 3).
  - [ ] Controlled failure response/log/metric evidence (Part 3).
- [ ] Test the README from a clean checkout or another computer.
- [ ] Never submit `.env`, database files, node_modules or real user passwords.

**Important:** screenshots are intentionally not fabricated or prefilled. Run the app and capture your own browser/Grafana evidence after testing.

## Architecture and implementation decisions

```text
React + Vite (5173)
       |  /api requests via Vite proxy
       v
Express REST API (3000) ---- Pino JSON logs + request IDs
       |                         |
       | SQLite queries          +---- /metrics endpoint
       v                                  |
SQLite database                    Prometheus (9090)
                                           |
                                           v
                                      Grafana (3001)
```

React handles the user interface; Express owns validation, authentication, authorization and cart calculations; SQLite stores products, users and persistent carts. Password hashes use bcrypt. A signed JWT is stored in an HttpOnly cookie rather than browser local storage. Cart ownership is derived from the verified cookie on the backend. Prometheus scrapes the instrumented Express metrics endpoint, while Grafana provisions a dashboard from the checked-in JSON file. This keeps the monitoring stack reproducible on a single development computer.

## Troubleshooting

- **`npm` is not recognized:** install Node.js 20+ and reopen VS Code/terminal.
- **Port 3000 is busy:** stop the other process or change `PORT` in `backend/.env` and update the Vite proxy and Prometheus target to match.
- **Login/cart returns 500 mentioning `users` or `carts`:** stop the backend and run `npm run db:migrate` from `backend`.
- **Grafana has no data:** confirm the backend is running at port 3000, `http://localhost:3000/metrics` opens, Docker Desktop is running, and Prometheus target `host.docker.internal:3000` is healthy at `http://localhost:9090/targets`.
- **Native SQLite install error:** use a supported Node.js 20/22 LTS release, then remove `backend/node_modules` and rerun `npm install`.
