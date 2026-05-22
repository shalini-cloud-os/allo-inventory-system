export interface Warehouse {
  id: string;
  name: string;
  location: string;
}

export interface StockLevel {
  productId: string;
  warehouseId: string;
  total: number;       // Physical units in warehouse
  reserved: number;    // Temporarily held units
  available: number;   // total - reserved
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  sku: string;
  stocks: StockLevel[]; // Stock level per warehouse
}

export type ReservationStatus = 'pending' | 'confirmed' | 'released';

export interface Reservation {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: ReservationStatus;
  createdAt: number;   // Timestamp (ms)
  expiresAt: number;   // Timestamp (ms)
  idempotencyKey?: string;
}

export interface IdempotencyRecord {
  key: string;
  statusCode: number;
  body: any;
  createdAt: number;
}

export interface ApiProductsResponse {
  products: Product[];
}

export interface ApiWarehousesResponse {
  warehouses: Warehouse[];
}

export interface CreateReservationRequest {
  productId: string;
  warehouseId: string;
  quantity: number;
  holdMinutes?: number; // allow customizing expiry for ease of testing
}
