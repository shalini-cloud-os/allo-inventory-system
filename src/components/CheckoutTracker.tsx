import { useState, useEffect } from "react";
import { Reservation, Product, Warehouse } from "../types";
import { 
  CreditCard, 
  Hourglass, 
  X, 
  Check, 
  RefreshCw, 
  Info, 
  Trash2, 
  Timer, 
  ShieldAlert, 
  Receipt 
} from "lucide-react";

// Individual Countdown component to avoid re-rendering the outer view
interface CountdownProps {
  expiresAt: number;
  status: string;
  onExpire: () => void;
}

function CountdownTimer({ expiresAt, status, onExpire }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<number>(Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    if (status !== "pending" || timeLeft <= 0) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, expiresAt - Date.now());
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 200);

    return () => clearInterval(interval);
  }, [expiresAt, status, timeLeft, onExpire]);

  if (status !== "pending") {
    return (
      <span className="text-xs font-semibold text-gray-400 font-mono">
        Ended
      </span>
    );
  }

  if (timeLeft <= 0) {
    return (
      <span className="text-xs font-bold text-red-600 animate-pulse font-mono flex items-center gap-1">
        <ShieldAlert className="w-3.5 h-3.5" />
        EXPIRED
      </span>
    );
  }

  const totalMin = Math.floor(timeLeft / 60000);
  const totalSec = Math.floor((timeLeft % 60000) / 1000);
  const formattedTime = `${totalMin.toString().padStart(2, "0")}:${totalSec.toString().padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200/50 px-2.5 py-1 rounded-lg">
      <Timer className="w-3.5 h-3.5 text-amber-600 animate-spin" style={{ animationDuration: "3s" }} />
      <span className="font-mono text-xs font-extrabold tracking-wide">
        {formattedTime}
      </span>
    </div>
  );
}

interface CheckoutTrackerProps {
  reservations: Reservation[];
  products: Product[];
  warehouses: Warehouse[];
  onConfirm: (reservationId: string) => Promise<void>;
  onRelease: (reservationId: string) => Promise<void>;
  isConfirming: string | null;  // holds reservation ID currently confirming
  isReleasing: string | null;   // holds reservation ID currently releasing
  onRefresh: () => void;
}

export default function CheckoutTracker({
  reservations,
  products,
  warehouses,
  onConfirm,
  onRelease,
  isConfirming,
  isReleasing,
  onRefresh,
}: CheckoutTrackerProps) {
  
  // Track expirations client side to trigger onExpire callbacks
  const handleExpireCallback = (id: string) => {
    console.log(`Reservation ${id} expired in client countdown; refreshing database...`);
    // Lazily update layout
    onRefresh();
  };

  const getProductDetail = (productId: string) => {
    return products.find(p => p.id === productId);
  };

  const getWarehouseDetail = (warehouseId: string) => {
    return warehouses.find(w => w.id === warehouseId);
  };

  // Divide reservations into Active (pending) vs Logs (confirmed or released)
  const activeReservations = reservations.filter(r => r.status === "pending" && r.expiresAt > Date.now());
  const inactiveReservations = reservations.filter(r => r.status !== "pending" || r.expiresAt <= Date.now());

  // Show the most recently created pending reservation in high detail (main checkout checkout card)
  const currentActive = activeReservations[0];
  const activeProduct = currentActive ? getProductDetail(currentActive.productId) : null;
  const activeWarehouse = currentActive ? getWarehouseDetail(currentActive.warehouseId) : null;

  return (
    <div className="flex flex-col gap-6">

      {/* --- SECTION 1: DETAILED SECURE PAYMENT DESK (3DS Sim) --- */}
      {currentActive ? (
        <div className="bg-indigo-950 text-white rounded-2xl shadow-lg border border-indigo-950 overflow-hidden relative">
          
          {/* Subtle design element decorations */}
          <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-800/20 rounded-full blur-2xl pointer-events-none" />
          
          {/* Desk Header */}
          <div className="border-b border-white/10 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-indigo-400" />
              <span className="font-sans font-bold text-xs tracking-wider text-indigo-200 uppercase">
                Active Reservation
              </span>
            </div>
            
            {/* Live Expiration Countdown */}
            <CountdownTimer
              expiresAt={currentActive.expiresAt}
              status={currentActive.status}
              onExpire={() => handleExpireCallback(currentActive.id)}
            />
          </div>

          <div className="p-5 flex flex-col gap-4">
            
            <div className="text-2xl font-mono font-bold tracking-tighter text-white">
              <span className="text-xs text-indigo-300 block font-sans tracking-normal uppercase font-semibold mb-1">Reservation ID</span>
              #{currentActive.id}
            </div>

            {/* Reservation specifications */}
            <div className="space-y-4 my-2 border-t border-b border-white/5 py-4">
              <div>
                <div className="text-xs text-indigo-300 mb-1">Reserved Stock Item</div>
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  <img 
                    src={activeProduct?.imageUrl} 
                    alt={activeProduct?.name} 
                    className="w-8 h-8 rounded object-cover border border-white/10"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <span>{activeProduct?.name}</span>
                    <span className="text-[10px] text-indigo-400 block font-mono font-normal">Qty: {currentActive.quantity} unit{currentActive.quantity > 1 ? "s" : ""} · {activeWarehouse?.name.replace(" Warehouse", "")}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Total purchase summary inside card */}
            <div className="flex justify-between items-center bg-indigo-900/40 px-3 py-2.5 rounded-lg border border-indigo-800/30 text-xs">
              <span className="text-indigo-200">Total Checkout Price:</span>
              <span className="font-display font-extrabold text-base text-white">
                ${activeProduct ? activeProduct.price * currentActive.quantity : 0}
              </span>
            </div>

            {/* Action CTAs */}
            <div className="grid grid-cols-2 gap-3 mt-1">
              
              {/* Confirm Purchase CTA */}
              <button
                onClick={() => onConfirm(currentActive.id)}
                disabled={!!isConfirming || !!isReleasing}
                className="py-2.5 bg-white text-indigo-900 text-xs font-bold rounded-lg hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                id="payment-confirm-btn"
              >
                {isConfirming === currentActive.id ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Confirm
              </button>

              {/* Early release cancel CTA */}
              <button
                onClick={() => onRelease(currentActive.id)}
                disabled={!!isConfirming || !!isReleasing}
                className="py-2.5 bg-indigo-800 text-white hover:bg-indigo-700 text-xs font-bold rounded-lg active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                id="payment-cancel-btn"
              >
                {isReleasing === currentActive.id ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <X className="w-3.5 h-3.5" />
                )}
                Cancel
              </button>

            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-full flex items-center justify-center text-slate-400">
            <Hourglass className="w-5 h-5 animate-pulse text-indigo-500" />
          </div>
          <div>
            <h3 className="font-display font-bold text-sm text-slate-800">Secure Checkout Desk</h3>
            <p className="text-xs text-slate-400 max-w-[250px] mx-auto mt-1 leading-normal font-medium">
              No active reservations. Pick any SKU from the product catalog to lock inventory and trigger checkout.
            </p>
          </div>
        </div>
      )}

      {/* --- SECTION 2: LIST OF ACTIVE SESSIONS --- */}
      {activeReservations.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
          <h4 className="text-[10px] uppercase tracking-widest text-slate-400 font-extrabold">
            Concurrent Active Reserved Holds ({activeReservations.length - 1})
          </h4>
          <div className="flex flex-col gap-2">
            {activeReservations.slice(1).map((res) => {
              const prod = getProductDetail(res.productId);
              const wh = getWarehouseDetail(res.warehouseId);

              return (
                <div key={res.id} className="border border-slate-100 bg-slate-50/50 p-2.5 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-slate-800">{prod?.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {res.quantity} unit{res.quantity > 1 ? "s" : ""} · {wh?.name.replace(" Warehouse", "")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CountdownTimer
                      expiresAt={res.expiresAt}
                      status={res.status}
                      onExpire={() => handleExpireCallback(res.id)}
                    />
                    <button
                      onClick={() => onRelease(res.id)}
                      disabled={!!isReleasing}
                      className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-slate-100 transition-colors"
                      title="Release reserve early"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- SECTION 3: TRANSACTIONAL SANBOX LEDGER (Audits) --- */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col overflow-hidden">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
          Audited System Events
        </div>

        {inactiveReservations.length > 0 ? (
          <div className="flex flex-col gap-3 max-h-[260px] overflow-y-auto scrollbar-thin font-mono text-[11px]">
            {inactiveReservations.map((res) => {
              const prod = getProductDetail(res.productId);
              const wh = getWarehouseDetail(res.warehouseId);
              
              const isPastExpiry = res.status === "pending" && res.expiresAt <= Date.now();
              const isConfirmed = res.status === "confirmed";

              let stripeColor = "border-indigo-400";
              let textStatus = "text-slate-700";
              let actionTitle = "RELEASED";

              if (isConfirmed) {
                stripeColor = "border-emerald-500";
                textStatus = "text-emerald-700";
                actionTitle = "CONFIRMED";
              } else if (res.status === "released" || isPastExpiry) {
                stripeColor = "border-rose-500";
                textStatus = "text-rose-700";
                actionTitle = isPastExpiry ? "EXPIRED" : "RELEASED EARLY";
              }

              return (
                <div key={res.id} className={`p-3 bg-slate-50 rounded border-l-2 ${stripeColor} flex flex-col gap-1`}>
                  <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] pb-1 border-b border-slate-100/60">
                    <span>{new Date(res.createdAt).toLocaleTimeString()}</span>
                    <span className="font-bold">ID: {res.id}</span>
                  </div>
                  
                  <div className={`${textStatus} font-bold text-xs flex justify-between mt-1 items-center`}>
                    <span>{actionTitle}</span>
                    <span className="font-mono text-[11px]">${prod ? prod.price * res.quantity : 0}</span>
                  </div>

                  <div className="text-slate-500 leading-tight">
                    {res.quantity} unit{res.quantity > 1 ? "s" : ""} of {prod?.name} held at {wh?.name.replace(" Warehouse", "")}.
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-slate-400 italic font-mono bg-slate-50 rounded-xl border border-slate-100">
            Sandbox ledger logs are empty.
          </div>
        )}
      </div>

    </div>
  );
}
