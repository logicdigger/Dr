import { FormEvent, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import {
  DailyEntry,
  MaterialLedger,
  MaterialType,
  Order,
  ProductionLog,
  STAGES,
  Stage,
  Worker,
  WorkerAdvance,
} from "./types";

type TabKey = "orders" | "production" | "workers" | "daily" | "payments" | "materials" | "reports";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "orders", label: "Customer Orders" },
  { key: "production", label: "Production Tracking" },
  { key: "workers", label: "Worker Management" },
  { key: "daily", label: "Daily Entry" },
  { key: "payments", label: "Payment Ledger" },
  { key: "materials", label: "Fabric & Accessories" },
  { key: "reports", label: "Reports" },
];

const today = new Date().toISOString().slice(0, 10);
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
const sum = (values: number[]) => values.reduce((acc, item) => acc + item, 0);

export default function App() {
  const [tab, setTab] = useState<TabKey>("orders");
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [productionLogs, setProductionLogs] = useState<ProductionLog[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [workerAdvances, setWorkerAdvances] = useState<WorkerAdvance[]>([]);
  const [materials, setMaterials] = useState<MaterialLedger[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");

  const [orderForm, setOrderForm] = useState({
    party_name: "",
    order_number: "",
    style_name: "",
    quantity: 0,
    delivery_date: today,
    rate_per_piece: 0,
  });
  const [productionForm, setProductionForm] = useState({
    order_id: "",
    stage: "Cutting" as Stage,
    qty_in: 0,
    qty_out: 0,
    log_date: today,
  });
  const [workerForm, setWorkerForm] = useState({
    name: "",
    mobile_number: "",
    process: "Stitching" as Stage,
    rate_per_piece: 0,
    work_assigned: 0,
    opening_balance: 0,
  });
  const [dailyForm, setDailyForm] = useState({
    entry_date: today,
    order_id: "",
    worker_id: "",
    process: "Stitching" as Stage,
    qty_completed: 0,
  });
  const [advanceForm, setAdvanceForm] = useState({ worker_id: "", amount: 0, paid_on: today, note: "" });
  const [materialForm, setMaterialForm] = useState({
    order_id: "",
    entry_date: today,
    material_type: "Fabric" as MaterialType,
    quantity_received: 0,
    quantity_consumed: 0,
    wastage: 0,
  });

  const loadData = async () => {
    if (!isSupabaseConfigured) return;
    setError("");
    const [o, p, w, d, a, m] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("production_logs").select("*").order("created_at", { ascending: false }),
      supabase.from("workers").select("*").order("created_at", { ascending: false }),
      supabase.from("daily_entries").select("*").order("created_at", { ascending: false }),
      supabase.from("worker_advances").select("*").order("created_at", { ascending: false }),
      supabase.from("materials_ledger").select("*").order("created_at", { ascending: false }),
    ]);
    const firstErr = o.error || p.error || w.error || d.error || a.error || m.error;
    if (firstErr) {
      setError(firstErr.message);
      return;
    }
    setOrders((o.data ?? []) as Order[]);
    setProductionLogs((p.data ?? []) as ProductionLog[]);
    setWorkers((w.data ?? []) as Worker[]);
    setDailyEntries((d.data ?? []) as DailyEntry[]);
    setWorkerAdvances((a.data ?? []) as WorkerAdvance[]);
    setMaterials((m.data ?? []) as MaterialLedger[]);
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (orders[0]) {
      setSelectedOrderId((current) => current || orders[0].id);
      setProductionForm((current) => ({ ...current, order_id: current.order_id || orders[0].id }));
      setDailyForm((current) => ({ ...current, order_id: current.order_id || orders[0].id }));
      setMaterialForm((current) => ({ ...current, order_id: current.order_id || orders[0].id }));
    }
  }, [orders]);

  useEffect(() => {
    if (workers[0]) {
      setDailyForm((current) => ({ ...current, worker_id: current.worker_id || workers[0].id }));
      setAdvanceForm((current) => ({ ...current, worker_id: current.worker_id || workers[0].id }));
    }
  }, [workers]);

  const ensureDb = () => {
    if (isSupabaseConfigured) return true;
    setError("Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable save/load.");
    return false;
  };

  const workerLedger = useMemo(
    () =>
      workers.map((worker) => {
        const completed = sum(
          dailyEntries.filter((entry) => entry.worker_id === worker.id).map((entry) => entry.qty_completed),
        );
        const earned = completed * worker.rate_per_piece;
        const advance = sum(workerAdvances.filter((item) => item.worker_id === worker.id).map((item) => item.amount));
        return { ...worker, completed, earned, advance, pending: worker.opening_balance + earned - advance };
      }),
    [dailyEntries, workerAdvances, workers],
  );

  const stageSummary = useMemo(
    () =>
      STAGES.map((stage) => {
        const rows = productionLogs.filter((row) => row.order_id === selectedOrderId && row.stage === stage);
        const inQty = sum(rows.map((row) => row.qty_in));
        const outQty = sum(rows.map((row) => row.qty_out));
        return { stage, inQty, outQty, balance: inQty - outQty };
      }),
    [productionLogs, selectedOrderId],
  );

  const workerRateMap = useMemo(() => new Map(workers.map((worker) => [worker.id, worker.rate_per_piece])), [workers]);

  const orderReports = useMemo(
    () =>
      orders.map((order) => {
        const packed = sum(
          productionLogs
            .filter((log) => log.order_id === order.id && log.stage === "Packed")
            .map((log) => log.qty_out),
        );
        const pending = Math.max(order.quantity - packed, 0);
        const labor = sum(
          dailyEntries
            .filter((entry) => entry.order_id === order.id)
            .map((entry) => entry.qty_completed * (workerRateMap.get(entry.worker_id) ?? 0)),
        );
        return {
          order,
          packed,
          pending,
          status: pending === 0 ? "Completed" : new Date(order.delivery_date) < new Date(today) ? "Overdue" : "Running",
          revenue: packed * order.rate_per_piece,
          labor,
        };
      }),
    [dailyEntries, orders, productionLogs, workerRateMap],
  );

  const onInsert = async (table: string, payload: Record<string, unknown>) => {
    if (!ensureDb()) return;
    const { error: insertError } = await supabase.from(table).insert(payload);
    if (insertError) setError(insertError.message);
    else await loadData();
  };

  const totalOrderValue = sum(orders.map((order) => order.quantity * order.rate_per_piece));
  const totalProducedValue = sum(orderReports.map((report) => report.revenue));
  const totalPendingPieces = sum(orderReports.map((report) => report.pending));
  const pendingWages = sum(workerLedger.map((worker) => worker.pending));

  const orderLabel = (orderId: string) => orders.find((order) => order.id === orderId)?.order_number ?? "-";
  const workerLabel = (workerId: string) => workers.find((worker) => worker.id === workerId)?.name ?? "-";

  return (
    <main className="container">
      <header className="header">
        <h1>Garment Production Manager</h1>
        <button type="button" className="button-secondary" onClick={() => void loadData()}>
          Refresh
        </button>
      </header>
      <p className="subtitle">Piece tracking + worker payment calculation for small job-work units.</p>
      {!isSupabaseConfigured && <div className="banner warning">Supabase config missing in .env file.</div>}
      {error && <div className="banner error">{error}</div>}

      <section className="kpis">
        <article><h3>Order Value</h3><p>{money(totalOrderValue)}</p></article>
        <article><h3>Produced Value</h3><p>{money(totalProducedValue)}</p></article>
        <article><h3>Pending Pieces</h3><p>{totalPendingPieces}</p></article>
        <article><h3>Pending Payment</h3><p>{money(pendingWages)}</p></article>
      </section>

      <nav className="tabs">
        {tabs.map((item) => (
          <button key={item.key} type="button" className={tab === item.key ? "tab active" : "tab"} onClick={() => setTab(item.key)}>
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "orders" && <section className="panel"><h2>Orders</h2><form className="form-grid" onSubmit={(e: FormEvent) => { e.preventDefault(); void onInsert("orders", orderForm); }}><input placeholder="Party" value={orderForm.party_name} onChange={(e) => setOrderForm({ ...orderForm, party_name: e.target.value })} required /><input placeholder="Order no" value={orderForm.order_number} onChange={(e) => setOrderForm({ ...orderForm, order_number: e.target.value })} required /><input placeholder="Style" value={orderForm.style_name} onChange={(e) => setOrderForm({ ...orderForm, style_name: e.target.value })} required /><input type="number" min={0} value={orderForm.quantity} onChange={(e) => setOrderForm({ ...orderForm, quantity: Number(e.target.value) })} required /><input type="date" value={orderForm.delivery_date} onChange={(e) => setOrderForm({ ...orderForm, delivery_date: e.target.value })} required /><input type="number" min={0} step="0.01" value={orderForm.rate_per_piece} onChange={(e) => setOrderForm({ ...orderForm, rate_per_piece: Number(e.target.value) })} required /><button type="submit">Save Order</button></form><table><thead><tr><th>Party</th><th>Order</th><th>Style</th><th>Qty</th><th>Delivery</th><th>Total</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td>{order.party_name}</td><td>{order.order_number}</td><td>{order.style_name}</td><td>{order.quantity}</td><td>{order.delivery_date}</td><td>{money(order.quantity * order.rate_per_piece)}</td></tr>)}</tbody></table></section>}

      {tab === "production" && <section className="panel"><h2>Production Tracking</h2><form className="form-grid" onSubmit={(e: FormEvent) => { e.preventDefault(); void onInsert("production_logs", productionForm); }}><select value={productionForm.order_id} onChange={(e) => setProductionForm({ ...productionForm, order_id: e.target.value })} required><option value="">Order</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.order_number}</option>)}</select><select value={productionForm.stage} onChange={(e) => setProductionForm({ ...productionForm, stage: e.target.value as Stage })}>{STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select><input type="number" min={0} placeholder="In" value={productionForm.qty_in} onChange={(e) => setProductionForm({ ...productionForm, qty_in: Number(e.target.value) })} required /><input type="number" min={0} placeholder="Out" value={productionForm.qty_out} onChange={(e) => setProductionForm({ ...productionForm, qty_out: Number(e.target.value) })} required /><input type="date" value={productionForm.log_date} onChange={(e) => setProductionForm({ ...productionForm, log_date: e.target.value })} required /><button type="submit">Save Movement</button></form><label className="inline-label">Summary Order<select value={selectedOrderId} onChange={(e) => setSelectedOrderId(e.target.value)}><option value="">Select</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.order_number}</option>)}</select></label><table><thead><tr><th>Stage</th><th>In</th><th>Out</th><th>Balance</th></tr></thead><tbody>{stageSummary.map((row) => <tr key={row.stage}><td>{row.stage}</td><td>{row.inQty}</td><td>{row.outQty}</td><td>{row.balance}</td></tr>)}</tbody></table></section>}

      {tab === "workers" && <section className="panel"><h2>Workers</h2><form className="form-grid" onSubmit={(e: FormEvent) => { e.preventDefault(); void onInsert("workers", workerForm); }}><input placeholder="Name" value={workerForm.name} onChange={(e) => setWorkerForm({ ...workerForm, name: e.target.value })} required /><input placeholder="Mobile" value={workerForm.mobile_number} onChange={(e) => setWorkerForm({ ...workerForm, mobile_number: e.target.value })} required /><select value={workerForm.process} onChange={(e) => setWorkerForm({ ...workerForm, process: e.target.value as Stage })}>{STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select><input type="number" min={0} step="0.01" placeholder="Rate" value={workerForm.rate_per_piece} onChange={(e) => setWorkerForm({ ...workerForm, rate_per_piece: Number(e.target.value) })} required /><input type="number" min={0} placeholder="Assigned" value={workerForm.work_assigned} onChange={(e) => setWorkerForm({ ...workerForm, work_assigned: Number(e.target.value) })} required /><input type="number" step="0.01" placeholder="Opening" value={workerForm.opening_balance} onChange={(e) => setWorkerForm({ ...workerForm, opening_balance: Number(e.target.value) })} required /><button type="submit">Save Worker</button></form><table><thead><tr><th>Name</th><th>Process</th><th>Assigned</th><th>Done</th><th>Rate</th><th>Earnings</th></tr></thead><tbody>{workerLedger.map((worker) => <tr key={worker.id}><td>{worker.name}</td><td>{worker.process}</td><td>{worker.work_assigned}</td><td>{worker.completed}</td><td>{money(worker.rate_per_piece)}</td><td>{money(worker.earned)}</td></tr>)}</tbody></table></section>}

      {tab === "daily" && <section className="panel"><h2>Daily Entries</h2><form className="form-grid" onSubmit={(e: FormEvent) => { e.preventDefault(); void onInsert("daily_entries", dailyForm); }}><input type="date" value={dailyForm.entry_date} onChange={(e) => setDailyForm({ ...dailyForm, entry_date: e.target.value })} required /><select value={dailyForm.order_id} onChange={(e) => setDailyForm({ ...dailyForm, order_id: e.target.value })} required><option value="">Order</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.order_number}</option>)}</select><select value={dailyForm.worker_id} onChange={(e) => setDailyForm({ ...dailyForm, worker_id: e.target.value })} required><option value="">Worker</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select><select value={dailyForm.process} onChange={(e) => setDailyForm({ ...dailyForm, process: e.target.value as Stage })}>{STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select><input type="number" min={0} placeholder="Qty" value={dailyForm.qty_completed} onChange={(e) => setDailyForm({ ...dailyForm, qty_completed: Number(e.target.value) })} required /><button type="submit">Save Daily</button></form><table><thead><tr><th>Date</th><th>Order</th><th>Worker</th><th>Process</th><th>Qty</th></tr></thead><tbody>{dailyEntries.map((entry) => <tr key={entry.id}><td>{entry.entry_date}</td><td>{orderLabel(entry.order_id)}</td><td>{workerLabel(entry.worker_id)}</td><td>{entry.process}</td><td>{entry.qty_completed}</td></tr>)}</tbody></table></section>}

      {tab === "payments" && <section className="panel"><h2>Payment Ledger</h2><form className="form-grid" onSubmit={(e: FormEvent) => { e.preventDefault(); void onInsert("worker_advances", { worker_id: advanceForm.worker_id, amount: advanceForm.amount, paid_on: advanceForm.paid_on, note: advanceForm.note || null }); }}><select value={advanceForm.worker_id} onChange={(e) => setAdvanceForm({ ...advanceForm, worker_id: e.target.value })} required><option value="">Worker</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select><input type="number" min={0} step="0.01" placeholder="Advance amount" value={advanceForm.amount} onChange={(e) => setAdvanceForm({ ...advanceForm, amount: Number(e.target.value) })} required /><input type="date" value={advanceForm.paid_on} onChange={(e) => setAdvanceForm({ ...advanceForm, paid_on: e.target.value })} required /><input placeholder="Note (optional)" value={advanceForm.note} onChange={(e) => setAdvanceForm({ ...advanceForm, note: e.target.value })} /><button type="submit">Save Advance</button></form><table><thead><tr><th>Worker</th><th>Opening</th><th>Earned</th><th>Advance</th><th>Pending</th></tr></thead><tbody>{workerLedger.map((worker) => <tr key={worker.id}><td>{worker.name}</td><td>{money(worker.opening_balance)}</td><td>{money(worker.earned)}</td><td>{money(worker.advance)}</td><td>{money(worker.pending)}</td></tr>)}</tbody></table></section>}

      {tab === "materials" && <section className="panel"><h2>Fabric & Accessories</h2><form className="form-grid" onSubmit={(e: FormEvent) => { e.preventDefault(); void onInsert("materials_ledger", materialForm); }}><select value={materialForm.order_id} onChange={(e) => setMaterialForm({ ...materialForm, order_id: e.target.value })} required><option value="">Order</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.order_number}</option>)}</select><input type="date" value={materialForm.entry_date} onChange={(e) => setMaterialForm({ ...materialForm, entry_date: e.target.value })} required /><select value={materialForm.material_type} onChange={(e) => setMaterialForm({ ...materialForm, material_type: e.target.value as MaterialType })}><option value="Fabric">Fabric</option><option value="Thread">Thread</option><option value="Accessory">Accessory</option></select><input type="number" min={0} step="0.01" placeholder="Received" value={materialForm.quantity_received} onChange={(e) => setMaterialForm({ ...materialForm, quantity_received: Number(e.target.value) })} required /><input type="number" min={0} step="0.01" placeholder="Consumed" value={materialForm.quantity_consumed} onChange={(e) => setMaterialForm({ ...materialForm, quantity_consumed: Number(e.target.value) })} required /><input type="number" min={0} step="0.01" placeholder="Wastage" value={materialForm.wastage} onChange={(e) => setMaterialForm({ ...materialForm, wastage: Number(e.target.value) })} required /><button type="submit">Save Material</button></form><table><thead><tr><th>Date</th><th>Order</th><th>Type</th><th>Received</th><th>Consumed</th><th>Wastage</th></tr></thead><tbody>{materials.map((item) => <tr key={item.id}><td>{item.entry_date}</td><td>{orderLabel(item.order_id)}</td><td>{item.material_type}</td><td>{item.quantity_received}</td><td>{item.quantity_consumed}</td><td>{item.wastage}</td></tr>)}</tbody></table></section>}

      {tab === "reports" && <section className="panel"><h2>Reports</h2><table><thead><tr><th>Order</th><th>Packed</th><th>Pending</th><th>Status</th><th>Revenue</th><th>Labor Cost</th><th>Profit</th></tr></thead><tbody>{orderReports.map((report) => <tr key={report.order.id}><td>{report.order.order_number}</td><td>{report.packed}</td><td>{report.pending}</td><td>{report.status}</td><td>{money(report.revenue)}</td><td>{money(report.labor)}</td><td>{money(report.revenue - report.labor)}</td></tr>)}</tbody></table><h3>Worker Earnings</h3><table><thead><tr><th>Worker</th><th>Process</th><th>Completed</th><th>Earnings</th></tr></thead><tbody>{workerLedger.map((worker) => <tr key={worker.id}><td>{worker.name}</td><td>{worker.process}</td><td>{worker.completed}</td><td>{money(worker.earned)}</td></tr>)}</tbody></table></section>}
    </main>
  );
}
