-- =====================================================================
-- 003_mart.sql — Tầng MART: thứ Power BI đọc
--
-- Áp đúng quy tắc làm sạch §3.3:
--   • XÓA  src_row_index = 450  (trùng hoàn toàn 14 cột)
--   • LOẠI src_row_index = 451  (SO2605-9999, Qty=900, bất khả thi vật lý §6.4b)
--   • GIỮ  48 dòng cùng order_no+line_no khác nội dung — KHÔNG PHẢI LỖI
--   • GIỮ  orphan FK, master inactive, tồn âm — gắn cờ, không xóa
--
-- ⚠️ TUYỆT ĐỐI KHÔNG: select distinct on (order_no, line_no)
--    Làm vậy mất 293.054.650 VNĐ (−5,63%). Xem reconcile.py assert #14.
-- =====================================================================

drop schema if exists mart cascade;
create schema mart;

-- =====================================================================
-- CONFORMED DIMENSIONS
-- Kiến trúc: plan và fact cùng trỏ vào dim_month / dim_market_region /
-- dim_category ⇒ filter chảy xuống cả hai. KHÔNG cần bridge table,
-- KHÔNG cần quan hệ many-to-many. (Cải tiến so với analysis.md §8.3.)
-- =====================================================================

create view mart.dim_month as
select
  month_start,
  (month_start + interval '1 month - 1 day')::date as month_end,
  to_char(month_start, 'MM/YYYY')                  as month_label,
  extract(month from month_start)::int             as month_number
from (select distinct month_start from raw.plan_monthly_sales) t;

create view mart.dim_market_region as
-- ⚠️ VÙNG KHÁCH HÀNG. Dashboard 1 dùng cái này.
-- Dashboard 2 dùng dim_warehouse.warehouse_region — KHÁC HẲN. 65,7% dòng lệch nhau.
select distinct region as market_region, false as is_unknown
from raw.dim_customer
union all
select '(Unknown)', true;          -- KH999, doanh thu 37.712.000

create view mart.dim_category as
select distinct category_code, category_name, false as is_unknown
from raw.dim_product
union all
select '(Unknown)', '(Unknown)', true;   -- VT999, doanh thu 36.830.500

create view mart.dim_product   as select * from stg.dim_product;
create view mart.dim_customer  as select * from stg.dim_customer;
create view mart.dim_warehouse as select * from stg.dim_warehouse;

create view mart.plan_monthly as
select month_start, region as market_region, category_code, category_name, target_revenue
from raw.plan_monthly_sales;

-- =====================================================================
-- FACT SALES  — 450 dòng
-- =====================================================================
create view mart.fact_sales as
select
  sales_sk, src_row_index, doc_date, month_start,
  order_no, line_no,
  customer_code, item_code, warehouse_code,
  qty_order, qty_delivered, unit_price, discount_pct,
  doc_status, delivery_due_date, actual_delivery_date, salesperson,
  -- Revenue theo dòng. Cancelled có qty_delivered = 0 ở CẢ 49 dòng
  -- ⇒ lọc Cancelled KHÔNG đổi Revenue một đồng (§2.1). Nó chỉ đổi Fill Rate.
  qty_delivered * unit_price * (1 - discount_pct) as line_revenue,
  -- ⚠️ Dòng có nằm trong grain của plan không?
  -- KH999 không có region, VT999 không có category ⇒ 4 dòng (74.542.500 VNĐ)
  -- nằm NGOÀI grain plan. Mẫu số global của Achievement Index PHẢI loại chúng:
  --   5.134.128.150 / 84.602.000.000 = 6,07%   (397 dòng)  ✅
  --   5.208.670.650 / 84.602.000.000 = 6,16%              ❌ sai
  (customer_code <> 'KH999' and item_code <> 'VT999') as in_plan_scope,
  flag_orphan_fk, flag_zero_price, flag_high_discount,
  flag_process_violation, flag_pv_discontinued_item,
  flag_pv_inactive_customer, flag_pv_inactive_warehouse
from stg.fact_sales
where not flag_dup_delete      -- bỏ src_row_index = 450
  and not flag_sentinel;       -- bỏ src_row_index = 451

-- =====================================================================
-- FACT INVENTORY — 864 dòng (loại orphan VT999, §5.1)
-- inventory_value TÍNH LẠI, không import cột dẫn xuất (§6.4 vấn đề #11)
-- =====================================================================
create view mart.fact_inventory as
select
  i.month_end,
  date_trunc('month', i.month_end)::date as month_start,
  i.item_code, i.warehouse_code,
  i.on_hand_qty,                                    -- GIỮ NGUYÊN ÂM. Không set = 0
  i.safety_stock,
  i.last_receipt_date,
  (i.month_end - i.last_receipt_date)               as days_since_receipt,
  i.on_hand_qty * p.standard_cost                   as inventory_value,
  -- Cột này giúp measure [Inventory Value EOM] khỏi phải dùng
  -- CALCULATE(MAX(...), ALL(...)) — vốn dễ vỡ khi có slicer tháng.
  (i.month_end = (select max(month_end) from stg.fact_inventory))
                                                    as is_latest_eom,
  i.flag_negative_stock,
  i.flag_below_safety
from stg.fact_inventory i
join raw.dim_product p on p.item_code = i.item_code   -- inner join loại VT999
where not i.flag_orphan_fk;

-- =====================================================================
-- ITEM MOC — nền của Dashboard 2
--
-- ⚠️ ĐỊNH NGHĨA sold6m KHÁC với Revenue Net và Fill Rate.
--    Revenue Net : doc_status <> 'Cancelled'          (Completed+Open+Return)
--    Fill Rate   : doc_status IN (Completed, Open)
--    sold6m/MOC  : doc_status IN (Completed, Return)   <-- CÁI NÀY
--
-- Ba filter khác nhau trong cùng một model. Đã verify: chỉ định nghĩa
-- này tái lập đúng 9 item Slow&Heavy / 2.402.800.000 của analysis.md §5.2.
-- =====================================================================
create view mart.item_moc as
with eom as (
  select item_code,
         sum(on_hand_qty)     as on_hand_eom,
         sum(inventory_value) as inv_value_eom
  from mart.fact_inventory
  where month_end = (select max(month_end) from mart.fact_inventory)
  group by item_code
),
sold as (
  select item_code, sum(qty_delivered) as sold_6m
  from mart.fact_sales
  where doc_status in ('Completed','Return')     -- trừ hàng trả lại
  group by item_code
),
med as (
  select percentile_cont(0.5) within group (order by inv_value_eom) as median_inv_value
  from eom
)
select
  e.item_code,
  p.item_name, p.category_name, p.abc_class, p.item_status,
  e.on_hand_eom,
  e.inv_value_eom,
  coalesce(s.sold_6m, 0)                                          as sold_6m,
  -- BLANK (null) khi sold_6m = 0, không phải vô cực
  case when coalesce(s.sold_6m,0) > 0
       then e.on_hand_eom / (s.sold_6m / 6.0) end                 as moc,
  m.median_inv_value,
  -- ĐIỀU KIỆN KÉP. Xếp hạng chỉ theo MOC cho cảnh báo sai:
  -- VT033 có MOC 65,7 (cao nhất) nhưng chỉ 72,8 tr vốn ⇒ thanh lý không cứu dòng tiền.
  ( e.inv_value_eom > m.median_inv_value
    and coalesce(s.sold_6m,0) > 0
    and e.on_hand_eom / (s.sold_6m / 6.0) > 12 )                  as is_slow_heavy
from eom e
cross join med m
join raw.dim_product p on p.item_code = e.item_code
left join sold s       on s.item_code = e.item_code;

comment on schema mart is
  'Lớp Power BI đọc. Đã xóa 1 dòng trùng (450) và 1 dòng sentinel (451). '
  'KHÔNG dedupe theo order_no+line_no — 48 dòng đó là giao dịch thật.';

-- =====================================================================
-- ROLE chỉ đọc cho Power BI
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pbi_reader') then
    create role pbi_reader login password 'CHANGE_ME';
  end if;
end $$;

grant usage  on schema mart to pbi_reader;
grant select  on all tables in schema mart to pbi_reader;
alter default privileges in schema mart grant select on tables to pbi_reader;
-- pbi_reader KHÔNG thấy raw / stg / audit.
