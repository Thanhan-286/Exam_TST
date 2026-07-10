// Kiểu dữ liệu khớp 1:1 với các view mart.* (xem db/migrations/007_dataflow.sql)

export interface SalesRow {
  sales_sk: number;
  batch_id: number;
  src_row_index: number;
  doc_date: string; // YYYY-MM-DD
  month_start: string;
  order_no: string;
  line_no: number;
  customer_code: string;
  item_code: string;
  warehouse_code: string;
  qty_order: number;
  qty_delivered: number;
  unit_price: number;
  discount_pct: number;
  doc_status: string; // Completed | Open | Cancelled | Return
  delivery_due_date: string | null;
  actual_delivery_date: string | null;
  salesperson: string;
  line_revenue: number;
  in_plan_scope: boolean;
  flag_orphan_fk: boolean;
  flag_zero_price: boolean;
  flag_high_discount: boolean;
  flag_process_violation: boolean;
  flag_pv_discontinued_item: boolean;
  flag_pv_inactive_customer: boolean;
  flag_pv_inactive_warehouse: boolean;
}

export interface InventoryRow {
  batch_id: number;
  month_end: string;
  month_start: string;
  item_code: string;
  warehouse_code: string;
  on_hand_qty: number;
  safety_stock: number;
  last_receipt_date: string;
  days_since_receipt: number;
  inventory_value: number | null; // NULL với item orphan (không có standard_cost)
  is_latest_eom: boolean;
  flag_negative_stock: boolean;
  flag_orphan_fk: boolean;
  flag_below_safety: boolean;
}

export interface ItemMocRow {
  item_code: string;
  item_name: string;
  category_name: string;
  abc_class: string;
  item_status: string;
  on_hand_eom: number;
  inv_value_eom: number;
  sold_6m: number;
  moc: number | null; // null khi sold_6m = 0
  median_inv_value: number;
  is_slow_heavy: boolean;
}

export interface PlanRow {
  month_start: string;
  market_region: string;
  category_code: string;
  category_name: string;
  target_revenue: number;
  batch_id: number;
}

export interface ProductRow {
  item_code: string;
  item_name: string;
  category_code: string;
  category_name: string;
  standard_cost: number | null; // NULL CỐ Ý với member Unknown — bẫy GM%
  list_price: number | null;
  item_status: string;
  abc_class: string;
  launch_date: string | null;
  is_unknown: boolean;
}

export interface CustomerRow {
  customer_code: string;
  customer_name: string;
  region: string;
  channel: string;
  salesperson: string;
  customer_status: string;
  is_unknown: boolean;
}

export interface WarehouseRow {
  warehouse_code: string;
  warehouse_name: string;
  warehouse_region: string; // ⚠️ vùng KHO — khác dim_customer.region
  warehouse_status: string;
  is_unknown: boolean;
}

export interface MonthRow {
  month_start: string;
  month_end: string;
  month_label: string;
  month_number: number;
  year_number: number;
}

export interface DqSalesRow {
  sales_sk: number;
  batch_id: number;
  src_row_index: number;
  doc_date: string;
  month_start: string;
  order_no: string;
  line_no: number;
  customer_code: string;
  item_code: string;
  warehouse_code: string;
  qty_order: number;
  qty_delivered: number;
  unit_price: number;
  discount_pct: number;
  doc_status: string;
  salesperson: string;
  flag_dup_row: boolean;
  flag_orphan_fk: boolean;
  flag_zero_price: boolean;
  flag_high_discount: boolean;
  flag_sentinel: boolean;
  flag_dq_dirty: boolean;
  flag_pv_discontinued_item: boolean;
  flag_pv_inactive_customer: boolean;
  flag_pv_inactive_warehouse: boolean;
  flag_process_violation: boolean;
  dq_issue: string | null;
  pv_issue: string | null;
}

export interface DqInventoryRow {
  batch_id: number;
  month_end: string;
  item_code: string;
  warehouse_code: string;
  on_hand_qty: number;
  safety_stock: number;
  last_receipt_date: string;
  inventory_value_raw: number;
  flag_negative_stock: boolean;
  flag_orphan_fk: boolean;
  flag_below_safety: boolean;
  flag_dq_dirty: boolean;
}

export interface ReconRow {
  month_end: string;
  item_code: string;
  warehouse_code: string;
  value_reported: number;
  value_recomputed: number | null;
  is_match: boolean | null;
}

export interface WaterfallRow {
  step_order: number;
  step_code: string;
  step_name: string;
  amount: number;
  is_total: boolean;
}

export interface ErrorLayerRow {
  layer_order: number;
  layer: string;
  question: string;
  example: string;
  metric: string;
  owner: string;
}

export interface AuditIssueRow {
  issue_no: number;
  in_hint: boolean;
  issue: string;
  source_table: string;
  rows_affected: string;
  money_impact: string;
  resolution: string;
  future_rule: string;
}

export interface AuditRuleRow {
  rule_code: string;
  severity: 'hard' | 'soft' | 'doc';
  description: string;
  issue_ref: number | null;
  enforceable_in_db: boolean;
}

export interface CleaningScenarioRow {
  scenario_order: number;
  scenario: string;
  revenue_net: number;
  bias_pct: number;
  is_correct: boolean;
}

export interface InvariantRow {
  no: number;
  invariant: string;
  ok: boolean;
  detail: string;
}

export interface LoadBatchRow {
  batch_id: number;
  file_name: string;
  file_hash: string;
  row_counts: Record<string, number> | null;
  status: 'loaded' | 'rolled_back';
  is_active?: boolean;
  loaded_at: string;
  loaded_by: string | null;
}

/** Toàn bộ dữ liệu app cần, fetch một lần khi khởi động */
export interface DataBundle {
  sales: SalesRow[];
  inventory: InventoryRow[];
  itemMoc: ItemMocRow[];
  plan: PlanRow[];
  products: ProductRow[];
  customers: CustomerRow[];
  warehouses: WarehouseRow[];
  months: MonthRow[];
  dqSales: DqSalesRow[];
  dqInventory: DqInventoryRow[];
  recon: ReconRow[];
  waterfall: WaterfallRow[];
  errorLayers: ErrorLayerRow[];
  auditIssues: AuditIssueRow[];
  auditRules: AuditRuleRow[];
  cleaningScenarios: CleaningScenarioRow[];
}
