import { useState, useEffect } from "react";
import Header from "./components/Header";
import SimulationControls from "./components/SimulationControls";
import ProductCard from "./components/ProductCard";
import CheckoutTracker from "./components/CheckoutTracker";
import { Product, Warehouse, Reservation } from "./types";
import { 
  ShieldAlert, 
  ServerCrash, 
  HelpCircle, 
  FileText, 
  ShoppingBag, 
  CheckCircle, 
  RefreshCw, 
  X,
  Lock
} from "lucide-react";

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [holdMinutes, setHoldMinutes] = useState<number>(5); // default 5 mins sandbox duration
  
  // Lock tracking status states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isReserving, setIsReserving] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<string | null>(null);
  const [isReleasing, setIsReleasing] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [serverOk, setServerOk] = useState<boolean>(true);

  // Sliders/Banners Alert Notifications State
  const [errorNotification, setErrorNotification] = useState<{
    title: string;
    message: string;
    type: "conflict" | "expired" | "success" | "info";
  } | null>(null);

  // API loading routines
  const fetchAllData = async () => {
    try {
      const [pRes, wRes, rRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/warehouses"),
        fetch("/api/reservations")
      ]);

      if (!pRes.ok || !wRes.ok || !rRes.ok) {
        throw new Error("Some API service components returned failed statuses.");
      }

      const pData = await pRes.json();
      const wData = await wRes.json();
      const rData = await rRes.json();

      setProducts(pData);
      setWarehouses(wData);
      setReservations(rData);
      setServerOk(true);
    } catch (err) {
      console.error("Networking fault during dataset fetch:", err);
      setServerOk(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    // Setup lazy tick fetch updates to catch holds expiring in real time
    const tick = setInterval(() => {
      fetchAllData();
    }, 4000);
    return () => clearInterval(tick);
  }, []);

  // Alert dismiss helper
  const triggerNotification = (title: string, message: string, type: "conflict" | "expired" | "success" | "info") => {
    setErrorNotification({ title, message, type });
    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      setErrorNotification(prev => prev?.title === title ? null : prev);
    }, 8000);
  };

  // 1. Reserve Stock Action (Client API POST Handler)
  const handleReserveStock = async (productId: string, warehouseId: string, quantity: number) => {
    setIsReserving(true);
    setErrorNotification(null);
    
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, warehouseId, quantity, holdMinutes }),
      });

      const data = await response.json();

      if (response.status === 201) {
        triggerNotification(
          "Reservation Secured Successfully",
          `Hold registered under ID: ${data.id}. Stock locks total ${quantity} item(s) for the next ${holdMinutes} minute(s). Proceed to complete checkout on the right.`,
          "success"
        );
        fetchAllData();
      } else if (response.status === 409) {
        // Concurrency conflict error (409) out-of-stock
        triggerNotification(
          "Stock Conflict (409)",
          data.error || `Unable to reserve ${quantity} units. Inventory is depleted or locked in other checkouts.`,
          "conflict"
        );
        fetchAllData();
      } else {
        triggerNotification(
          "Reservation Denied",
          data.error || "Server was unable to process reservation specifications.",
          "info"
        );
      }
    } catch (err: any) {
      triggerNotification(
        "Network Ingress Offline",
        "Could not dispatch request to Allo checkout api servers: " + err.message,
        "conflict"
      );
    } finally {
      setIsReserving(false);
    }
  };

  // 2. Confirm/Capture Reservation Hold (Direct Payment Simulation Handler)
  const handleConfirmReservation = async (reservationId: string) => {
    setIsConfirming(reservationId);
    setErrorNotification(null);

    try {
      const response = await fetch(`/api/reservations/${reservationId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await response.json();

      if (response.status === 200) {
        triggerNotification(
          "Payment Succeeded (200)",
          `Hold ${reservationId} successfully captured and closed. Physical stock units have been permanently shipped!`,
          "success"
        );
        fetchAllData();
      } else if (response.status === 410) {
        // Reservation expired (410)
        triggerNotification(
          "Reservation Expired (410)",
          data.error || "The checkout hold expired before payment authentication completed. Stock was returned to the warehouse.",
          "expired"
        );
        fetchAllData();
      } else {
        triggerNotification(
          "Transaction Cancelled",
          data.error || "Failed to finalize card clearance.",
          "info"
        );
      }
    } catch (err: any) {
      triggerNotification(
        "Authorization Timeout",
        "Network issues during checkout clearing: " + err.message,
        "conflict"
      );
    } finally {
      setIsConfirming(null);
    }
  };

  // 3. Early Hold Release Action
  const handleReleaseReservation = async (reservationId: string) => {
    setIsReleasing(reservationId);
    setErrorNotification(null);

    try {
      const response = await fetch(`/api/reservations/${reservationId}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await response.json();

      if (response.status === 200) {
        triggerNotification(
          "Reservation Released (200)",
          `Stock hold ${reservationId} of ${data.quantity} units has been unlocked early and returned directly to available stock pools.`,
          "success"
        );
        fetchAllData();
      } else {
        triggerNotification(
          "Release Request Failed",
          data.error || "The server could not detach checkout lock.",
          "info"
        );
      }
    } catch (err: any) {
      triggerNotification(
        "Database Error",
        "Offline network failed to notify release servers: " + err.message,
        "conflict"
      );
    } finally {
      setIsReleasing(null);
    }
  };

  // 4. Admin Reset Handler
  const handleResetSandbox = async () => {
    setIsResetting(true);
    setErrorNotification(null);

    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      if (res.ok) {
        triggerNotification(
          "Database Seeded Pristine",
          "Sandbox database and concurrent registers have been wiped and re-seeded back to original values.",
          "success"
        );
        fetchAllData();
      } else {
        triggerNotification("Reset Aborted", "DB server rejected clean instruction.", "info");
      }
    } catch (err: any) {
      triggerNotification("Reset Server Crash", err.message, "conflict");
    } finally {
      setIsResetting(false);
    }
  };

  const activeHoldsCount = reservations.filter(r => r.status === "pending" && r.expiresAt > Date.now()).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      
      {/* Top Navbar */}
      <Header
        onReset={handleResetSandbox}
        isResetting={isResetting}
        activeHoldsCount={activeHoldsCount}
        serverOk={serverOk}
      />

      {/* Main Container Workspace */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 flex-1 flex flex-col gap-6">

        {/* Dynamic Slid-In Interactive Alert Panel */}
        {errorNotification && (
          <div className={`p-4 rounded-xl border flex items-start gap-3 shadow-sm transition-all animate-in fade-in slide-in-from-top-4 duration-300 ${
            errorNotification.type === "conflict"
              ? "bg-rose-50 border-rose-200 text-rose-900"
              : errorNotification.type === "expired"
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : errorNotification.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-indigo-50 border-indigo-200 text-indigo-900"
          }`}>
            <span className="text-xl shrink-0">
              {errorNotification.type === "conflict" && "🔒"}
              {errorNotification.type === "expired" && "⚠️"}
              {errorNotification.type === "success" && "🟢"}
              {errorNotification.type === "info" && "ℹ️"}
            </span>
            <div className="flex-1">
              <h4 className="font-bold text-xs uppercase tracking-wide">
                {errorNotification.title}
              </h4>
              <p className="text-xs font-semibold mt-1 leading-normal opacity-90">
                {errorNotification.message}
              </p>
            </div>
            <button
              onClick={() => setErrorNotification(null)}
              className="p-1 rounded hover:bg-black/5 text-slate-500 hover:text-black cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Architectural Concept Intro Banner */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row gap-5 items-center justify-between shadow-sm">
          <div className="flex items-start gap-4">
            <div className="bg-brand-50 p-3 rounded-xl shrink-0 hidden sm:block border border-slate-100">
              <Lock className="w-6 h-6 text-brand-500" />
            </div>
            <div>
              <h2 className="font-sans font-bold text-base text-slate-800 flex items-center gap-2">
                Solving Shopping Race Conditions with Stock Reservations
              </h2>
              <p className="text-xs text-slate-500 mt-1 max-w-[700px] leading-normal font-medium">
                Decrements at payment time cause oversold items; decrements at add-to-cart cause abandoned carts to tank conversions.
                Allo's solution reserves items temporarily for <strong className="text-brand-500 font-semibold font-mono">10 minutes</strong>. Uncheckout holds auto-release 
                instantly. Our Node.js Mutex queue protects this atomically under extreme concurrency.
              </p>
            </div>
          </div>
          <div className="flex gap-2.5 shrink-0">
            <a 
              href="#docs" 
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('tech-specs')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-[11px] font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 py-2.5 px-4 rounded-lg flex items-center gap-1.5 transition-all"
            >
              <FileText className="w-3.5 h-3.5" />
              Technical Specs
            </a>
          </div>
        </div>

        {/* Global Loading Spinner */}
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-brand-500" />
            <span className="text-xs font-semibold font-mono">Bootstrapping Alloy Sandbox Environment...</span>
          </div>
        ) : !serverOk ? (
          <div className="flex-1 bg-rose-50 border border-rose-100 rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-4 py-20 max-w-xl mx-auto">
            <div className="bg-rose-100 p-4 rounded-full text-rose-600">
              <ServerCrash className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-sans font-bold text-lg text-rose-950">Allo Sandbox Server unreachable</h3>
              <p className="text-xs text-rose-600/80 mt-1 max-w-[350px] mx-auto leading-normal">
                The development server process may still be booting or is compiled incorrectly. Make sure tsx and esbuild scripts initialized.
              </p>
            </div>
            <button
              onClick={fetchAllData}
              className="bg-rose-600 text-white font-bold text-xs py-2.5 px-5 rounded-lg hover:bg-rose-700 transition-colors"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          /* Split Grid Dashboard Column Setup */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Content Column (7 cols): Simulation Controls + Products Grid Catalog */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              
              {/* Concurrency Simulator Terminal Dashboard */}
              <SimulationControls
                products={products}
                warehouses={warehouses}
                onReservationCreated={fetchAllData}
                holdMinutes={holdMinutes}
                setHoldMinutes={setHoldMinutes}
              />

              {/* Product Inventory Catalog Grid */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-sans font-bold text-base text-slate-800 flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-indigo-400" />
                    Product Catalog
                  </h3>
                  <span className="text-[10px] font-mono font-bold bg-white border border-slate-200 px-2 py-1 rounded-md text-slate-500 shadow-sm">
                    SKUs count: {products.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {products.map((product) => {
                    // Check if this product has an active reservation
                    const hasHold = reservations.some(
                      (r) => r.productId === product.id && r.status === "pending" && r.expiresAt > Date.now()
                    );

                    return (
                      <ProductCard
                        key={product.id}
                        product={product}
                        warehouses={warehouses}
                        onReserve={handleReserveStock}
                        isReserving={isReserving}
                        hasActiveHold={hasHold}
                      />
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Right Content Column (5 cols): Secure Desk Countdown + Audits Ledger */}
            <div className="lg:col-span-5 flex flex-col gap-6 sticky top-[92px]">
              
              <CheckoutTracker
                reservations={reservations}
                products={products}
                warehouses={warehouses}
                onConfirm={handleConfirmReservation}
                onRelease={handleReleaseReservation}
                isConfirming={isConfirming}
                isReleasing={isReleasing}
                onRefresh={fetchAllData}
              />

            </div>

          </div>
        )}

        {/* --- DETAILED TECHNICAL SPECIFICATIONS FOOTNOTE --- */}
        <section id="tech-specs" className="border-t border-slate-200 mt-12 pt-8 mb-6 text-xs text-slate-500 flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-brand-500" />
            <h3 className="font-sans font-bold text-sm text-slate-800 uppercase tracking-widest">
              System Architecture Under the Hood
            </h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans leading-relaxed">
            
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
              <h4 className="font-bold text-slate-800 mb-1">1. Concurrency Mutex Queue</h4>
              <p className="text-[11px] text-slate-400 font-medium">
                Correctness is guaranteed using a serialized KeyedMutex Map keyed per product:warehouse. 
                Any simultaneous HTTP requests trying to allocate units for the same stock inventory pool are queued. The first transaction locks the record, subtracts inventory, updates status, and unlocks. Subsequent requests check availability cleanly.
              </p>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
              <h4 className="font-bold text-slate-800 mb-1">2. Double-Defense Cleanups</h4>
              <p className="text-[11px] text-slate-400 font-medium">
                Holds are cleaned up via a dual passive/active schedule. 
                Our Express server initializes a background interval routine verifying expirations every 5 seconds, returning locks back to inventory.Every transactional fetch request or endpoint trigger actively schedules a lazy automatic check beforehand.
              </p>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
              <h4 className="font-bold text-slate-800 mb-1">3. Idempotency-Key Caching</h4>
              <p className="text-[11px] text-slate-400 font-medium">
                To prevent network failures triggering duplicate actions, reservation and checkout confirmation routes accept the Idempotency-Key header. 
                On matching keys, the system returns identical cached response metrics immediately without repeating state mutations.
              </p>
            </div>

          </div>
        </section>

      </main>

      {/* Sleek footer from the design mock */}
      <footer className="h-10 bg-white border-t border-slate-200 flex items-center px-4 sm:px-8 justify-between flex-shrink-0 text-[10px] text-slate-400 font-mono font-bold uppercase mt-auto">
        <div className="flex gap-6">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <span>Mutex Database Core: Engaged</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <span>Sandbox State Engine: Healthy</span>
          </div>
        </div>
        <div>STAGING-US-WEST-2 // NODE-3000</div>
      </footer>
    </div>
  );
}
