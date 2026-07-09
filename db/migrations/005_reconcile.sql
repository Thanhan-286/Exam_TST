-- =====================================================================
-- 005_reconcile.sql — BẢNG SỐ VÀNG, chạy thẳng trong Supabase SQL Editor
--
-- Không cần Python. Dán vào SQL Editor, bấm Run.
-- Kết quả: 20 dòng, cột `ok` phải TRUE hết.
--
-- Đây là hợp đồng giữa tầng ETL và tầng Power BI. Mọi thay đổi SQL phải
-- chạy lại file này. Assert #14 quan trọng nhất — nó chứng minh cái BẪY
-- tồn tại thật: dedupe theo (order_no, line_no) mất 293.054.650 VNĐ.
-- =====================================================================

with checks as (

select  1 as no, 'Rows raw.fact_sales_orders'                as metric,
        (select count(*)::text from raw.fact_sales_orders)   as got, '452' as want
union all select  2, 'Rows raw.fact_inventory_eom',
        (select count(*)::text from raw.fact_inventory_eom), '865'
union all select  3, 'Rows mart.fact_sales (đã làm sạch)',
        (select count(*)::text from mart.fact_sales), '450'

union all select  4, 'Revenue Net',
        (select sum(line_revenue)::bigint::text from mart.fact_sales
         where doc_status <> 'Cancelled'), '5208670650'

union all select  5, 'Gross Margin',
        (select sum(f.line_revenue - f.qty_delivered*p.standard_cost)::bigint::text
         from mart.fact_sales f join raw.dim_product p using (item_code)
         where f.doc_status <> 'Cancelled'), '888400150'

union all select  6, 'Gross Margin % (mẫu số = 5.171.840.150)',
        (select round(100*sum(f.line_revenue - f.qty_delivered*p.standard_cost)
                        / sum(f.line_revenue), 2)::text
         from mart.fact_sales f join raw.dim_product p using (item_code)
         where f.doc_status <> 'Cancelled'), '17.18'

union all select  7, 'Fill Rate %  [Completed + Open]',
        (select round(100*sum(qty_delivered)/sum(qty_order),2)::text
         from mart.fact_sales where doc_status in ('Completed','Open')), '87.21'

union all select  8, 'On-time Delivery % (n=330)',
        (select round(100.0*count(*) filter (where actual_delivery_date<=delivery_due_date)
                      /count(*),2)::text
         from mart.fact_sales where actual_delivery_date is not null), '37.27'

union all select  9, 'Avg Delivery Delay, ngày (n=330)',      -- xem ERRATA E3
        (select round(avg(actual_delivery_date-delivery_due_date),2)::text
         from mart.fact_sales where actual_delivery_date is not null), '2.02'

union all select 10, 'Avg Days Late, ngày (n=207 đơn trễ)',   -- KHÁC #9. ERRATA E3
        (select round(avg(actual_delivery_date-delivery_due_date),2)::text
         from mart.fact_sales
         where actual_delivery_date > delivery_due_date), '3.37'

union all select 11, 'Inventory Value EOM 30/06 (loại VT999)',
        (select sum(inventory_value)::bigint::text from mart.fact_inventory
         where month_end = (select max(month_end) from mart.fact_inventory)), '6391770000'

union all select 12, 'Median inventory value / item',
        (select distinct median_inv_value::bigint::text from mart.item_moc), '127610000'

union all select 13, 'Slow & Heavy — số item',
        (select count(*)::text from mart.item_moc where is_slow_heavy), '9'

union all select 14, 'Slow & Heavy — vốn mắc kẹt',
        (select sum(inv_value_eom)::bigint::text from mart.item_moc where is_slow_heavy), '2402800000'

union all select 15, 'LastReceiptDate  min → max',
        (select min(last_receipt_date)::text||' → '||max(last_receipt_date)::text
         from stg.fact_inventory), '2025-06-08 → 2026-06-25'

-- ⚠️ BẪY SÂU NHẤT CỦA BỘ ĐỀ. Nếu con số này KHÔNG ra 4.915.616.000
--    nghĩa là mart.fact_sales đã bị dedupe sai ở đâu đó.
union all select 16, '⚠️ BẪY dedupe order_no+line_no → Revenue',
        (select sum(qty_delivered*unit_price*(1-discount_pct))::bigint::text
         from (select distinct on (order_no, line_no) *
               from stg.fact_sales where not flag_sentinel
               order by order_no, line_no, src_row_index) b
         where doc_status <> 'Cancelled'), '4915616000'

union all select 17, 'DQ Score SO %   (10 dòng bẩn / 452)',
        (select round(100*(1 - count(*) filter (
             where flag_dup_row or flag_orphan_fk or flag_zero_price
                or flag_high_discount or flag_sentinel)::numeric/count(*)),2)::text
         from stg.fact_sales), '97.79'

union all select 18, 'DQ Score INV %  (15 dòng bẩn / 865)',
        (select round(100*(1 - count(*) filter (
             where flag_negative_stock or flag_orphan_fk)::numeric/count(*)),2)::text
         from stg.fact_inventory), '98.27'

union all select 19, 'PV Score %      (63 dòng / 452)',
        (select round(100.0*count(*) filter (where flag_process_violation)/count(*),2)::text
         from stg.fact_sales), '13.94'

union all select 20, 'Reconciliation tồn kho (khớp/tổng)',
        (select (count(*) filter (where i.inventory_value = i.on_hand_qty*p.standard_cost))::text
                ||'/'||count(*)::text
         from stg.fact_inventory i left join raw.dim_product p using (item_code)), '864/865'
)
select
  no,
  case when got = want then '✓' else '✗' end as ok,
  metric,
  got,
  case when got = want then '' else want end as expected
from checks
order by no;
