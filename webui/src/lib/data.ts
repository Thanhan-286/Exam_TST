import { mart } from './supabase';
import type { DataBundle } from './types';

// PostgREST mặc định trả tối đa 1000 dòng/request → phân trang để an toàn
// khi dữ liệu tăng qua upload.
async function fetchAll<T>(table: string, orderCols: string[]): Promise<T[]> {
  const page = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += page) {
    let q = mart.from(table).select('*').range(from, from + page - 1);
    for (const c of orderCols) q = q.order(c, { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(`Lỗi đọc mart.${table}: ${error.message}`);
    all.push(...((data ?? []) as T[]));
    if (!data || data.length < page) return all;
  }
}

export async function loadData(): Promise<DataBundle> {
  const [
    sales, inventory, itemMoc, plan,
    products, customers, warehouses, months,
    dqSales, dqInventory, recon,
    waterfall, errorLayers, auditIssues, auditRules, cleaningScenarios,
  ] = await Promise.all([
    fetchAll<DataBundle['sales'][number]>('fact_sales', ['sales_sk']),
    fetchAll<DataBundle['inventory'][number]>('fact_inventory', ['month_end', 'item_code', 'warehouse_code']),
    fetchAll<DataBundle['itemMoc'][number]>('item_moc', ['item_code']),
    fetchAll<DataBundle['plan'][number]>('plan_monthly', ['month_start', 'market_region', 'category_code']),
    fetchAll<DataBundle['products'][number]>('dim_product', ['item_code']),
    fetchAll<DataBundle['customers'][number]>('dim_customer', ['customer_code']),
    fetchAll<DataBundle['warehouses'][number]>('dim_warehouse', ['warehouse_code']),
    fetchAll<DataBundle['months'][number]>('dim_month', ['month_start']),
    fetchAll<DataBundle['dqSales'][number]>('dq_fact_sales', ['sales_sk']),
    fetchAll<DataBundle['dqInventory'][number]>('dq_fact_inventory', ['month_end', 'item_code', 'warehouse_code']),
    fetchAll<DataBundle['recon'][number]>('dq_inventory_recon', ['month_end', 'item_code', 'warehouse_code']),
    fetchAll<DataBundle['waterfall'][number]>('audit_waterfall', ['step_order']),
    fetchAll<DataBundle['errorLayers'][number]>('audit_error_layer', ['layer_order']),
    fetchAll<DataBundle['auditIssues'][number]>('audit_issues', ['issue_no']),
    fetchAll<DataBundle['auditRules'][number]>('audit_rules', ['rule_code']),
    fetchAll<DataBundle['cleaningScenarios'][number]>('cleaning_scenarios', ['scenario_order']),
  ]);

  return {
    sales, inventory, itemMoc, plan,
    products, customers, warehouses, months,
    dqSales, dqInventory, recon,
    waterfall, errorLayers, auditIssues, auditRules, cleaningScenarios,
  };
}
