import * as XLSX from 'xlsx';
import { mart, raw } from './supabase';
import type { InvariantRow, LoadBatchRow } from './types';

type RawRow = Record<string, string | number | null>;

export interface ParsedUpload {
  fileName: string;
  fileHash: string;
  rowCounts: Record<string, number>;
  tables: Record<string, RawRow[]>;
}

export interface UploadResult {
  batchId: number;
  invariants: InvariantRow[];
  batches: LoadBatchRow[];
}

const SHEETS = {
  fact_sales_orders: 'fact_sales_orders',
  fact_inventory_EOM: 'fact_inventory_eom',
  dim_product: 'dim_product',
  dim_customer: 'dim_customer',
  dim_warehouse: 'dim_warehouse',
  plan_monthly_sales: 'plan_monthly_sales',
  data_quality_hint: 'data_quality_hint',
} as const;

const isBlank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '');

const str = (v: unknown): string | null => (isBlank(v) ? null : String(v).trim());
const num = (v: unknown): number | null => {
  if (isBlank(v)) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const normalized = String(v).replace(/\./g, '').replace(',', '.').trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown): number | null => {
  const n = num(v);
  return n == null ? null : Math.round(n);
};

const dateFromSerial = (serial: number): string => {
  const ms = Math.round((serial - 25569) * 86_400_000);
  return new Date(ms).toISOString().slice(0, 10);
};

const date = (v: unknown): string | null => {
  if (isBlank(v)) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString().slice(0, 10);
  }
  if (typeof v === 'number') return dateFromSerial(v);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const rowsOf = (wb: XLSX.WorkBook, sheetName: string): unknown[][] => {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: null,
    raw: true,
  });
  return rows.slice(1).filter((r) => r.some((cell) => !isBlank(cell)));
};

const withBatch = (rows: RawRow[], batchId: number) => rows.map((r) => ({ ...r, batch_id: batchId }));

export async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function parseWorkbook(file: File): Promise<ParsedUpload> {
  const [buffer, fileHash] = await Promise.all([file.arrayBuffer(), sha256(file)]);
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const tables: Record<string, RawRow[]> = {};

  const sales = rowsOf(wb, 'fact_sales_orders').map((r, i) => ({
    src_row_index: i,
    doc_date: date(r[0]),
    order_no: str(r[1]),
    line_no: int(r[2]),
    customer_code: str(r[3]),
    item_code: str(r[4]),
    warehouse_code: str(r[5]),
    qty_order: num(r[6]),
    qty_delivered: num(r[7]),
    unit_price: num(r[8]),
    discount_pct: num(r[9]),
    doc_status: str(r[10]),
    delivery_due_date: date(r[11]),
    actual_delivery_date: date(r[12]),
    salesperson: str(r[13]),
    note: str(r[14]),
  }));
  if (sales.length) tables[SHEETS.fact_sales_orders] = sales;

  const inv = rowsOf(wb, 'fact_inventory_EOM').map((r) => ({
    month_end: date(r[0]),
    item_code: str(r[1]),
    warehouse_code: str(r[2]),
    on_hand_qty: num(r[3]),
    inventory_value: num(r[4]),
    safety_stock: num(r[5]),
    last_receipt_serial: int(r[6]),
    stock_status_note: str(r[7]),
  }));
  if (inv.length) tables[SHEETS.fact_inventory_EOM] = inv;

  const products = rowsOf(wb, 'dim_product').map((r) => ({
    item_code: str(r[0]),
    item_name: str(r[1]),
    category_code: str(r[2]),
    category_name: str(r[3]),
    standard_cost: num(r[4]),
    list_price: num(r[5]),
    item_status: str(r[6]),
    abc_class: str(r[7]),
    launch_date: date(r[8]),
  }));
  if (products.length) tables[SHEETS.dim_product] = products;

  const customers = rowsOf(wb, 'dim_customer').map((r) => ({
    customer_code: str(r[0]),
    customer_name: str(r[1]),
    region: str(r[2]),
    channel: str(r[3]),
    salesperson: str(r[4]),
    customer_status: str(r[5]),
  }));
  if (customers.length) tables[SHEETS.dim_customer] = customers;

  const warehouses = rowsOf(wb, 'dim_warehouse').map((r) => ({
    warehouse_code: str(r[0]),
    warehouse_name: str(r[1]),
    region: str(r[2]),
    warehouse_status: str(r[3]),
  }));
  if (warehouses.length) tables[SHEETS.dim_warehouse] = warehouses;

  const plan = rowsOf(wb, 'plan_monthly_sales').map((r) => ({
    month_start: date(r[0]),
    region: str(r[1]),
    category_code: str(r[2]),
    category_name: str(r[3]),
    target_revenue: num(r[4]),
  }));
  if (plan.length) tables[SHEETS.plan_monthly_sales] = plan;

  const hints = rowsOf(wb, 'data_quality_hint').map((r) => ({
    rule_code: str(r[0]),
    rule_name: str(r[1]),
    description: str(r[2]),
  }));
  if (hints.length) tables[SHEETS.data_quality_hint] = hints;

  return {
    fileName: file.name,
    fileHash,
    rowCounts: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length])),
    tables,
  };
}

async function insertChunks(table: string, rows: RawRow[], batchId: number): Promise<void> {
  const chunk = 500;
  const payload = withBatch(rows, batchId);
  for (let i = 0; i < payload.length; i += chunk) {
    const { error } = await raw.from(table).insert(payload.slice(i, i + chunk));
    if (error) throw new Error(`Lỗi insert raw.${table}: ${error.message}`);
  }
}

export async function fetchInvariants(): Promise<InvariantRow[]> {
  const { data, error } = await mart.from('invariant_checks').select('*').order('no', { ascending: true });
  if (error) throw new Error(`Lỗi đọc mart.invariant_checks: ${error.message}`);
  return (data ?? []) as InvariantRow[];
}

export async function fetchLoadBatches(): Promise<LoadBatchRow[]> {
  const { data, error } = await mart.from('load_batches').select('*').order('batch_id', { ascending: false });
  if (error) throw new Error(`Lỗi đọc mart.load_batches: ${error.message}`);
  return (data ?? []) as LoadBatchRow[];
}

export async function uploadParsed(parsed: ParsedUpload): Promise<UploadResult> {
  if (Object.keys(parsed.tables).length === 0) {
    throw new Error('File không có sheet hợp lệ để upload.');
  }

  const { data: batch, error } = await raw
    .from('load_batches')
    .insert({
      file_name: parsed.fileName,
      file_hash: parsed.fileHash,
      row_counts: parsed.rowCounts,
      loaded_by: 'webui-demo',
    })
    .select('batch_id')
    .single();

  if (error) {
    if (error.code === '23505' || /duplicate|unique|file_hash/i.test(error.message)) {
      throw new Error('File này đã được upload trước đó (trùng SHA-256).');
    }
    throw new Error(`Lỗi tạo raw.load_batches: ${error.message}`);
  }

  const batchId = Number((batch as { batch_id: number }).batch_id);
  try {
    for (const [table, rows] of Object.entries(parsed.tables)) {
      await insertChunks(table, rows, batchId);
    }
  } catch (e) {
    await raw.rpc('rollback_batch', { p_batch_id: batchId });
    throw e;
  }

  const [invariants, batches] = await Promise.all([fetchInvariants(), fetchLoadBatches()]);
  return { batchId, invariants, batches };
}

export async function rollbackBatch(batchId: number): Promise<{ invariants: InvariantRow[]; batches: LoadBatchRow[] }> {
  const { error } = await raw.rpc('rollback_batch', { p_batch_id: batchId });
  if (error) throw new Error(`Rollback batch #${batchId} lỗi: ${error.message}`);
  const [invariants, batches] = await Promise.all([fetchInvariants(), fetchLoadBatches()]);
  return { invariants, batches };
}
