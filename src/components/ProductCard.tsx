import React, { useState, FormEvent } from "react";
import { Warehouse, Product } from "../types";
import { Box, MapPin, Layers, Plus, Minus, CheckCircle, Flame, Server } from "lucide-react";

interface ProductCardProps {
  key?: string;
  product: Product;
  warehouses: Warehouse[];
  onReserve: (productId: string, warehouseId: string, quantity: number) => Promise<void>;
  isReserving: boolean;
  hasActiveHold: boolean;
}

export default function ProductCard({
  product,
  warehouses,
  onReserve,
  isReserving,
  hasActiveHold
}: ProductCardProps) {
  // Current chosen warehouse
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    product.stocks.find(s => s.available > 0)?.warehouseId || product.stocks[0]?.warehouseId || ""
  );
  
  // Reserving amount
  const [quantity, setQuantity] = useState<number>(1);

  const selectedStock = product.stocks.find(s => s.warehouseId === selectedWarehouseId);
  const availableCount = selectedStock ? selectedStock.available : 0;
  const warehouseDetail = warehouses.find(w => w.id === selectedWarehouseId);

  const handleIncrement = () => {
    // We let them go over available stock if they specifically wish to test a 49 conflict error, 
    // but default boundary safe is 99.
    setQuantity(prev => prev + 1);
  };

  const handleDecrement = () => {
    setQuantity(prev => Math.max(1, prev - 1));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouseId) return;
    onReserve(product.id, selectedWarehouseId, quantity);
  };

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-all duration-300 flex flex-col ${
      hasActiveHold 
        ? "border-brand-500 ring-2 ring-brand-500/10 shadow-md" 
        : "border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md"
    }`}>
      
      {/* Product Image Section with absolute badge */}
      <div className="relative h-48 w-full bg-slate-50 overflow-hidden">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-300"
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-3 left-3 bg-white px-2.5 py-1 rounded text-[10px] font-bold font-mono tracking-wider text-slate-700 shadow-sm border border-slate-200">
          {product.sku}
        </div>
        
        {hasActiveHold && (
          <div className="absolute top-3 right-3 bg-brand-500 text-white px-2.5 py-1 rounded text-[10px] font-semibold tracking-wide flex items-center gap-1 shadow-sm font-sans">
            <CheckCircle className="w-3 h-3" />
            ACTIVE LOCK
          </div>
        )}

        <div className="absolute bottom-3 right-3 bg-slate-900 text-white px-3 py-1 rounded-md text-sm font-bold font-sans shadow-md">
          ${product.price}
        </div>
      </div>

      {/* Main product description metadata */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div>
          <h3 className="font-sans font-bold text-base text-slate-800 leading-tight">
            {product.name}
          </h3>
          <p className="text-xs text-slate-400 mt-1 line-clamp-2 min-h-[32px] font-medium">
            {product.description}
          </p>
        </div>

        {/* Warehouse Stocks Grid Layout */}
        <div className="border-t border-slate-100 pt-3">
          <span className="text-[10px] font-bold text-slate-400 tracking-widest block mb-2">
            WAREHOUSE STOCKS
          </span>
          
          <div className="flex flex-col gap-2">
            {product.stocks.map((stock) => {
              const whState = warehouses.find(w => w.id === stock.warehouseId);
              const isSelected = selectedWarehouseId === stock.warehouseId;
              const isOutOfStock = stock.available <= 0;

              return (
                <div
                  key={stock.warehouseId}
                  onClick={() => !isOutOfStock && setSelectedWarehouseId(stock.warehouseId)}
                  className={`border rounded-xl p-2.5 transition-all cursor-pointer relative ${
                    isOutOfStock 
                      ? "bg-slate-50 border-slate-100 opacity-60 text-slate-400 cursor-not-allowed" 
                      : isSelected
                      ? "border-brand-500 bg-brand-50/50 shadow-sm"
                      : "border-slate-100 hover:border-slate-200 bg-white"
                  }`}
                >
                  {/* Wh header info */}
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`wh-radio-${product.id}`}
                        checked={isSelected}
                        disabled={isOutOfStock}
                        onChange={() => setSelectedWarehouseId(stock.warehouseId)}
                        className="w-3 h-3 text-brand-500 border-slate-300 focus:ring-brand-500 cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-slate-700 leading-tight">
                        {whState?.name.replace(" Warehouse", "") || stock.warehouseId}
                      </span>
                    </div>
                    
                    {/* Available visual badge */}
                    {isOutOfStock ? (
                      <span className="text-[9px] bg-red-100 text-red-800 font-bold px-1.5 py-0.5 rounded-full font-mono">
                        OUT
                      </span>
                    ) : (
                      <span className="text-[10px] text-brand-500 font-mono font-bold">
                        {stock.available} <span className="text-[9px] text-slate-400 font-normal">avail</span>
                      </span>
                    )}
                  </div>

                  {/* Stock numeric distribution details */}
                  <div className="flex justify-between items-center text-[10px] mt-1.5 font-mono text-slate-400">
                    <span className="flex items-center gap-1 font-medium">
                      Total Stock: {stock.total}
                    </span>
                    {stock.reserved > 0 && (
                      <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-1 rounded font-bold">
                        <Flame className="w-2.5 h-2.5 text-amber-500" />
                        Locks: {stock.reserved}
                      </span>
                    )}
                  </div>

                  {/* Capacity Bar */}
                  <div className="w-full h-1 bg-slate-100 rounded-full mt-2 overflow-hidden flex">
                    <div 
                      title={`Available Stock (${stock.available} units)`}
                      style={{ width: `${Math.min(100, (stock.available / Math.max(1, stock.total)) * 100)}%` }} 
                      className="bg-emerald-500 h-full"
                    />
                    <div 
                      title={`Reserved Temporary Holds (${stock.reserved} units)`}
                      style={{ width: `${Math.min(100, (stock.reserved / Math.max(1, stock.total)) * 100)}%` }} 
                      className="bg-amber-500 h-full"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic Reservation Formulation Section */}
        <form onSubmit={handleSubmit} className="border-t border-slate-100 pt-3 mt-auto flex flex-col gap-2.5">
          
          <div className="flex items-center justify-between gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
            <span className="text-xs font-semibold text-slate-500">QTY TO RESERVE</span>
            
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
              <button
                type="button"
                onClick={handleDecrement}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-colors active:scale-95 cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              
              <span className="w-8 text-center text-xs font-bold font-mono text-slate-800">
                {quantity}
              </span>
              
              <button
                type="button"
                onClick={handleIncrement}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-colors active:scale-95 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Core Reserve Button Trigger */}
          <button
            type="submit"
            disabled={isReserving || !selectedWarehouseId || availableCount <= 0 && quantity === 1}
            className="w-full bg-indigo-600 text-white font-sans font-bold text-xs py-3 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            id={`reserve-btn-${product.id}`}
          >
            <Server className="w-3.5 h-3.5" />
            {isReserving 
              ? "Locking Stock..." 
              : availableCount <= 0 
              ? "Out of Stock (Force)" 
              : `Reserve`
            }
          </button>
        </form>
      </div>

    </div>
  );
}
