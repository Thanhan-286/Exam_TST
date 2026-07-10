import type {
  DataBundle, SalesRow, ProductRow, CustomerRow, WarehouseRow,
} from './types';
import { revenueInPlanScope, target } from './measures';

/**
 * Dòng bán hàng đã join sẵn dim (mô phỏng RELATED() của DAX).
 * region = VÙNG KHÁCH HÀNG (Dashboard 1). warehouse_region = VÙNG KHO (Dashboard 2).
 */
export interface EnrichedSale extends SalesRow {
  region: string;
  channel: string;
  category_code: string;
  category_name: string;
  item_name: string;
  standard_cost: number | null;
  warehouse_region: string;
}

export interface Model {
  sales: EnrichedSale[];
  bundle: DataBundle;
  productByCode: Map<string, ProductRow>;
  customerByCode: Map<string, CustomerRow>;
  warehouseByCode: Map<string, WarehouseRow>;
  /**
   * Mặt bằng chung của Achievement Index = RevenueInPlanScope(toàn bộ)/Target(toàn bộ).
   * HẰNG SỐ theo slicer — tương đương REMOVEFILTERS() trong DAX (CLAUDE.md điều 5).
   */
  globalPlanRatio: number;
}

export function buildModel(bundle: DataBundle): Model {
  const productByCode = new Map(bundle.products.map((p) => [p.item_code, p]));
  const customerByCode = new Map(bundle.customers.map((c) => [c.customer_code, c]));
  const warehouseByCode = new Map(bundle.warehouses.map((w) => [w.warehouse_code, w]));

  const sales: EnrichedSale[] = bundle.sales.map((s) => {
    const p = productByCode.get(s.item_code);
    const c = customerByCode.get(s.customer_code);
    const w = warehouseByCode.get(s.warehouse_code);
    return {
      ...s,
      region: c?.region ?? '(Unknown)',
      channel: c?.channel ?? '(Unknown)',
      category_code: p?.category_code ?? '(Unknown)',
      category_name: p?.category_name ?? '(Unknown)',
      item_name: p?.item_name ?? s.item_code,
      standard_cost: p?.standard_cost ?? null,
      warehouse_region: w?.warehouse_region ?? '(Unknown)',
    };
  });

  const globalPlanRatio = target(bundle.plan) > 0
    ? revenueInPlanScope(sales) / target(bundle.plan)
    : 0;

  return { sales, bundle, productByCode, customerByCode, warehouseByCode, globalPlanRatio };
}

/** Filter slicer Dashboard 1. Channel KHÔNG áp vào plan (plan không có channel). */
export interface SalesFilter {
  months?: Set<string>;   // month_start
  regions?: Set<string>;  // vùng KHÁCH HÀNG
  channels?: Set<string>;
}

export function filterSales(sales: EnrichedSale[], f: SalesFilter): EnrichedSale[] {
  return sales.filter(
    (s) =>
      (!f.months?.size || f.months.has(s.month_start)) &&
      (!f.regions?.size || f.regions.has(s.region)) &&
      (!f.channels?.size || f.channels.has(s.channel))
  );
}

export function filterPlan(
  plan: DataBundle['plan'],
  f: Pick<SalesFilter, 'months' | 'regions'>
) {
  return plan.filter(
    (p) =>
      (!f.months?.size || f.months.has(p.month_start)) &&
      (!f.regions?.size || f.regions.has(p.market_region))
  );
}
