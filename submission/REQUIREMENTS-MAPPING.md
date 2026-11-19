# Assignment requirements mapping — Parts 1, 2 and 3

Use this as a quick guide while demonstrating the application to the instructor.

| Assignment requirement | Implementation location | How to demonstrate |
|---|---|---|
| Part 1 product catalogue, details, search/filter | `frontend/src/App.jsx`, `backend/server.js` product routes | Browse, search and filter the catalogue; open Details |
| Registration and login | `frontend/src/App.jsx` AuthPanel; `/api/auth/register`, `/api/auth/login` | Register a test account, log out, then log in |
| Secure password handling and session | `backend/server.js`; `users.password_hash` migration | Explain bcrypt hashing and HttpOnly signed session cookie; do not display stored hashes |
| User-specific cart authorization | `backend/server.js` `authenticate` middleware and cart routes | Create User A and User B; compare their carts; try `?userId=1` while logged in as B |
| Add/update/remove cart items | `frontend/src/App.jsx` CartPanel; `/api/cart/items` routes | Add products, change quantity, remove a product |
| Server-side stock and price validation | `backend/server.js` cart routes and `readCart()` | Try quantity above available stock; inspect server-computed cart total |
| Persistent cart and migration | `backend/database/migrations/001_users_and_carts.sql`, `migrate.js` | Add items, restart backend, log in again; show products remain in DB |
| Structured logs and request IDs | `backend/server.js` Pino middleware | Inspect backend terminal after requests and a failed login |
| Metrics | `backend/server.js` Prometheus counters/histogram | Open `http://localhost:3000/metrics` |
| Prometheus and Grafana | `docker-compose.yml`, `monitoring/` | Open Prometheus targets and Grafana dashboard |
| Dashboard panels | `monitoring/grafana/dashboards/shopease-overview.json` | Generate requests/cart additions and show panel changes |
| Controlled failure | `GET /api/demo/failure` | Request the endpoint; show HTTP 500 and increased error metric |
| Submission configuration and documentation | `README.md`, `docker-compose.yml`, `monitoring/` | Follow setup commands from a clean extraction |

## User-isolation demonstration command

With User B's cookie jar active, request:

```powershell
curl.exe -i -b userB.txt "http://localhost:3000/api/cart?userId=1"
```

The API intentionally ignores the query parameter and returns the cart belonging to the authenticated User B. It never uses a client-provided user ID to choose a cart. Without a valid session cookie, `/api/cart` returns HTTP 401.

## Evidence reminder

Screenshots must be captured from your running application. See `screenshots/README.md` for the suggested filenames and evidence list.
