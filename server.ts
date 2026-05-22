import express from "express";
import path from "path";
import fs from "node:fs";
import { createServer as createViteServer } from "vite";
import { 
  Warehouse, 
  Product, 
  Reservation, 
  IdempotencyRecord,
  CreateReservationRequest 
} from "./src/types";

const PORT = 3000;
const VERCEL_MODE = !!(process.env.VERCEL || process.env.NOW_BUILDER);
const DB_FILE = VERCEL_MODE 
  ? path.join("/tmp", "db.json") 
  : path.join(process.cwd(), "db.json");

// Define Lock Mutex for Concurrency Protection
class Mutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.locked = false;
    }
  }
}

class KeyedMutex {
  private locks = new Map<string, Mutex>();

  async acquire(key: string): Promise<void> {
    let lock = this.locks.get(key);
    if (!lock) {
      lock = new Mutex();
      this.locks.set(key, lock);
    }
    await lock.acquire();
  }

  release(key: string) {
    const lock = this.locks.get(key);
    if (lock) {
      lock.release();
    }
  }
}

const dbMutex = new KeyedMutex();

// Define Database Interface
interface DatabaseState {
  warehouses: Warehouse[];
  products: Product[];
  reservations: Reservation[];
  idempotency: { [key: string]: IdempotencyRecord };
}

// Initial seed data
const initialWarehouses: Warehouse[] = [
  { id: "W1", name: "Primary East (NYC)", location: "New York, NY" },
  { id: "W2", name: "SFC Warehouse (San Francisco)", location: "San Francisco, CA" },
  { id: "W3", name: "Midwest Hub (Chicago)", location: "Chicago, IL" }
];

const initialProducts: Product[] = [
  {
    id: "P1",
    name: "Allo Performance Tee",
    description: "Premium athletic activewear designed with sweat-wicking materials and highly breathable ventilation mesh paneling.",
    price: 38,
    imageUrl: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80",
    sku: "ALLO-TEE-001",
    stocks: [
      { productId: "P1", warehouseId: "W1", total: 15, reserved: 0, available: 15 },
      { productId: "P1", warehouseId: "W2", total: 8, reserved: 0, available: 8 },
      { productId: "P1", warehouseId: "W3", total: 12, reserved: 0, available: 12 }
    ]
  },
  {
    id: "P2",
    name: "Wool Crewneck Sweater",
    description: "Sustainably sourced, super-fine, and hypoallergenic grade merino wool featuring double-ribbed cuffs and a relaxed drop-shoulder finish.",
    price: 110,
    imageUrl: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=600&auto=format&fit=crop&q=80",
    sku: "ALLO-SWT-002",
    stocks: [
      { productId: "P2", warehouseId: "W1", total: 5, reserved: 0, available: 5 },
      { productId: "P2", warehouseId: "W2", total: 12, reserved: 0, available: 12 },
      { productId: "P2", warehouseId: "W3", total: 0, reserved: 0, available: 0 }
    ]
  },
  {
    id: "P3",
    name: "Waterproof Shell Jacket",
    description: "Advanced performance technical outerwear utilizing a robust 3-layer laminated durable membrane with fully seam-taped protective sealing.",
    price: 185,
    imageUrl: "https://images.unsplash.com/photo-1548883354-7622d03aca27?w=600&auto=format&fit=crop&q=80",
    sku: "ALLO-JKT-003",
    stocks: [
      { productId: "P3", warehouseId: "W1", total: 3, reserved: 0, available: 3 },
      { productId: "P3", warehouseId: "W2", total: 3, reserved: 0, available: 3 },
      { productId: "P3", warehouseId: "W3", total: 1, reserved: 0, available: 1 }
    ]
  },
  {
    id: "P4",
    name: "Explorer Backpack",
    description: "Highly rugged weather-resistant ballistic nylon roll-top packing solution with integrated dynamic modular clip lashes and accessory pockets.",
    price: 120,
    imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&auto=format&fit=crop&q=80",
    sku: "ALLO-BAG-004",
    stocks: [
      { productId: "P4", warehouseId: "W1", total: 8, reserved: 0, available: 8 },
      { productId: "P4", warehouseId: "W2", total: 10, reserved: 0, available: 10 },
      { productId: "P4", warehouseId: "W3", total: 10, reserved: 0, available: 10 }
    ]
  },
  {
    id: "P5",
    name: "Luxe Travel Wallet",
    description: "Elegant and compact travel folio handcrafted from vegetable-tanned leather, containing smart RFID-shielded slot arrays and passport safe slots.",
    price: 75,
    imageUrl: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=600&auto=format&fit=crop&q=80",
    sku: "ALLO-WLT-005",
    stocks: [
      { productId: "P5", warehouseId: "W1", total: 1, reserved: 0, available: 1 },
      { productId: "P5", warehouseId: "W2", total: 2, reserved: 0, available: 2 },
      { productId: "P5", warehouseId: "W3", total: 0, reserved: 0, available: 0 }
    ]
  }
];

function initializeDb(): DatabaseState {
  // On Vercel, copy the built-in seed DB if `/tmp/db.json` hasn't been written to keep the identical product catalog
  if (VERCEL_MODE && !fs.existsSync(DB_FILE)) {
    const rootDb = path.join(process.cwd(), "db.json");
    if (fs.existsSync(rootDb)) {
      try {
        const raw = fs.readFileSync(rootDb, "utf-8");
        fs.writeFileSync(DB_FILE, raw);
        console.log(`[Vercel DB Init] Seeded /tmp/db.json from read-only copy.`);
      } catch (err) {
        console.warn(`[Vercel DB Init] Non-fatal, failed to copy workspace db.json:`, err);
      }
    }
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(raw);
    } catch (e) {
      console.error(`Failed to parse existing DB file at ${DB_FILE}. Re-building...`, e);
    }
  }
  
  const seed: DatabaseState = {
    warehouses: initialWarehouses,
    products: initialProducts,
    reservations: [],
    idempotency: {}
  };

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2));
  } catch (err) {
    console.error(`Could not write seed DB state to ${DB_FILE}:`, err);
  }

  return seed;
}

// In-Memory cache of database state
let db = initializeDb();

function saveDbState(state: DatabaseState) {
  db = state;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error(`Failed to write database updates to ${DB_FILE}:`, err);
  }
}

// Global active/lazy check to automatically release expired holds
function performExpirationCleanup(state: DatabaseState): boolean {
  const now = Date.now();
  let modified = false;

  state.reservations.forEach((reservation) => {
    if (reservation.status === 'pending' && reservation.expiresAt <= now) {
      reservation.status = 'released';
      modified = true;

      // Restore physical available capacity (decrement reserved counter)
      const product = state.products.find(p => p.id === reservation.productId);
      if (product) {
        const stock = product.stocks.find(s => s.warehouseId === reservation.warehouseId);
        if (stock) {
          stock.reserved = Math.max(0, stock.reserved - reservation.quantity);
          stock.available = stock.total - stock.reserved;
        }
      }
      console.log(`[Auto-Release] Expired reservation ${reservation.id} for Product ${reservation.productId} at Warehouse ${reservation.warehouseId} released. (${reservation.quantity} units)`);
    }
  });

  if (modified) {
    saveDbState(state);
  }
  return modified;
}

const app = express();
app.use(express.json());

// Setup periodic background auto-cleanup worker every 5 seconds (not on Vercel)
if (!VERCEL_MODE) {
  setInterval(() => {
    performExpirationCleanup(db);
  }, 5000);
}

// API Middleware to lazy cleanup expired reservations on any API access
app.use("/api", (req, res, next) => {
  performExpirationCleanup(db);
  next();
});

  // GET /api/warehouses - List all warehouses
  app.get("/api/warehouses", (req, res) => {
    res.json(db.warehouses);
  });

  // GET /api/products - List products with absolute Stock values
  app.get("/api/products", (req, res) => {
    // Recalculate stock levels on-the-fly to guarantee absolute correctness
    db.products.forEach(product => {
      product.stocks.forEach(stock => {
        stock.available = stock.total - stock.reserved;
      });
    });
    res.json(db.products);
  });

  // GET /api/reservations - Show all current reservations for full visibility
  app.get("/api/reservations", (req, res) => {
    res.json(db.reservations);
  });

  // POST /api/reservations - Reserve stock units
  app.post("/api/reservations", async (req, res) => {
    const { productId, warehouseId, quantity, holdMinutes = 5 } = req.body as CreateReservationRequest;
    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;

    if (!productId || !warehouseId || typeof quantity !== "number" || quantity <= 0) {
      res.status(400).json({ error: "Invalid reservation payload. 'productId', 'warehouseId', and positive 'quantity' is required." });
      return;
    }

    const lockKey = `${productId}:${warehouseId}`;
    await dbMutex.acquire(lockKey);

    try {
      // Reload db to ensure fresh transaction state
      const state = initializeDb();
      performExpirationCleanup(state);

      // Idempotency check
      if (idempotencyKey) {
        const cached = state.idempotency[idempotencyKey];
        if (cached) {
          console.log(`[Idempotency Hit] Serving cached response for key: ${idempotencyKey}`);
          res.status(cached.statusCode).json(cached.body);
          return;
        }
      }

      const product = state.products.find(p => p.id === productId);
      const warehouse = state.warehouses.find(w => w.id === warehouseId);

      if (!product || !warehouse) {
        const errorResponse = { error: "Provided Product or Warehouse does not exist." };
        res.status(404).json(errorResponse);
        return;
      }

      const stock = product.stocks.find(s => s.warehouseId === warehouseId);
      if (!stock) {
        const errorResponse = { error: "Product is not registered in this warehouse." };
        res.status(404).json(errorResponse);
        return;
      }

      // Check current live availability
      const available = stock.total - stock.reserved;
      if (available < quantity) {
        const conflictResponse = {
          error: "Insufficient stock available",
          requested: quantity,
          available: available,
          warehouseName: warehouse.name,
          productName: product.name,
        };

        // Cache 409 response in idempotency as well
        if (idempotencyKey) {
          state.idempotency[idempotencyKey] = {
            key: idempotencyKey,
            statusCode: 409,
            body: conflictResponse,
            createdAt: Date.now()
          };
          saveDbState(state);
        }

        res.status(409).json(conflictResponse);
        return;
      }

      // Proceed with reservation
      const reservationId = "res_" + Math.random().toString(36).substring(2, 10).toUpperCase();
      const expiresAt = Date.now() + (holdMinutes * 60 * 1000);
      
      const newReservation: Reservation = {
        id: reservationId,
        productId,
        warehouseId,
        quantity,
        status: "pending",
        createdAt: Date.now(),
        expiresAt,
        idempotencyKey
      };

      // Set hold level
      stock.reserved += quantity;
      stock.available = stock.total - stock.reserved;

      state.reservations.unshift(newReservation);

      // Save Idempotency response
      if (idempotencyKey) {
        state.idempotency[idempotencyKey] = {
          key: idempotencyKey,
          statusCode: 201,
          body: newReservation,
          createdAt: Date.now()
        };
      }

      saveDbState(state);
      res.status(201).json(newReservation);
    } catch (err: any) {
      console.error("Exception in reserve transaction:", err);
      res.status(500).json({ error: "Server experienced an internal failure." });
    } finally {
      dbMutex.release(lockKey);
    }
  });

  // POST /api/reservations/:id/confirm - Confirm reservation (payment succeeded)
  app.post("/api/reservations/:id/confirm", async (req, res) => {
    const { id } = req.params;
    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;

    // Load DB to fetch details for lock routing
    const statePre = initializeDb();
    const reservationPre = statePre.reservations.find(r => r.id === id);

    if (!reservationPre) {
      res.status(404).json({ error: "Reservation not found." });
      return;
    }

    const lockKey = `${reservationPre.productId}:${reservationPre.warehouseId}`;
    await dbMutex.acquire(lockKey);

    try {
      const state = initializeDb();
      performExpirationCleanup(state);

      // Idempotency Check
      if (idempotencyKey) {
        const cached = state.idempotency[idempotencyKey];
        if (cached) {
          console.log(`[Idempotency Hit] Serving cached response for confirm key: ${idempotencyKey}`);
          res.status(cached.statusCode).json(cached.body);
          return;
        }
      }

      const reservation = state.reservations.find(r => r.id === id);
      if (!reservation) {
        res.status(404).json({ error: "Reservation not found." });
        return;
      }

      if (reservation.status === "confirmed") {
        res.status(200).json(reservation);
        return;
      }

      if (reservation.status === "released") {
        const expiredResponse = { error: "Reservation has expired and could not be confirmed.", code: 410 };
        res.status(410).json(expiredResponse);
        return;
      }

      // Check live expiration status
      if (reservation.expiresAt < Date.now()) {
        reservation.status = "released";
        
        // Return stock hold capacity
        const product = state.products.find(p => p.id === reservation.productId);
        if (product) {
          const stock = product.stocks.find(s => s.warehouseId === reservation.warehouseId);
          if (stock) {
            stock.reserved = Math.max(0, stock.reserved - reservation.quantity);
            stock.available = stock.total - stock.reserved;
          }
        }

        const expiredResponse = { error: "Reservation has expired and could not be confirmed.", code: 410 };

        if (idempotencyKey) {
          state.idempotency[idempotencyKey] = {
            key: idempotencyKey,
            statusCode: 410,
            body: expiredResponse,
            createdAt: Date.now()
          };
        }

        saveDbState(state);
        res.status(410).json(expiredResponse);
        return;
      }

      // Success checkout confirmation! Permanently decrement product physical inventory count.
      const product = state.products.find(p => p.id === reservation.productId);
      if (!product) {
        res.status(404).json({ error: "Product backing this reservation was not found." });
        return;
      }

      const stock = product.stocks.find(s => s.warehouseId === reservation.warehouseId);
      if (!stock) {
        res.status(414).json({ error: "Product inventory back-channel was altered." });
        return;
      }

      reservation.status = "confirmed";
      stock.reserved = Math.max(0, stock.reserved - reservation.quantity);
      stock.total = Math.max(0, stock.total - reservation.quantity); // physical outbound shipping!
      stock.available = stock.total - stock.reserved;

      if (idempotencyKey) {
        state.idempotency[idempotencyKey] = {
          key: idempotencyKey,
          statusCode: 200,
          body: reservation,
          createdAt: Date.now()
        };
      }

      saveDbState(state);
      res.status(200).json(reservation);
    } catch (err) {
      console.error("Exception in confirm transaction:", err);
      res.status(500).json({ error: "Server experienced an internal failure." });
    } finally {
      dbMutex.release(lockKey);
    }
  });

  // POST /api/reservations/:id/release - Release reservation early (failed checkout/order abandoned)
  app.post("/api/reservations/:id/release", async (req, res) => {
    const { id } = req.params;

    const statePre = initializeDb();
    const reservationPre = statePre.reservations.find(r => r.id === id);

    if (!reservationPre) {
      res.status(404).json({ error: "Reservation not found." });
      return;
    }

    const lockKey = `${reservationPre.productId}:${reservationPre.warehouseId}`;
    await dbMutex.acquire(lockKey);

    try {
      const state = initializeDb();
      performExpirationCleanup(state);

      const reservation = state.reservations.find(r => r.id === id);
      if (!reservation) {
        res.status(404).json({ error: "Reservation not found." });
        return;
      }

      if (reservation.status === "released") {
        res.status(200).json(reservation);
        return;
      }

      if (reservation.status === "confirmed") {
        res.status(400).json({ error: "Cannot release/void an already confirmed purchase." });
        return;
      }

      // Perform release 早
      reservation.status = "released";
      const product = state.products.find(p => p.id === reservation.productId);
      if (product) {
        const stock = product.stocks.find(s => s.warehouseId === reservation.warehouseId);
        if (stock) {
          stock.reserved = Math.max(0, stock.reserved - reservation.quantity);
          stock.available = stock.total - stock.reserved;
        }
      }

      saveDbState(state);
      res.status(200).json(reservation);
    } catch (err) {
      console.error("Exception in release transaction:", err);
      res.status(500).json({ error: "Server experienced an internal failure." });
    } finally {
      dbMutex.release(lockKey);
    }
  });

  // POST /api/admin/reset - Reset Database back to pristine seeded values
  app.post("/api/admin/reset", (req, res) => {
    const pristine: DatabaseState = {
      warehouses: initialWarehouses,
      products: JSON.parse(JSON.stringify(initialProducts)), // deep copy
      reservations: [],
      idempotency: {}
    };
    saveDbState(pristine);
    res.json({ message: "Database re-seeded successfully." });
  });

  // Vite Integration (only locally, not on Vercel)
async function bootLocalServer() {
  if (VERCEL_MODE) return;

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Allo Server bootloader. Server listening securely on http://localhost:${PORT}`);
  });
}

bootLocalServer().catch((err) => {
  console.error("FATAL: App server failed to boot:", err);
  process.exit(1);
});

export default app;
