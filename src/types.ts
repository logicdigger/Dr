export const STAGES = ["Cutting", "Stitching", "Overlock", "Folding", "Packed"] as const;
export type Stage = (typeof STAGES)[number];

export type MaterialType = "Fabric" | "Thread" | "Accessory";

export interface Order {
  id: string;
  party_name: string;
  order_number: string;
  style_name: string;
  quantity: number;
  delivery_date: string;
  rate_per_piece: number;
  created_at: string;
}

export interface ProductionLog {
  id: string;
  order_id: string;
  stage: Stage;
  qty_in: number;
  qty_out: number;
  log_date: string;
  created_at: string;
}

export interface Worker {
  id: string;
  name: string;
  mobile_number: string;
  process: Stage;
  rate_per_piece: number;
  opening_balance: number;
  work_assigned: number;
  created_at: string;
}

export interface DailyEntry {
  id: string;
  entry_date: string;
  order_id: string;
  worker_id: string;
  process: Stage;
  qty_completed: number;
  created_at: string;
}

export interface WorkerAdvance {
  id: string;
  worker_id: string;
  amount: number;
  paid_on: string;
  note: string | null;
  created_at: string;
}

export interface MaterialLedger {
  id: string;
  order_id: string;
  entry_date: string;
  material_type: MaterialType;
  quantity_received: number;
  quantity_consumed: number;
  wastage: number;
  created_at: string;
}
