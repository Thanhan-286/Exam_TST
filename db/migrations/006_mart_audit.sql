-- =====================================================================
-- 006_mart_audit.sql — Lớp mart cho Dashboard 3
--
-- VÌ SAO CẦN FILE NÀY:
--   `pbi_reader` chỉ có SELECT trên schema `mart`. Nhưng Dashboard 3 cần
--   (a) bảng audit, và (b) fact_sales ở grain 452 dòng KÈM CỜ — trong khi
--   `mart.fact_sales` đã làm sạch còn 450 dòng nên không tính được DQ Score.
--
-- ⚠️ Model Power BI sẽ có HAI bảng sales. Đây là chủ đích, không phải lỗi:
--
--   mart.fact_sales      450 dòng · đã làm sạch · dùng cho Dashboard 1
--   mart.dq_fact_sales   452 dòng · nguyên trạng + cờ · CHỈ dùng Dashboard 3
--
--   Hai bảng KHÔNG được nối quan hệ với nhau, và `dq_fact_sales` KHÔNG
--   được nối vào bất kỳ dim nào ngoài dim_month + dim_warehouse. Nếu nối
--   bừa, slicer của Dashboard 1 sẽ lọc cả DQ Score và số liệu sai lệch.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (a) Fact ở grain KIỂM TOÁN — 452 dòng, giữ nguyên mọi thứ bẩn
-- ---------------------------------------------------------------------
create view mart.dq_fact_sales as
select
  sales_sk, src_row_index, doc_date, month_start,
  order_no, line_no, customer_code, item_code, warehouse_code,
  qty_order, qty_delivered, unit_price, discount_pct,
  doc_status, salesperson,

  -- Cờ tầng DỮ LIỆU → DQ Score. Cộng dồn = 10 dòng, không chồng lấn.
  flag_dup_row, flag_orphan_fk, flag_zero_price,
  flag_high_discount, flag_sentinel,
  (flag_dup_row or flag_orphan_fk or flag_zero_price
    or flag_high_discount or flag_sentinel)      as flag_dq_dirty,

  -- Cờ tầng QUY TRÌNH → PV Score. TÁCH RIÊNG. §6.2
  -- Dòng này ghi ĐÚNG cái đã xảy ra. Cái sai là hành vi, không phải bản ghi.
  flag_pv_discontinued_item, flag_pv_inactive_customer,
  flag_pv_inactive_warehouse, flag_process_violation,

  -- Nhãn để hiện trong bảng audit
  case
    when flag_dup_row          then 'Dòng trùng (14 cột giống hệt)'
    when flag_orphan_fk        then 'Orphan FK (KH999 / VT999)'
    when flag_zero_price       then 'UnitPrice = 0'
    when flag_high_discount    then 'DiscountPct > 20%'
    when flag_sentinel         then 'Mã đơn sentinel 9999/0000'
  end as dq_issue,
  case
    when flag_pv_discontinued_item  then 'Bán hàng Discontinued'
    when flag_pv_inactive_customer  then 'Bán cho khách Inactive'
    when flag_pv_inactive_warehouse then 'Xuất từ kho ngừng hoạt động'
  end as pv_issue
from stg.fact_sales;

create view mart.dq_fact_inventory as
select
  month_end, item_code, warehouse_code,
  on_hand_qty, safety_stock, last_receipt_date,
  inventory_value as inventory_value_raw,     -- cột dẫn xuất từ nguồn
  flag_negative_stock, flag_orphan_fk, flag_below_safety,
  (flag_negative_stock or flag_orphan_fk) as flag_dq_dirty
from stg.fact_inventory;

-- ---------------------------------------------------------------------
-- (b) Reconciliation tồn kho — Q7 (§6.6)
-- ⚠️ Phép kiểm này BẮT BUỘC join dim_product để lấy standard_cost.
--    `fact_inventory_EOM` KHÔNG có cột đó. (analysis.md §6.6 nói sai —
--     xem ERRATA.md E1.)
-- ---------------------------------------------------------------------
create view mart.dq_inventory_recon as
select
  i.month_end, i.item_code, i.warehouse_code,
  i.inventory_value                          as value_reported,
  i.on_hand_qty * p.standard_cost            as value_recomputed,
  (i.inventory_value = i.on_hand_qty * p.standard_cost) as is_match
from stg.fact_inventory i
left join raw.dim_product p using (item_code);
-- 864/865 khớp. Dòng lệch duy nhất = VT999 (không có standard_cost).

-- ---------------------------------------------------------------------
-- (c) Bảng audit — chuyển sang mart để pbi_reader đọc được
-- ---------------------------------------------------------------------
create view mart.audit_rules       as select * from audit.rule_definitions;
create view mart.audit_error_layer as select * from audit.error_layer;
create view mart.audit_waterfall   as select * from audit.waterfall_step;
create view mart.audit_dq_results  as select * from audit.dq_results;

-- ---------------------------------------------------------------------
-- (d) Bảng 11 vấn đề của §6.4 — nội dung cố định, không suy ra được từ dữ liệu
--     Cột `in_hint` đánh dấu 5 vấn đề do phân tích TỰ TÌM RA.
-- ---------------------------------------------------------------------
create table mart.audit_issues (
  issue_no      int primary key,
  in_hint       boolean not null,
  issue         text not null,
  source_table  text,
  rows_affected text,
  money_impact  text,
  resolution    text,
  future_rule   text
);

insert into mart.audit_issues values
(1,  false, 'Không có khóa tự nhiên. OrderNo/LineNo không phải khóa (97,6% đơn nhiều dòng có >1 khách)',
     'SO', 'toàn bộ', '−293,1 tr nếu dedupe sai',
     'Sinh surrogate key ở ETL. KHÔNG dedupe theo OrderNo+LineNo', 'H1'),
(2,  true,  'Dòng trùng thật — SO2602-0137|1, giống cả 14 cột',
     'SO', '2', '−11.956.000', 'Xóa 1 bản (src_row_index 450)', 'H2'),
(3,  true,  'Orphan FK — KH999 (3 dòng), VT999 (2 dòng SO + 1 dòng INV)',
     'SO, INV', '5 + 1', '74,5 tr rơi ngoài grain plan',
     'Thêm member "Unknown" vào dim. KHÔNG xóa dòng fact', 'H3'),
(4,  true,  'UnitPrice = 0 — SO2606-0087, NV An',
     'SO', '1', 'Biên âm', 'Cách ly khỏi phân tích giá/biên', 'H4'),
(5,  true,  'DiscountPct = 65% — SO2601-0088, NV Bình (P95 = P99 = 10%)',
     'SO', '1', 'Biên âm; 917.700 VNĐ', 'Cách ly + yêu cầu duyệt', 'S1'),
(6,  true,  'QtyOrder = 900 — BẤT KHẢ THI VẬT LÝ. Kho WH_HCM chưa bao giờ giữ quá 300 đv VT005',
     'SO', '1', '−135.000.000', 'Loại bỏ có căn cứ, không winsorize', 'H7 + H9'),
(7,  true,  'Tồn âm — 14 dòng, 4 dòng còn âm tại 30/06/2026. VT018 âm ở 2 kho',
     'INV', '14', 'Không thể tồn âm vật lý', 'Điều tra nghiệp vụ. KHÔNG set = 0', 'H5'),
(8,  true,  'LastReceiptDate là Excel serial number, không phải date (45.816 → 46.198)',
     'INV', '865', 'Mọi phân tích aging sai', 'Convert bắt buộc trước mọi bước khác', 'H6'),
(9,  false, 'fact.Salesperson ≠ dim_customer.Salesperson ở 344/452 dòng (76%)',
     'SO', '344', 'Báo cáo hiệu suất NV sai hoàn toàn',
     'Chốt định nghĩa: fact = NV bán đơn; dim = NV phụ trách KH', 'D1'),
(10, false, 'Plan và fact không cùng phạm vi — fact là mẫu ~6%, lệch 16,48×',
     'PLAN', '108 ô', 'KPI % đạt kế hoạch không đọc được',
     'Dùng Achievement Index (chuẩn hóa = 100)', 'D2'),
(11, false, 'InventoryValue là cột dẫn xuất = OnHandQty × StandardCost (khớp 864/865)',
     'INV', '865', 'Cột thừa; sửa Qty phải sửa Value',
     'Không lưu; tính lại bằng measure', 'D3');

-- ---------------------------------------------------------------------
-- (e) Ba kịch bản làm sạch — nguồn cho card đối chứng §6.5
-- ---------------------------------------------------------------------
create view mart.cleaning_scenarios as
with correct as (
  select sum(line_revenue) v from mart.fact_sales where doc_status <> 'Cancelled'
),
nothing as (
  select sum(qty_delivered*unit_price*(1-discount_pct)) v
  from stg.fact_sales where doc_status <> 'Cancelled'
),
bad_dedupe as (
  select sum(qty_delivered*unit_price*(1-discount_pct)) v
  from (select distinct on (order_no, line_no) *
        from stg.fact_sales where not flag_sentinel
        order by order_no, line_no, src_row_index) b
  where doc_status <> 'Cancelled'
)
select 1 as scenario_order, 'Làm sạch ĐÚNG'  as scenario, (select v from correct)    as revenue_net, 0.0 as bias_pct, true  as is_correct
union all
select 2, 'KHÔNG làm sạch gì', (select v from nothing),
       round(100*((select v from nothing)-(select v from correct))/(select v from correct), 2), false
union all
select 3, 'Dedupe máy móc theo OrderNo+LineNo', (select v from bad_dedupe),
       round(100*((select v from bad_dedupe)-(select v from correct))/(select v from correct), 2), false;
-- Kỳ vọng: 0% · +2,82% · −5,63%
-- Làm sạch SAI nguy hiểm gấp đôi không làm sạch — và khó phát hiện hơn.

-- ---------------------------------------------------------------------
-- Cấp quyền cho các view/bảng mới
-- ---------------------------------------------------------------------
grant select on all tables in schema mart to pbi_reader;
