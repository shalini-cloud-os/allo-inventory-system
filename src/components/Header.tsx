import { Database, RefreshCw, Layers, ShieldCheck, Activity } from "lucide-react";

interface HeaderProps {
  onReset: () => void;
  isResetting: boolean;
  activeHoldsCount: number;
  serverOk: boolean;
}

export default function Header({ onReset, isResetting, activeHoldsCount, serverOk }: HeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Logo and Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center text-white font-bold">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-extrabold text-lg tracking-tight text-slate-800">Allo <span className="text-brand-500">Inventory</span></span>
              <span className="bg-brand-50 text-brand-500 border border-brand-100 text-[10px] px-2 py-0.5 rounded-full font-sans font-semibold">Sandbox</span>
            </div>
          </div>
        </div>

        {/* Center menu links from our design mock */}
        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-500 mr-auto ml-8">
          <span className="text-brand-500 cursor-pointer hover:text-brand-800 transition-colors">Dashboard</span>
          <span className="cursor-not-allowed text-slate-300">Warehouses</span>
          <span className="cursor-not-allowed text-slate-300">Orders</span>
          <span className="cursor-not-allowed text-slate-300">Analytics</span>
        </div>

        {/* Live Metrics & Indicators */}
        <div className="flex items-center gap-3 text-xs">
          {/* Node Server Indicator */}
          <div className="hidden sm:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${serverOk ? "bg-emerald-400" : "bg-rose-400"}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${serverOk ? "bg-emerald-500" : "bg-rose-500"}`}></span>
            </span>
            <span className="text-[11px] text-slate-600 font-medium">Node backend: {serverOk ? "Live" : "Connecting..."}</span>
          </div>

          {/* Active Holds Counter */}
          <div className="flex items-center gap-1.5 bg-brand-50 text-brand-500 border border-brand-100 px-3 py-1.5 rounded-full">
            <Activity className="w-3 h-3 text-brand-500 animate-pulse" />
            <span className="text-[11px] text-slate-700 font-semibold font-mono">
              Holds: <span className="text-brand-500">{activeHoldsCount}</span>
            </span>
          </div>

          {/* Redev/Reset Action Button */}
          <button
            onClick={onReset}
            disabled={isResetting}
            className="flex items-center gap-1.5 text-[11px] font-bold bg-white text-slate-700 border border-slate-200 rounded-lg py-1.5 px-3 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            id="reset-db-btn"
          >
            <RefreshCw className={`w-3 h-3 ${isResetting ? "animate-spin" : ""}`} />
            RESET
          </button>
        </div>

      </div>
    </header>
  );
}
