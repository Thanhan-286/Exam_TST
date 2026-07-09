-- =====================================================================
-- 001_raw.sql — Tầng RAW: ảnh chụp hiện trường
--
-- NGUYÊN TẮC: KHÔNG constraint. KHÔNG cast. KHÔNG sửa.
-- Dữ liệu bẩn PHẢI vào được, nếu không Dashboard 3 mất bằng chứng.
-- Xem analysis.md §6.9 "Gắn cờ, không xóa".
--
-- Tên cột giữ nguyên snake_case từ Excel. Đã verify với Data_set.xlsx.
-- =====================================================================

drop schema if exists raw cascade;
create schema raw;

-- ---------------------------------------------------------------------
-- fact_sales_orders — 452 dòng, 15 cột
-- ---------------------------------------------------------------------
create table raw.fact_sales_orders (
  src_row_index         integer,        -- index gốc trong Excel (0-based).
                                        -- Bắt buộc: §6.3 tham chiếu index 20 / 450 / 451
  doc_date              date,
  order_no              text,           -- ⚠️ KHÔNG phải mã đơn hàng. Xem §6.3
  line_no               integer,        -- ⚠️ KHÔNG phải số dòng trong đơn
  customer_code         text,
  item_code             text,
  warehouse_code        text,
  qty_order             numeric,        -- numeric, KHÔNG integer: âm với Return
  qty_delivered         numeric,
  unit_price            numeric,        -- có 1 dòng = 0
  discount_pct          numeric,        -- có 1 dòng = 0.65
  doc_status            text,           -- Completed 310 · Open 71 · Cancelled 49 · Return 22
  delivery_due_date     date,
  actual_delivery_date  date,           -- NULL 120 dòng = 71 Open + 49 Cancelled. HỢP LỆ
  salesperson           text,           -- ⚠️ NV BÁN ĐƠN HÀNG NÀY.
                                        -- Khác dim_customer.salesperson (NV phụ trách KH)
                                        -- ở 344/452 dòng = 76%. Xem §6.4 vấn đề #9.
  note                  text            -- ⚠️ Đáp án cài sẵn của bộ đề.
                                        -- Chỉ dùng để đối chiếu, KHÔNG dùng trong rule.
);

-- ---------------------------------------------------------------------
-- fact_inventory_EOM — 865 dòng, 8 cột
-- ⚠️ KHÔNG có cột StandardCost. Nó nằm ở dim_product.
--    (Plan bản đầu ghi sai chỗ này.)
-- ---------------------------------------------------------------------
create table raw.fact_inventory_eom (
  month_end             date,
  item_code             text,
  warehouse_code        text,
  on_hand_qty           numeric,        -- CHO PHÉP ÂM: 14 dòng
  inventory_value       numeric,        -- cột DẪN XUẤT = on_hand_qty × dim_product.standard_cost
  safety_stock          numeric,
  last_receipt_serial   integer,        -- ⚠️ Excel serial number, KHÔNG phải date
                                        --    45816 → 2025-06-08 · 46198 → 2026-06-25
  stock_status_note     text
);

-- ---------------------------------------------------------------------
-- Dimensions
-- ---------------------------------------------------------------------
create table raw.dim_product (
  item_code      text,
  item_name      text,
  category_code  text,        -- CAT01..CAT06
  category_name  text,
  standard_cost  numeric,     -- <-- COGS sống ở đây, không ở fact
  list_price     numeric,
  item_status    text,        -- Active 33 · Discontinued 3
  abc_class      text,        -- A 13 · B 10 · C 13
  launch_date    date
);

create table raw.dim_customer (
  customer_code    text,
  customer_name    text,
  region           text,      -- Miền Bắc / Miền Trung / Miền Nam
  channel          text,      -- Bán lẻ / Đại lý / Dự án / Nội bộ
  salesperson      text,      -- ⚠️ NV PHỤ TRÁCH TÀI KHOẢN. Khác fact.salesperson ở 76% dòng
  customer_status  text       -- Active 38 · Inactive 2
);

create table raw.dim_warehouse (
  warehouse_code    text,
  warehouse_name    text,
  region            text,     -- ⚠️ VÙNG KHO. Khác dim_customer.region về ngữ nghĩa
  warehouse_status  text      -- WH_OLD = Inactive
);

create table raw.plan_monthly_sales (
  month_start     date,
  region          text,       -- ≡ dim_customer.region (kế hoạch theo THỊ TRƯỜNG)
  category_code   text,
  category_name   text,
  target_revenue  numeric
);

create table raw.data_quality_hint (
  rule_code    text,
  rule_name    text,
  description  text
);

comment on schema raw is
  'Ảnh chụp nguyên trạng Data_set.xlsx. Không constraint, không cast. '
  'Mọi dòng bẩn được giữ lại làm bằng chứng cho Dashboard 3.';
