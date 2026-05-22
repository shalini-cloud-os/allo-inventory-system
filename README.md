# Allo Multi-Warehouse Inventory & Reservation Hub

Welcome to the Allo Multi-Warehouse Inventory & Reservation System. This solution is built end-to-end to address database race conditions in high-throughput checkout checkout flows without sacrificing conversions or double-selling stock.

---

## 🚀 Key Architectural Pillars

### 1. Concurrency Safety: The Thread-Safe KeyedMutex Queue
**How we guarantee absolute correctness under high concurrency:**
* Node.js executes JavaScript on a single-threaded event loop, which prevents certain system-level threading raises but can face race conditions if we perform asynchronous databases roundtrips (e.g. reading current stock, analyzing limits, and committing updates across separate async callbacks).
* To resolve this, this system utilizes an in-memory **KeyedMutex lock manager**.
* When a reservation is attempted, we acquire a lock keyed specifically to the SKU/warehouse: `productId:warehouseId`. This allows massive horizontal throughput—shoppers reserving unrelated products or warehouses are never blocked, while competing requests targeting the *exactly matching* stock pool are strictly serialized.
* Inside this serialized critical section, the server reads the up-to-date stock volumes, calculates available stock (`total - reserved`), and decrements capacity or returns `409 Conflict` safely.

### 2. Double-Defense Expiry and Cleanup Actions
When a reservation is created, we temporarily hold the units (default is 10 minutes, but configurable to as fast as 15 seconds in our interactive playground!). If not purchased, the holds must be returned back to the warehouse. We protect this using **Double-Defense Cleanups**:
* **Active Background Worker**: A background interval scans pending reservations every **5 seconds**. If any reservation's expiry time has passed, its status is set to `released` and the locked units are returned to stock.
* **Lazy Verification**: On *every* incoming API query (fetching products, checking logs), we trigger an immediate scan-and-release block before serving metrics. This ensures the customer is always looking at authentic, up-to-the-millisecond stock availability.

### 3. Idempotency Keys (API Guarantee)
We implemented full idempotency support for both the **Reserve** and **Confirm Checkouts** endpoints:
* Clients submit requests containing the custom `Idempotency-Key: <unique_uuid>` header.
* The server stores completed transactions in an idempotency index map, recording the HTTP status code and response payload.
* If a duplicate request arrives (e.g., due to network retries, double-clicks, or temporary connection timeouts), the server intercepts the key and immediately serves the cached response without repeating side effects or double-deducting stock numbers.

---

## 🛠️ Tech Stack & Setup

* **Framework**: React 19 (Vite) + Typescript 5.8
* **Styles**: Tailwind CSS v4 + Lucide Icon sets
* **Backend Utilities**: Node.js + Express 4 + tsx
* **Lock Guard**: Process-level Keyed Mutex serialized buffers
* **Asset Storage**: Unsplash HD technical retail vectors

### How to Run Locally

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Boot development environment:**
   ```bash
   npm run dev
   ```
   Both the client asset compiler (Vite) and backend routing server (Express) boot concurrently on **Port 3000**.

3. **Build and pack for production:**
   ```bash
   npm run build
   ```
   Compiles static SPA files into `dist/` and compiles the backend into a fast standalone CommonJS executable at `dist/server.cjs` using `esbuild`.

4. **Production launch:**
   ```bash
   npm run start
   ```

---

## 🔬 Running Sandbox Simulations

We created an interactive **Testing & Concurrency Arena** widget directly inside the web UI to prove correctness:

### Simulate Concurrency Conflict (409)
* Press **"Simulate Race Condition"** in the UI.
* The system attempts to reserve the *last single unit* of the **Luxe Travel Wallet** at the **NYC Warehouse** twice in parallel (`Promise.all`).
* The system terminal prints the execution logs in real time. Request A obtains the lock and succeeds (status `201`), while Request B is safely blocked (status `409 Conflict`) with an explanation of why the race failed!

### Simulate Expiry Sweeper (410)
* Set the hold window to **"15s"** in the playground.
* Reserve any product (e.g. "Allo Performance Tee").
* Watch the live ticking timer in the Checkout Card. When it hits zero, watch the active hold instantly move into the historical sandbox ledger with status `Expired (410)`.
* Watch the green product availability numbers automatically restore by 1 unit in the catalog without a page refresh!

---

## 📈 Technical Trade-offs & Future Improvements

While this process-level mutex queue is 100% thread-safe and performant inside a single instance (such as a standard single-container Cloud Run or standalone server), high-scale multi-instance production platforms should consider the following upgrades:

1. **Distributed Locks (Redis/Redlock)**:
   * *Trade-off*: Process-level memory mutexes only lock requests inside the same Node.js container instance. If the applet scales out horizontally across multiple instances (with an ingress load balancer), different containers won't share the same lock records.
   * *Improvement*: Switch the `KeyedMutex` to a lightweight distributed lock manager utilizing Redis with the Redlock algorithm.

2. **Relational Database Locks (`SELECT ... FOR UPDATE`)**:
   * *Trade-off*: In-memory structures are volatile on site crashes.
   * *Improvement*: Put products, stock metrics, and reservation ledger rows inside a Postgres database (such as Supabase or Neon). Use Postgres database transactions with locking clauses:
     ```sql
     SELECT total, reserved FROM stocks 
     WHERE product_id = :pId AND warehouse_id = :wId 
     FOR UPDATE;
     ```
     This blocks concurrent writes directly in the database row layer.

3. **Event-Driven Sockets (Real-time updates)**:
   * *Trade-off*: The client currently polls stock levels every 4 seconds.
   * *Improvement*: Integrate a WebSocket server (such as Socket.io) in the Express instance to push instant broadcast frames, causing shopping interfaces to adjust stock metrics in real-time as other customers add holds.
