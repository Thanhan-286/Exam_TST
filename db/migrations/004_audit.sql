-- =====================================================================
-- 004_audit.sql — Tầng AUDIT: nơi rule §6.8 thành CODE CHẠY ĐƯỢC
--
-- Đây là lý do duy nhất đáng để dùng Postgres cho 1.317 dòng dữ liệu.
-- Trong Excel, 9 Hard block rule là LỜI KHUYÊN.
-- Ở đây chúng là CHECK / FOREIGN KEY / UNIQUE / TRIGGER.
--
-- `audit.fact_sales_validated` là bảng CÓ ĐỦ constraint. Ta INSERT thử
-- 10 dòng bẩn vào nó, bắt exception, ghi lại rule nào chặn dòng nào.
-- Kết quả = visual đắt nhất của Dashboard 3 (§6.4 bảng audit).
-- =====================================================================

drop schema if exists audit cascade;
create schema audit;

-- ---------------------------------------------------------------------
-- Định nghĩa 16 rule (9 hard · 4 soft · 3 doc) — §6.8
-- ---------------------------------------------------------------------
create table audit.rule_definitions (
  rule_code       text primary key,
  severity        text not null check (severity in ('hard','soft','doc')),
  description     text not null,
  issue_ref       integer,          -- số thứ tự vấn đề trong §6.4
  enforceable_in_db boolean not null
);

insert into audit.rule_definitions values
 ('H1','hard','Fact table phải có surrogate primary key do hệ thống sinh',1,true),
 ('H2','hard','Chặn insert bản ghi giống hệt một bản ghi đã tồn tại',2,true),
 ('H3','hard','customer_code / item_code / warehouse_code phải tồn tại trong dim',3,true),
 ('H4','hard','unit_price > 0',4,true),
 ('H5','hard','on_hand_qty >= 0 tại thời điểm chốt sổ',7,true),
 ('H6','hard','Ép kiểu date cho mọi cột ngày tại tầng ETL',8,true),
 ('H7','hard','Chặn mã đơn có hậu tố sentinel 9999/0000 (dữ liệu test lọt production)',6,true),
 ('H8','hard','Không cho chọn master có status <> Active khi tạo đơn',12,true),
 ('H9','hard','qty_delivered <= on_hand_qty(item, warehouse) — ĐỐI CHIẾU CHÉO 2 BẢNG FACT',6,true),
 ('S1','soft','discount_pct > 0.20 cần duyệt cấp trên (P95 = P99 = 0.10)',5,true),
 ('S2','soft','qty_order > 3 × P99 theo từng item',6,true),
 ('S3','soft','Bán dưới giá vốn: unit_price × (1 − discount) < standard_cost',4,true),
 ('S4','soft','Giao trễ: actual_delivery_date > delivery_due_date',null,true),
 ('D1','doc','Data dictionary phải phân biệt fact.salesperson vs dim_customer.salesperson',9,false),
 ('D2','doc','Reconcile phạm vi plan_monthly_sales với fact trước khi publish KPI kế hoạch',10,false),
 ('D3','doc','Không lưu cột dẫn xuất inventory_value; tính bằng measure',11,false);

-- ---------------------------------------------------------------------
-- Bảng nguồn cho visual DB3
-- ---------------------------------------------------------------------
create table audit.error_layer (
  layer_order int primary key,
  layer       text,
  question    text,
  example     text,
  metric      text,
  owner       text
);
insert into audit.error_layer values
 (1,'Dữ liệu','Có ghi đúng cái đã xảy ra không?','unit_price = 0, dòng trùng, orphan KH999','DQ Score = 97,79%','Người nhập liệu / ETL'),
 (2,'Quy trình','Cái đã xảy ra có được phép không?','Bán hàng Discontinued, bán cho khách Inactive','PV Score = 13,94%','Quản lý bán hàng'),
 (3,'Thiết kế','Hệ thống có đúng không?','Không có khóa tự nhiên · date sai kiểu · plan khác phạm vi','Không đo bằng % — liệt kê','IT / kiến trúc dữ liệu');

create table audit.waterfall_step (
  step_order int primary key,
  step_code  text,
  step_name  text,
  amount     numeric,
  is_total   boolean
);
-- Cancelled đóng góp 0 đồng — KHÔNG xuất hiện trong waterfall (§6.5)
insert into audit.waterfall_step values
 (1,'A','Gross Revenue (Completed + Open)',      5463412100, false),
 (2,'B','Trừ dòng trùng thật (1 dòng)',            -11956000, false),
 (3,'C','Trừ dòng bất khả thi Qty=900',           -135000000, false),
 (4,'D','Trừ hàng trả lại (22 dòng Return)',      -107785450, false),
 (5,'E','Revenue Net',                            5208670650, true);

create table audit.dq_results (
  id          bigserial primary key,
  rule_code   text references audit.rule_definitions(rule_code),
  src_row_index integer,
  blocked     boolean,
  pg_error    text,
  tested_at   timestamptz default now()
);

-- =====================================================================
-- DIM SNAPSHOT (bảng thật, không phải view — FK cần PK)
-- =====================================================================
create table audit.dim_product   as select * from stg.dim_product;
create table audit.dim_customer  as select * from stg.dim_customer;
create table audit.dim_warehouse as select * from stg.dim_warehouse;
-- Unknown member bị LOẠI khỏi bảng validated: H3 phải chặn được orphan,
-- nên dim ở đây chỉ chứa master hợp lệ.
delete from audit.dim_product   where item_code     = 'VT999';
delete from audit.dim_customer  where customer_code = 'KH999';
alter table audit.dim_product   add primary key (item_code);
alter table audit.dim_customer  add primary key (customer_code);
alter table audit.dim_warehouse add primary key (warehouse_code);

-- =====================================================================
-- ⭐ BẢNG CÓ ĐỦ CONSTRAINT — dùng để CHỨNG MINH rule hoạt động
-- =====================================================================
create table audit.fact_sales_validated (
  sales_sk       bigint generated always as identity primary key,   -- H1
  src_row_index  integer,
  doc_date       date    not null,
  order_no       text    not null check (order_no !~ '(9999|0000)$'), -- H7
  line_no        integer not null,
  customer_code  text    not null references audit.dim_customer(customer_code),   -- H3
  item_code      text    not null references audit.dim_product(item_code),        -- H3
  warehouse_code text    not null references audit.dim_warehouse(warehouse_code), -- H3
  qty_order      numeric not null,
  qty_delivered  numeric not null,
  unit_price     numeric not null check (unit_price > 0),            -- H4
  discount_pct   numeric not null,
  doc_status     text    not null,
  delivery_due_date    date,
  actual_delivery_date date,

  -- H2: chặn bản ghi GIỐNG HỆT. Không phải "trùng order_no+line_no".
  constraint uq_business_row unique
    (doc_date, order_no, line_no, customer_code, item_code, warehouse_code,
     qty_order, qty_delivered, unit_price, discount_pct, doc_status)
);

create table audit.fact_inventory_validated (
  inv_sk         bigint generated always as identity primary key,
  month_end      date not null,
  item_code      text not null references audit.dim_product(item_code),        -- H3
  warehouse_code text not null references audit.dim_warehouse(warehouse_code),
  on_hand_qty    numeric not null check (on_hand_qty >= 0),          -- H5
  safety_stock   numeric,
  last_receipt_date date not null,                                   -- H6: kiểu date, không phải int
  unique (month_end, item_code, warehouse_code)
);

-- ---------------------------------------------------------------------
-- ⭐ H9 — rule mạnh nhất trong checklist.
-- Đối chiếu CHÉO hai bảng fact. Không rule đơn bảng nào bắt được nó.
-- Chính rule này chứng minh SO2605-9999 (900 đv từ kho tối đa 300) là
-- bản ghi BẤT KHẢ THI, không phải outlier thống kê. (§6.4b)
--
-- ⚠️ BẪY THỨ TỰ: trigger BEFORE INSERT chạy TRƯỚC khi Postgres kiểm
--    FOREIGN KEY. Nếu H9 raise khi không tìm thấy tồn kho, nó sẽ NUỐT
--    lỗi H3 của orphan VT999 và báo sai rule. Phải trả về NEW và để
--    FK tự chặn.
-- ---------------------------------------------------------------------
create or replace function audit.check_qty_vs_onhand() returns trigger as $$
declare
  max_onhand numeric;
begin
  select max(on_hand_qty) into max_onhand
  from raw.fact_inventory_eom
  where item_code = new.item_code
    and warehouse_code = new.warehouse_code;

  -- Không có dữ liệu tồn kho cho cặp (item, kho):
  --   • item orphan (VT999)  → để H3/FK chặn
  --   • kho không hoạt động (WH_OLD, không có dòng tồn kho) → để H8 chặn
  -- H9 KHÔNG phát biểu gì về trường hợp này.
  if max_onhand is null then
    return new;
  end if;

  if new.qty_delivered > max_onhand then
    raise exception
      'H9: qty_delivered=% vuot ton kho toi da % cua (%, %) trong ky',
      new.qty_delivered, max_onhand, new.item_code, new.warehouse_code;
  end if;
  return new;
end $$ language plpgsql;

create trigger trg_h9_qty_vs_onhand
  before insert on audit.fact_sales_validated
  for each row execute function audit.check_qty_vs_onhand();

-- ---------------------------------------------------------------------
-- H8 — master phải Active. Tầng quy trình, nhưng DB enforce được.
-- ---------------------------------------------------------------------
create or replace function audit.check_master_active() returns trigger as $$
begin
  if (select item_status from audit.dim_product where item_code = new.item_code) <> 'Active' then
    raise exception 'H8: item % khong con Active', new.item_code;
  end if;
  if (select customer_status from audit.dim_customer where customer_code = new.customer_code) <> 'Active' then
    raise exception 'H8: customer % khong con Active', new.customer_code;
  end if;
  if (select warehouse_status from audit.dim_warehouse where warehouse_code = new.warehouse_code) <> 'Active' then
    raise exception 'H8: warehouse % khong con Active', new.warehouse_code;
  end if;
  return new;
end $$ language plpgsql;

create trigger trg_h8_master_active
  before insert on audit.fact_sales_validated
  for each row execute function audit.check_master_active();

comment on table audit.fact_sales_validated is
  'Bảng CÓ constraint. Không dùng để báo cáo. Dùng để chứng minh rule H1-H9 '
  'chặn được đúng 10 dòng bẩn. Kết quả ghi vào audit.dq_results.';
