# `docs/dataflow.md` — Hợp đồng dataflow cho Web UI (React + Vite trên Vercel)

**Trạng thái backend: HOÀN THIỆN (10/07/2026).** Migration `007_dataflow.sql` đã chạy,
đã verify trên Supabase thật: golden `005` 20/20 xanh · `mart.invariant_checks` 11/11 ·
chu trình upload → transform → rollback đã test end-to-end qua REST bằng anon key.

UI **chỉ việc đọc `mart.*` và ghi `raw.*`** theo hợp đồng dưới đây. Không có logic
nghiệp vụ nào cần viết lại ở client — mọi làm sạch/gắn cờ/tính toán chảy tự động
qua view khi dữ liệu vào `raw`.

---

## 1. Kết nối (supabase-js)

```ts
import { createClient } from '@supabase/supabase-js';

// Đọc dashboard
export const mart = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
                                 { db: { schema: 'mart' } });
// Ghi upload
export const raw  = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
                                 { db: { schema: 'raw' } });
```

Env cho Vite (giá trị lấy từ `.env` gốc): `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`.
Demo — key công khai, anon được SELECT trên `mart` + INSERT vào `raw` (RLS policy
`demo_read`/`demo_write`, siết lại sau này chỉ cần sửa policy, không đổi code).

## 2. Đường ĐỌC — bảng trong `mart` (bàn chi tiết API khi làm UI)

| View | Dùng cho | Ghi chú |
|---|---|---|
| `fact_sales` | DB1 | Đã sạch. Có `line_revenue`, `in_plan_scope`, cờ PV |
| `plan_monthly`, `dim_month`, `dim_market_region`, `dim_category`, `dim_product`, `dim_customer`, `dim_warehouse` | DB1/DB2 | Dim đã có member `(Unknown)` động, cột `is_unknown` |
| `fact_inventory` | DB2 | Có dòng orphan kèm `flag_orphan_fk` — **measure phải lọc `not flag_orphan_fk`** (tồn kho 6.391.770.000 là số sau lọc) |
| `item_moc` | DB2 scatter | `sold_6m` = cửa sổ 6 tháng gần nhất, filter `Completed+Return` |
| `dq_fact_sales`, `dq_fact_inventory`, `dq_inventory_recon` | DB3 | Nguyên trạng + cờ. **Không join với `fact_sales`** |
| `audit_waterfall`, `audit_error_layer`, `cleaning_scenarios` | DB3 | **Tính động** — upload xong tự cập nhật |
| `audit_issues`, `audit_rules` | DB3 | Tĩnh (narrative phân tích) |
| `invariant_checks` | Trang Upload | 11 bất biến, cột `ok` boolean |
| `load_batches` | Trang Upload | Lịch sử upload |

## 3. Đường GHI — quy trình upload (React parse xlsx trong browser)

```
1. Parse file (SheetJS)  →  đọc 7 sheet theo mapping §4
2. Tính SHA-256 của file →  file_hash
3. INSERT raw.load_batches { file_name, file_hash, row_counts, loaded_by }
      ⤷ 409 (unique file_hash) = file này đã upload rồi → báo user, DỪNG
      ⤷ trả về batch_id
4. INSERT theo lô (bulk array) vào từng bảng raw.*, MỌI dòng kèm batch_id
5. Batch `loaded` có batch_id lớn nhất trở thành snapshot active; stg/mart chỉ đọc snapshot này
6. SELECT mart.invariant_checks → hiện báo cáo 11 dòng xanh/đỏ
7. Nếu user muốn hoàn tác:  raw.rpc('rollback_batch', { p_batch_id })
      ⤷ trả về JSON số dòng đã xóa; batch đánh dấu 'rolled_back'
      ⤷ batch #1 (seed) không thể rollback
```

Insert lỗi giữa chừng (mạng đứt ở bước 4): gọi luôn `rollback_batch` rồi cho user
upload lại — không cần transaction phía client.

## 4. Mapping sheet Excel → bảng `raw.*`

Tên sheet đúng như `Data_set.xlsx` / `Data_Analyst_Interview.xlsx`. Cột theo thứ tự gốc.

| Sheet | Bảng | Cột (kiểu gửi qua REST) |
|---|---|---|
| `fact_sales_orders` | `raw.fact_sales_orders` | `src_row_index` int (0-based, UI tự đánh theo thứ tự dòng) · `doc_date` `"YYYY-MM-DD"` · `order_no` str · `line_no` int · `customer_code`/`item_code`/`warehouse_code` str · `qty_order`/`qty_delivered`/`unit_price`/`discount_pct` number · `doc_status` str · `delivery_due_date`/`actual_delivery_date` date hoặc null · `salesperson` str · `note` str/null |
| `fact_inventory_EOM` | `raw.fact_inventory_eom` | `month_end` date · `item_code`, `warehouse_code` str · `on_hand_qty`, `inventory_value`, `safety_stock` number · **`last_receipt_serial` int — GIỮ NGUYÊN Excel serial, KHÔNG convert** (stg convert, epoch 1899-12-30) · `stock_status_note` str/null |
| `dim_product` | `raw.dim_product` | `item_code`, `item_name`, `category_code`, `category_name` str · `standard_cost`, `list_price` number · `item_status`, `abc_class` str · `launch_date` date/null |
| `dim_customer` | `raw.dim_customer` | `customer_code`, `customer_name`, `region`, `channel`, `salesperson`, `customer_status` str |
| `dim_warehouse` | `raw.dim_warehouse` | `warehouse_code`, `warehouse_name`, `region`, `warehouse_status` str |
| `plan_monthly_sales` | `raw.plan_monthly_sales` | `month_start` date · `region`, `category_code`, `category_name` str · `target_revenue` number |
| `data_quality_hint` | `raw.data_quality_hint` | `rule_code`, `rule_name`, `description` str |

Lưu ý parse: cột ngày trong Excel có thể là Date object hoặc serial number tùy cell
format — SheetJS `cellDates: true` + convert về `"YYYY-MM-DD"`. **Riêng
`last_receipt_serial` phải giữ số nguyên thô** (đó chính là bài kiểm tra DQ06 của đề).
Mỗi file upload được hiểu là **full snapshot**. File thiếu sheet nào thì sheet đó không
có dữ liệu trong snapshot active, vì vậy UI nên yêu cầu file đầy đủ 7 sheet.

## 5. Chính sách dữ liệu khi batch mới vào (backend tự xử lý)

| Bảng | Chính sách | Hệ quả cho UI |
|---|---|---|
| `fact_sales_orders` | Snapshot active + dedupe trùng toàn-cột trong chính snapshot | File mới xóa dòng nào thì mart cũng mất dòng đó |
| `fact_inventory_eom` | Snapshot active + chống trùng theo (month_end, item, warehouse) | Upload lại snapshot đã sửa = update/delete theo file mới |
| `dim_*`, `plan_monthly_sales` | Snapshot active + chống trùng theo mã / grain | Upload danh mục mới = thay snapshot danh mục |

Rule tự chảy với dữ liệu mới (đã test): mã orphan mới → member `(Unknown)` sinh động
+ cờ `flag_orphan_fk`; tháng mới → có mặt trong `dim_month` kể cả khi chưa có plan;
`is_latest_eom` tự dời sang snapshot active; DQ/PV Score, waterfall, cleaning
scenarios tự tính lại.

## 6. Những gì UI TUYỆT ĐỐI không làm (kế thừa CLAUDE.md)

1. Không dedupe theo `order_no + line_no` ở client — backend đã xử lý đúng.
2. Không join `fact_sales` với `dq_fact_sales`.
3. Không trộn `dim_customer.region` (DB1) với `dim_warehouse.warehouse_region` (DB2).
4. Không set tồn âm = 0. Không "sửa" null hợp lệ (`actual_delivery_date` của Open/Cancelled).
5. Măt bằng global của Achievement Index tính từ **toàn bộ** dữ liệu trong scope plan
   (`in_plan_scope = true`), không đổi theo slicer.

## 7. Verify thủ công (khi cần)

```bash
cd bi-case-study
node scripts/run_sql.mjs db/migrations/005_reconcile.sql   # 20/20 với dữ liệu gốc
node scripts/run_sql.mjs --query "select * from mart.invariant_checks order by no"
node scripts/run_sql.mjs --query "select * from mart.load_batches order by batch_id"
```

`005` là số vàng **chỉ đúng khi database chứa đúng seed gốc** (batch #1, không có
batch nào khác đang `loaded`). `invariant_checks` đúng với **mọi** trạng thái dữ liệu.
