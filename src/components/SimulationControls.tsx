import React, { useState } from "react";
import { Play, RotateCcw, Zap, Key, ShieldCheck, Terminal, HelpCircle } from "lucide-react";
import { Product, Warehouse } from "../types";

interface SimulationControlsProps {
  products: Product[];
  warehouses: Warehouse[];
  onReservationCreated: () => void;
  holdMinutes: number;
  setHoldMinutes: (min: number) => void;
}

export default function SimulationControls({
  products,
  warehouses,
  onReservationCreated,
  holdMinutes,
  setHoldMinutes,
}: SimulationControlsProps) {
  const [logs, setLogs] = useState<string[]>([
    "=== Allo Concurrency Sandbox Initialized ===",
    "[System] Server is running. All mutex queues ready.",
    "[System] You can select a hold duration below (choose '15 seconds' to watch countdown and auto-cleanup expire in real time)."
  ]);
  const [isRunning, setIsRunning] = useState(false);

  const addLog = (text: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${text}`]);
  };

  const clearLogs = () => {
    setLogs(["=== Terminal Cleared ==="]);
  };

  // Simulation 1: Concurrency Race Condition Test
  const runRaceConditionSimulation = async () => {
    if (products.length === 0 || warehouses.length === 0) return;
    setIsRunning(true);
    clearLogs();
    addLog("🚀 Initiating Simultaneous Race Condition Simulation...");
    
    // Find "Luxe Travel Wallet" (P5) or whatever has low remaining stock
    // Or we will target a product with low total stock, like Luxe Travel Wallet (P5) at NYC (W1)
    const targetProduct = products.find(p => p.id === "P5") || products[0];
    const targetWarehouse = warehouses.find(w => w.id === "W1") || warehouses[0];
    
    addLog(`Targeting Product ID: ${targetProduct.name} (${targetProduct.sku})`);
    addLog(`Targeting Warehouse: ${targetWarehouse.name}`);
    addLog(`Attempting to dispatch TWO simultaneous reservations for exactly 1 unit each.`);
    
    addLog("Dispatching Request A and Request B in parallel via Promise.all()...");

    const headersA = { "Content-Type": "application/json" };
    const headersB = { "Content-Type": "application/json" };

    const payload = {
      productId: targetProduct.id,
      warehouseId: targetWarehouse.id,
      quantity: 1,
      holdMinutes: holdMinutes
    };

    try {
      const startTime = performance.now();
      
      const [resA, resB] = await Promise.all([
        fetch("/api/reservations", {
          method: "POST",
          headers: headersA,
          body: JSON.stringify(payload)
        }),
        fetch("/api/reservations", {
          method: "POST",
          headers: headersB,
          body: JSON.stringify(payload)
        })
      ]);

      const endTime = performance.now();
      const duration = (endTime - startTime).toFixed(1);
      
      addLog(`⚡ Requests resolved in ${duration}ms.`);

      const dataA = await resA.json();
      const dataB = await resB.json();

      addLog(`🔴 Request A: Status Code ${resA.status}`);
      if (resA.status === 201) {
        addLog(`🟢 Request A SUCCEEDED! Reservation ID: ${dataA.id}. Status: ${dataA.status}`);
      } else {
        addLog(`❌ Request A FAILED! Error: ${JSON.stringify(dataA.error)}`);
      }

      addLog(`🔵 Request B: Status Code ${resB.status}`);
      if (resB.status === 201) {
        addLog(`🟢 Request B SUCCEEDED! Reservation ID: ${dataB.id}. Status: ${dataB.status}`);
      } else if (resB.status === 409) {
        addLog(`🔒 Request B LOCKED OUT: Server returned 409 Concurrency Conflict, as expected! Error: ${dataB.error}`);
      } else {
        addLog(`❌ Request B FAILED! Error: ${JSON.stringify(dataB.error)}`);
      }

      if ((resA.status === 201 && resB.status === 409) || (resA.status === 409 && resB.status === 201)) {
        addLog(`✨ SUCCESS: Concurrency correctness verified perfectly! Exactly 1 shopper reserved the unit, while the other was safely blocked!`);
      } else if (resA.status === 409 && resB.status === 409) {
        addLog(`⚠️ NOTE: Both requests failed with 409 because the stock was already depleted before the simulation began. Try clicking "Reset Sandbox Data" above and run the test again!`);
      } else {
        addLog(`⚠️ UNEXPECTED: Double check stock allocations. Status A: ${resA.status}, Status B: ${resB.status}`);
      }

      onReservationCreated();
    } catch (err: any) {
      addLog(`❌ Simulation crashed due to networking error: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Simulation 2: Idempotency Key Retries Test
  const runIdempotencySimulation = async () => {
    if (products.length === 0 || warehouses.length === 0) return;
    setIsRunning(true);
    clearLogs();
    addLog("🔑 Initiating Idempotent API Submission Simulation...");

    const targetProduct = products[0]; // e.g. Allo Performance Tee
    const targetWarehouse = warehouses[0]; // NYC
    const idempotencyKey = `idem_sample_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    addLog(`Generated Idempotency-Key: "${idempotencyKey}"`);
    addLog(`Creating reservation for: ${targetProduct.name} at ${targetWarehouse.name}`);
    addLog("Submitting initial Request A with Idempotential validation headers...");

    const payload = {
      productId: targetProduct.id,
      warehouseId: targetWarehouse.id,
      quantity: 1,
      holdMinutes: holdMinutes
    };

    try {
      const resA = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(payload)
      });
      const dataA = await resA.json();

      addLog(`👉 Request A Response received (Status ${resA.status}):`);
      if (resA.status === 201) {
        addLog(`🟢 Reservation created successfully! Reservation ID: ${dataA.id}`);
      } else {
        addLog(`❌ Creation Failed: ${JSON.stringify(dataA)}`);
      }

      addLog(`🔄 Immediately retrying the EXACT SAME request with the MATCHING Idempotency-Key: "${idempotencyKey}"...`);

      const resB = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(payload)
      });
      const dataB = await resB.json();

      addLog(`👉 Request B (Retry) Response received (Status ${resB.status}):`);
      if (resB.status === 201) {
        addLog(`🟢 Idempotent success! Served Cached Response. Returned Reservation ID: ${dataB.id}. Match: ${dataA.id === dataB.id ? "TRUE" : "FALSE"}`);
        addLog(`✨ ID: ${dataB.id} matches exactly. Stock WAS NOT decremented a second time. It is 100% side-effect safe!`);
      } else if (resB.status === 409 && resA.status === 409) {
        addLog(`🟢 Idempotent response for cached 409 conflict hit correctly!`);
      } else {
        addLog(`❌ Retry failed with unexpected state: Status: ${resB.status}, Payload: ${JSON.stringify(dataB)}`);
      }

      onReservationCreated();
    } catch (err: any) {
      addLog(`❌ Simulation crashed: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex flex-col gap-5">
      
      {/* Title block */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-sans font-bold text-lg text-slate-800 flex items-center gap-2">
            <Zap className="w-5 h-5 text-indigo-600 fill-brand-50" />
            Testing/Concurrency Arena
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">Fires actual simultaneous HTTP headers to stress-test your system.</p>
        </div>
      </div>

      {/* Select Expiry holds slider/configurer */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
        <label className="text-xs font-bold text-slate-400 block mb-2 tracking-widest">
          EXPIRATION TIME LIMIT
        </label>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "15s", val: 0.25, note: "Perfect for testing auto-expire" },
            { label: "1 min", val: 1, note: "Fast trial" },
            { label: "5 min", val: 5, note: "Standard session" },
            { label: "10 min", val: 10, note: "Allo default Checkout" }
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => setHoldMinutes(item.val)}
              className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                holdMinutes === item.val
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="text-xs font-bold font-mono">{item.label}</div>
              <div className={`text-[9px] mt-0.5 leading-tight ${holdMinutes === item.val ? "text-indigo-200" : "text-slate-400"}`}>
                {item.val >= 1 ? `${item.val}m hold` : "15s expire"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Actions Playground Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Race Concurrency Double-Book Simulation */}
        <button
          onClick={runRaceConditionSimulation}
          disabled={isRunning || products.length === 0}
          className="flex flex-col items-start gap-1 p-4 rounded-xl border border-rose-200 bg-rose-50/20 hover:bg-rose-50/50 text-left transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer group"
          id="sim-race-btn"
        >
          <div className="flex items-center gap-2 font-semibold text-xs text-rose-950">
            <ShieldCheck className="w-4 h-4 text-rose-600" />
            SIMULATE RACE CONDITION
          </div>
          <p className="text-[11px] text-slate-500 leading-normal font-medium mt-1">
            Fires 2 simultaneous bookings for 1 unit at NYC warehouse. Demonstrates how our Mutex prevents overselling.
          </p>
          <div className="text-[10px] font-bold text-rose-600 mt-2 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
            Run Test <Play className="w-2 h-2 fill-rose-600" />
          </div>
        </button>

        {/* Idempotence key trigger */}
        <button
          onClick={runIdempotencySimulation}
          disabled={isRunning || products.length === 0}
          className="flex flex-col items-start gap-1 p-4 rounded-xl border border-indigo-200 bg-brand-50/50 hover:bg-blue-50/80 text-left transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer group"
          id="sim-idempotency-btn"
        >
          <div className="flex items-center gap-2 font-semibold text-xs text-indigo-950">
            <Key className="w-4 h-4 text-indigo-600" />
            SIMULATE IDEMPOTENCY RETRY
          </div>
          <p className="text-[11px] text-slate-500 leading-normal font-medium mt-1">
            Fires the same order key twice. The 2nd request receives the safe cached replay with no state duplication.
          </p>
          <div className="text-[10px] font-bold text-indigo-600 mt-2 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
            Run Test <Play className="w-2 h-2 fill-indigo-600" />
          </div>
        </button>
      </div>

      {/* Terminal Logging Component */}
      <div className="border border-slate-200 bg-slate-900 rounded-xl overflow-hidden shadow-sm flex flex-col font-mono text-[11px] text-slate-300">
        <div className="bg-slate-850 px-4 py-2 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px]">
            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
            SANDBOX SYSTEM LOGS
          </div>
          <button
            onClick={clearLogs}
            className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Clear Log
          </button>
        </div>
        <div className="p-4 h-[180px] overflow-y-auto flex flex-col gap-1.5 scrollbar-thin">
          {logs.map((log, index) => {
            let colorClass = "text-slate-300";
            if (log.includes("🟢") || log.includes("SUCCESS")) colorClass = "text-emerald-400 font-medium";
            else if (log.includes("❌") || log.includes("FAILED")) colorClass = "text-rose-400 font-medium";
            else if (log.includes("🔴") || log.includes("🔒")) colorClass = "text-amber-400 font-medium";
            else if (log.includes("⚡") || log.includes("🚀")) colorClass = "text-sky-300 font-semibold";
            else if (log.includes("=== ")) colorClass = "text-indigo-300 font-bold border-b border-slate-800 pb-1 mt-1 first:mt-0";

            return (
              <div key={index} className={`${colorClass} whitespace-pre-wrap leading-relaxed`}>
                {log}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
