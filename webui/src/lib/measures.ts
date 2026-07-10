// =====================================================================
// measures.ts — bản dịch DAX → TS thuần (docs/model-spec.md §4)
//
// ⚠️ BA FILTER doc_status KHÁC NHAU (ERRATA E2) — không được dùng nhầm:
//    Revenue Net : <> 'Cancelled'          (Completed + Open + Return)
//    Fill Rate   : IN ('Completed','Open')
//    sold_6m/MOC : IN ('Completed','Return')  — đã tính sẵn ở mart.item_moc
//
// ⚠️ Mẫu số GM% = doanh thu các dòng CÓ standard_cost (5.171.840.150),
//    KHÔNG phải Revenue Net. BLANK trong DAX hành xử như 0 ⇒ bẫy 17,76%.
//
// Mọi giá trị được kiểm bằng golden tests (src/lib/golden.test.ts) trên
// fixtures export từ chính mart.* — sai một số là test đỏ.
// =====================================================================
import type {
  PlanRow, InventoryRow, ItemMocRow, ProductRow,
  DqSalesRow, DqInventoryRow, ReconRow,
} from './types';
import type { EnrichedSale, Model } from './model';

const sum = <T,>(rows: T[], f: (r: T) => number): number =>
  rows.reduce((a, r) => a + f(r), 0);

const notCancelled = (r: EnrichedSale) => r.doc_status !== 'Cancelled';
const inFillScope = (r: EnrichedSale) =>
  r.doc_status === 'Completed' || r.doc_status === 'Open';

// ---------------------------------------------------------------------
// Doanh thu & biên (Dashboard 1)
// ---------------------------------------------------------------------
export const revenueNet = (rows: EnrichedSale[]): number =>
  sum(rows.filter(notCancelled), (r) => r.line_revenue);

/** Mẫu số của GM% — chỉ các dòng CÓ standard_cost */
export const revenueWithCost = (rows: EnrichedSale[]): number =>
  sum(rows.filter((r) => notCancelled(r) && r.standard_cost != null), (r) => r.line_revenue);

export const cogs = (rows: EnrichedSale[]): number =>
  sum(
    rows.filter((r) => notCancelled(r) && r.standard_cost != null),
    (r) => r.qty_delivered * (r.standard_cost as number)
  );

export const grossMargin = (rows: EnrichedSale[]): number =>
  revenueWithCost(rows) - cogs(rows);

export const grossMarginPct = (rows: EnrichedSale[]): number | null => {
  const denom = revenueWithCost(rows);
  return denom !== 0 ? grossMargin(rows) / denom : null;
};

export const fillRate = (rows: EnrichedSale[]): number | null => {
  const scope = rows.filter(inFillScope);
  const ordered = sum(scope, (r) => r.qty_order);
  return ordered !== 0 ? sum(scope, (r) => r.qty_delivered) / ordered : null;
};

const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

/** Mẫu số = dòng ĐÃ có ngày giao thực tế. Đơn Open chưa đến hạn chưa gọi là trễ. */
export const onTimeDelivery = (rows: EnrichedSale[]): { pct: number | null; n: number } => {
  const delivered = rows.filter((r) => r.actual_delivery_date != null);
  if (delivered.length === 0) return { pct: null, n: 0 };
  const onTime = delivered.filter(
    (r) => (r.actual_delivery_date as string) <= (r.delivery_due_date as string)
  ).length;
  return { pct: onTime / delivered.length, n: delivered.length };
};

/** ERRATA E3 — HAI chỉ số khác nhau, không được đặt nhầm tên */
export const avgDaysLate = (rows: EnrichedSale[]): { days: number | null; n: number } => {
  const late = rows.filter(
    (r) =>
      r.actual_delivery_date != null &&
      r.delivery_due_date != null &&
      r.actual_delivery_date > r.delivery_due_date
  );
  if (late.length === 0) return { days: null, n: 0 };
  return {
    days:
      sum(late, (r) => daysBetween(r.actual_delivery_date as string, r.delivery_due_date as string)) /
      late.length,
    n: late.length,
  };
};

export const avgDeliveryDelay = (rows: EnrichedSale[]): { days: number | null; n: number } => {
  const delivered = rows.filter(
    (r) => r.actual_delivery_date != null && r.delivery_due_date != null
  );
  if (delivered.length === 0) return { days: null, n: 0 };
  return {
    days:
      sum(delivered, (r) =>
        daysBetween(r.actual_delivery_date as string, r.delivery_due_date as string)
      ) / delivered.length,
    n: delivered.length,
  };
};

export const returnValue = (rows: EnrichedSale[]): number =>
  sum(rows.filter((r) => r.doc_status === 'Return'), (r) => r.line_revenue);

export const returnRate = (rows: EnrichedSale[]): number | null => {
  const base = sum(rows.filter(inFillScope), (r) => r.line_revenue);
  return base !== 0 ? -returnValue(rows) / base : null;
};

// ---------------------------------------------------------------------
// Kế hoạch & Achievement Index (Dashboard 1)
// ---------------------------------------------------------------------
export const target = (plan: PlanRow[]): number => sum(plan, (p) => p.target_revenue);

/** Loại orphan (không có region/category) — 5.134.128.150 với dữ liệu gốc */
export const revenueInPlanScope = (rows: EnrichedSale[]): number =>
  sum(rows.filter((r) => notCancelled(r) && r.in_plan_scope), (r) => r.line_revenue);

export const pctOfPlan = (rows: EnrichedSale[], plan: PlanRow[]): number | null => {
  const t = target(plan);
  return t !== 0 ? revenueInPlanScope(rows) / t : null;
};

/**
 * Achievement Index = (tỷ lệ đạt cục bộ) / (mặt bằng toàn cục) × 100.
 * globalRatio là HẰNG SỐ từ model — không đổi theo slicer (≡ REMOVEFILTERS).
 * ⚠️ Chỉ đọc ở cấp Region / Category / Month — không đọc ở từng ô (~3,7 đơn/ô).
 */
export const achievementIndex = (
  rows: EnrichedSale[],
  plan: PlanRow[],
  globalRatio: number
): number | null => {
  const local = pctOfPlan(rows, plan);
  return local != null && globalRatio !== 0 ? (local / globalRatio) * 100 : null;
};

// ---------------------------------------------------------------------
// Tồn kho (Dashboard 2)
// ---------------------------------------------------------------------
/** Snapshot EOM mới nhất, LOẠI orphan TƯỜNG MINH (docs/dataflow.md §2) */
export const latestEom = (inv: InventoryRow[]): InventoryRow[] =>
  inv.filter((r) => r.is_latest_eom && !r.flag_orphan_fk);

export const inventoryValueEOM = (inv: InventoryRow[]): number =>
  sum(latestEom(inv), (r) => r.inventory_value ?? 0);

export const onHandQtyEOM = (inv: InventoryRow[]): number =>
  sum(latestEom(inv), (r) => r.on_hand_qty);

export const slowHeavyItems = (moc: ItemMocRow[]): ItemMocRow[] =>
  moc.filter((m) => m.is_slow_heavy);

export const slowHeavyValue = (moc: ItemMocRow[]): number =>
  sum(slowHeavyItems(moc), (m) => m.inv_value_eom);

export const slowHeavyPct = (moc: ItemMocRow[]): number | null => {
  const total = sum(moc, (m) => m.inv_value_eom);
  return total !== 0 ? slowHeavyValue(moc) / total : null;
};

export const discontinuedValue = (moc: ItemMocRow[]): number =>
  sum(moc.filter((m) => m.item_status === 'Discontinued'), (m) => m.inv_value_eom);

export const discontinuedPct = (moc: ItemMocRow[]): number | null => {
  const total = sum(moc, (m) => m.inv_value_eom);
  return total !== 0 ? discontinuedValue(moc) / total : null;
};

export const negativeStockRows = (inv: InventoryRow[]): InventoryRow[] =>
  latestEom(inv).filter((r) => r.flag_negative_stock);

export const belowSafetyRows = (inv: InventoryRow[]): InventoryRow[] =>
  latestEom(inv).filter((r) => r.flag_below_safety);

/** Chiết khấu tối đa để không lỗ so với giá vốn — bảng Discontinued */
export const maxDiscountBeforeLoss = (p: ProductRow): number | null =>
  p.list_price != null && p.standard_cost != null && p.list_price !== 0
    ? (p.list_price - p.standard_cost) / p.list_price
    : null;

/**
 * Tỷ lệ tồn kho / doanh thu theo VÙNG KHO (I1 §5.6):
 * tồn của các kho trong vùng ÷ doanh thu các đơn XUẤT TỪ các kho đó.
 * Dữ liệu gốc: MB 1,21 · MN 1,04 · MT 1,53.
 */
export function invToRevenueByRegion(model: Model): {
  region: string; inventory: number; revenue: number; ratio: number | null;
}[] {
  const byRegion = new Map<string, string[]>(); // warehouse_region -> [warehouse_code]
  for (const w of model.bundle.warehouses) {
    if (w.is_unknown) continue;
    const list = byRegion.get(w.warehouse_region) ?? [];
    list.push(w.warehouse_code);
    byRegion.set(w.warehouse_region, list);
  }
  const latest = latestEom(model.bundle.inventory);
  return [...byRegion.entries()].map(([region, codes]) => {
    const codeSet = new Set(codes);
    const inventory = sum(
      latest.filter((r) => codeSet.has(r.warehouse_code)),
      (r) => r.inventory_value ?? 0
    );
    const revenue = revenueNet(model.sales.filter((s) => codeSet.has(s.warehouse_code)));
    return { region, inventory, revenue, ratio: revenue !== 0 ? inventory / revenue : null };
  });
}

// ---------------------------------------------------------------------
// Chất lượng dữ liệu (Dashboard 3) — tính trên dq_* (NGUYÊN TRẠNG),
// không phải fact_sales đã làm sạch. Điều 9 CLAUDE.md.
// ---------------------------------------------------------------------
export const dqScoreSales = (rows: DqSalesRow[]): number | null =>
  rows.length ? 1 - rows.filter((r) => r.flag_dq_dirty).length / rows.length : null;

export const dqScoreInventory = (rows: DqInventoryRow[]): number | null =>
  rows.length ? 1 - rows.filter((r) => r.flag_dq_dirty).length / rows.length : null;

export const pvScore = (rows: DqSalesRow[]): number | null =>
  rows.length ? rows.filter((r) => r.flag_process_violation).length / rows.length : null;

export const reconMatch = (rows: ReconRow[]): { matched: number; total: number } => ({
  matched: rows.filter((r) => r.is_match === true).length,
  total: rows.length,
});

export interface GroupScore {
  key: string;
  rows: number;
  flagged: number;
  pct: number;
}

const groupScore = (
  rows: DqSalesRow[],
  keyOf: (r: DqSalesRow) => string,
  flag: (r: DqSalesRow) => boolean
): GroupScore[] => {
  const m = new Map<string, { rows: number; flagged: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = m.get(k) ?? { rows: 0, flagged: 0 };
    g.rows += 1;
    if (flag(r)) g.flagged += 1;
    m.set(k, g);
  }
  return [...m.entries()]
    .map(([key, g]) => ({ key, ...g, pct: g.rows ? g.flagged / g.rows : 0 }))
    .sort((a, b) => a.key.localeCompare(b.key));
};

/** PV Score theo NHÂN VIÊN — bắt buộc kèm χ² (không có ý nghĩa thống kê!) */
export const pvBySalesperson = (rows: DqSalesRow[]): GroupScore[] =>
  groupScore(rows, (r) => r.salesperson, (r) => r.flag_process_violation)
    .sort((a, b) => b.pct - a.pct);

/** DQ theo tháng/kho — chỉ để theo dõi, chênh lệch là NHIỄU */
export const dqByMonth = (rows: DqSalesRow[]): GroupScore[] =>
  groupScore(rows, (r) => r.month_start, (r) => r.flag_dq_dirty);

export const dqByWarehouse = (rows: DqSalesRow[]): GroupScore[] =>
  groupScore(rows, (r) => r.warehouse_code, (r) => r.flag_dq_dirty);
