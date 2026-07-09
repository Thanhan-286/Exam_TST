-- =====================================================================
-- 002_stg.sql — Tầng STAGING: cast kiểu, surrogate key, gắn cờ
--
-- Vẫn KHÔNG xóa dòng nào. Chỉ gắn cờ.
-- Thêm member "Unknown" vào dim để orphan FK không bị mất khi join.
-- =====================================================================

drop schema if exists stg cascade;
create schema stg;

-- ---------------------------------------------------------------------
-- DIMENSIONS + Unknown members  (§6.4 vấn đề #3)
-- ---------------------------------------------------------------------
create view stg.dim_product as
  select item_code, item_name, category_code, category_name,
         standard_cost, list_price, item_status, abc_class, launch_date
  from raw.dim_product
union all
  -- standard_cost = NULL CỐ Ý. Đây là nguyên nhân của bẫy GM% 17,76% (§4.2)
  select 'VT999', '(Unknown Item)', '(Unknown)', '(Unknown)',
         null, null, 'Unknown', '(Unknown)', null;

create view stg.dim_customer as
  select customer_code, customer_name, region, channel, salesperson, customer_status
  from raw.dim_customer
union all
  select 'KH999', '(Unknown Customer)', '(Unknown)', '(Unknown)', '(Unknown)', 'Unknown';

create view stg.dim_warehouse as
  select warehouse_code, warehouse_name,
         region as warehouse_region,   -- ⚠️ ĐỔI TÊN. Chống nhầm với dim_customer.region (§4.1)
         warehouse_status
  from raw.dim_warehouse;

-- ---------------------------------------------------------------------
-- FACT SALES — surrogate key + 5 cờ DQ + 1 cờ Process Violation
--
-- H1: surrogate key do hệ thống sinh. KHÔNG dùng order_no+line_no.
-- Deterministic: sắp theo src_row_index nên chạy lại vẫn ra key cũ.
-- ---------------------------------------------------------------------
create view stg.fact_sales as
with dup as (
  -- Rule tái sử dụng được: trùng TOÀN BỘ 14 cột nghiệp vụ (bỏ note).
  -- KHÔNG dùng cột `note` — đó là đáp án cài sẵn, không tồn tại ngoài đời (§3.1)
  select src_row_index,
         count(*) over (partition by
           doc_date, order_no, line_no, customer_code, item_code, warehouse_code,
           qty_order, qty_delivered, unit_price, discount_pct, doc_status,
           delivery_due_date, actual_delivery_date
         ) as n_identical,
         row_number() over (partition by
           doc_date, order_no, line_no, customer_code, item_code, warehouse_code,
           qty_order, qty_delivered, unit_price, discount_pct, doc_status,
           delivery_due_date, actual_delivery_date
           order by src_row_index
         ) as rn
  from raw.fact_sales_orders
)
select
  row_number() over (order by f.src_row_index) as sales_sk,   -- H1
  f.src_row_index,
  f.doc_date,
  date_trunc('month', f.doc_date)::date as month_start,
  f.order_no, f.line_no,
  f.customer_code, f.item_code, f.warehouse_code,
  f.qty_order, f.qty_delivered, f.unit_price, f.discount_pct,
  f.doc_status, f.delivery_due_date, f.actual_delivery_date,
  f.salesperson,                       -- ⚠️ NV BÁN ĐƠN NÀY (§8.1 quyết định #3)
  f.note,

  -- ===== 5 cờ DQ (tầng DỮ LIỆU) — không chồng lấn nhau, tổng = 10 dòng =====
  (d.n_identical > 1)                              as flag_dup_row,      -- 2 dòng: 20, 450
  (d.n_identical > 1 and d.rn > 1)                 as flag_dup_delete,   -- 1 dòng: 450
  (f.customer_code = 'KH999' or f.item_code = 'VT999') as flag_orphan_fk, -- 5 dòng
  (f.unit_price = 0)                               as flag_zero_price,   -- 1 dòng: 133
  (f.discount_pct > 0.20)                          as flag_high_discount,-- 1 dòng: 249
  (f.order_no ~ '(9999|0000)$')                    as flag_sentinel,     -- 1 dòng: 451

  -- ===== Cờ Process Violation (tầng QUY TRÌNH) — TÁCH RIÊNG (§6.2) =====
  -- Dòng dữ liệu HOÀN TOÀN ĐÚNG. Cái sai là hành vi bán hàng.
  -- Trộn vào DQ Score = đổ lỗi cho đội nhập liệu, tha cho đội bán hàng.
  (p.item_status     = 'Discontinued') as flag_pv_discontinued_item,  -- 41 dòng
  (c.customer_status = 'Inactive')     as flag_pv_inactive_customer,  -- 23 dòng
  (w.warehouse_status = 'Inactive')    as flag_pv_inactive_warehouse, -- 1 dòng: 97
  (p.item_status = 'Discontinued'
    or c.customer_status = 'Inactive'
    or w.warehouse_status = 'Inactive') as flag_process_violation      -- union = 63 dòng
from raw.fact_sales_orders f
join dup d               on d.src_row_index  = f.src_row_index
left join raw.dim_product   p on p.item_code      = f.item_code
left join raw.dim_customer  c on c.customer_code  = f.customer_code
left join raw.dim_warehouse w on w.warehouse_code = f.warehouse_code;

-- ---------------------------------------------------------------------
-- FACT INVENTORY — cast date, gắn cờ
--
-- H6: Excel serial epoch = 1899-12-30 (KHÔNG phải 1900-01-01).
--     Excel coi 1900 là năm nhuận — nó không phải. Lệch 1 ngày.
-- ---------------------------------------------------------------------
create view stg.fact_inventory as
select
  i.month_end,
  i.item_code, i.warehouse_code,
  i.on_hand_qty,
  i.inventory_value,       -- giữ để reconcile §6.6, KHÔNG đưa lên mart
  i.safety_stock,
  (date '1899-12-30' + (i.last_receipt_serial || ' days')::interval)::date
                                             as last_receipt_date,
  i.last_receipt_serial,
  i.stock_status_note,
  (i.on_hand_qty < 0)                        as flag_negative_stock,  -- 14 dòng
  (i.item_code = 'VT999')                    as flag_orphan_fk,       -- 1 dòng
  (i.on_hand_qty < i.safety_stock)           as flag_below_safety
from raw.fact_inventory_eom i;

comment on schema stg is
  'Cast kiểu, sinh surrogate key, gắn cờ. Không xóa dòng nào. '
  'Cờ DQ (tầng dữ liệu) và cờ PV (tầng quy trình) tách bạch — xem analysis.md §6.2.';
