# `docs/model-spec.md` — Đặc tả semantic model

Đây là đầu vào cho `semantic-model-authoring` skill + Power BI Modeling MCP.
**Không hand-write TMDL.** Skill sinh ra file schema-correct; con người viết TMDL tay
sẽ hỏng ở `lineageTag`, `partition`, `annotation`.

Mọi con số dưới đây đã verify bằng `005_reconcile.sql` — 20/20 xanh.

---

## 1. Storage mode & nguồn

**Import.** Không DirectQuery. Lý do: `Achievement Index` cần `ALL()` để thoát filter
context, dataset chỉ 1.317 dòng, và DirectQuery qua Supavisor pooler sinh SQL chậm vô ích.

Kết nối: PostgreSQL connector · Session Pooler · SSL Mode `Require` · role `pbi_reader`.

Mỗi bảng một partition M, dạng:

```m
let
    Source = PostgreSQL.Database(ServerParam, "postgres"),
    Data   = Source{[Schema="mart", Item="fact_sales"]}[Data]
in
    Data
```

`ServerParam` là parameter (`aws-0-<region>.pooler.supabase.com:5432`) để đổi môi trường
không phải sửa 12 query.

> ⚠️ **Không** thêm bước `Table.Distinct` hay `Remove Duplicates` ở bất kỳ query nào.
> Làm sạch đã xong ở tầng SQL. Xem `CLAUDE.md` điều 1.

---

## 2. Bảng

### 2.1. Fact

| Bảng nguồn | Dòng | Vai trò | Hidden? |
|---|---|---|---|
| `mart.fact_sales` | 450 | Dashboard 1 | không |
| `mart.fact_inventory` | 864 | Dashboard 2 | không |
| `mart.item_moc` | 36 | Dashboard 2 — scatter quadrant | không |
| `mart.plan_monthly` | 108 | Dashboard 1 — target | ẩn cột `category_name` |
| **`mart.dq_fact_sales`** | **452** | **Dashboard 3 CHỈ** | không |
| `mart.dq_fact_inventory` | 865 | Dashboard 3 | không |
| `mart.dq_inventory_recon` | 865 | Dashboard 3 — Q7 | không |

> ⚠️ Hai bảng sales là **chủ đích**. `fact_sales` đã làm sạch (450), `dq_fact_sales`
> nguyên trạng kèm cờ (452). DQ Score = 10/452 nên **không** tính được từ bảng đã làm sạch.
> **Cấm nối quan hệ giữa hai bảng.**

### 2.2. Dimension

| Bảng nguồn | Dòng | Ghi chú |
|---|---|---|
| `mart.dim_month` | 6 | Conformed. `fact_sales`, `plan_monthly`, `fact_inventory` cùng trỏ vào |
| `mart.dim_market_region` | 4 | **VÙNG KHÁCH HÀNG** (3 + `(Unknown)`) |
| `mart.dim_category` | 7 | 6 + `(Unknown)` |
| `mart.dim_product` | 37 | 36 + `VT999`. `standard_cost` của VT999 = **NULL cố ý** |
| `mart.dim_customer` | 41 | 40 + `KH999` |
| `mart.dim_warehouse` | 5 | Cột `warehouse_region` — **tên khác hẳn**, chống nhầm |

### 2.3. Bảng tham chiếu Dashboard 3

`mart.audit_issues` (11 dòng) · `mart.audit_rules` (16) · `mart.audit_error_layer` (3)
· `mart.audit_waterfall` (5) · `mart.audit_dq_results` · `mart.cleaning_scenarios` (3)

---

## 3. Quan hệ

**Conformed dimension, không bridge table, không many-to-many.**

```
                        dim_month  (6)
              ┌──────────────┼──────────────┐
              │              │              │
        fact_sales    plan_monthly    fact_inventory
              │              │              │
              │              │              └─ dim_warehouse (warehouse_region)
              │              │
   dim_customer ── dim_market_region (4) ────┘
              │
   dim_product ── dim_category (7) ──────────┘
```

| # | Từ | Đến | Cardinality | Filter | Active |
|---|---|---|---|---|---|
| R1 | `fact_sales[month_start]` | `dim_month[month_start]` | many→1 | single | ✅ |
| R2 | `fact_sales[customer_code]` | `dim_customer[customer_code]` | many→1 | single | ✅ |
| R3 | `fact_sales[item_code]` | `dim_product[item_code]` | many→1 | single | ✅ |
| R4 | `fact_sales[warehouse_code]` | `dim_warehouse[warehouse_code]` | many→1 | single | ✅ |
| R5 | `dim_customer[region]` | `dim_market_region[market_region]` | many→1 | single | ✅ |
| R6 | `dim_product[category_code]` | `dim_category[category_code]` | many→1 | single | ✅ |
| R7 | `plan_monthly[month_start]` | `dim_month[month_start]` | many→1 | single | ✅ |
| R8 | `plan_monthly[market_region]` | `dim_market_region[market_region]` | many→1 | single | ✅ |
| R9 | `plan_monthly[category_code]` | `dim_category[category_code]` | many→1 | single | ✅ |
| R10 | `fact_inventory[month_start]` | `dim_month[month_start]` | many→1 | single | ✅ |
| R11 | `fact_inventory[item_code]` | `dim_product[item_code]` | many→1 | single | ✅ |
| R12 | `fact_inventory[warehouse_code]` | `dim_warehouse[warehouse_code]` | many→1 | single | ✅ |
| R13 | `item_moc[item_code]` | `dim_product[item_code]` | 1→1 | single | ✅ |
| R14 | `dq_fact_sales[warehouse_code]` | `dim_warehouse[warehouse_code]` | many→1 | single | ✅ |
| R15 | `dq_fact_sales[month_start]` | `dim_month[month_start]` | many→1 | single | ✅ |

**Không có quan hệ nào khác.** Đặc biệt:
- ❌ `dim_warehouse[warehouse_region]` → `dim_market_region` — **cấm tuyệt đối**
- ❌ `fact_sales` ↔ `dq_fact_sales`
- ❌ `plan_monthly` → `fact_sales` trực tiếp

R5–R9 là mấu chốt: `plan` và `fact` cùng trỏ vào `dim_market_region` và `dim_category`,
nên filter chảy xuống cả hai. Đó là lý do không cần bridge table.

---

## 4. Measure

### 4.1. Doanh thu & biên (Dashboard 1)

```dax
Revenue Net =
CALCULATE( SUM(fact_sales[line_revenue]), fact_sales[doc_status] <> "Cancelled" )
-- 5.208.670.650
-- Ghi chú: cả 49 dòng Cancelled đều có qty_delivered = 0, nên bộ lọc này
-- KHÔNG đổi Revenue một đồng. Nó chỉ có tác dụng ở Fill Rate.
```

```dax
Revenue With Cost =                                    -- mẫu số của GM%
SUMX(
    FILTER(
        fact_sales,
        fact_sales[doc_status] <> "Cancelled"
            && NOT ISBLANK( RELATED(dim_product[standard_cost]) )
    ),
    fact_sales[line_revenue]
)
-- 5.171.840.150   ⚠️ KHÁC Revenue Net 36.830.500 (2 dòng VT999)
```

```dax
COGS =
SUMX(
    FILTER(
        fact_sales,
        fact_sales[doc_status] <> "Cancelled"
            && NOT ISBLANK( RELATED(dim_product[standard_cost]) )
    ),
    fact_sales[qty_delivered] * RELATED(dim_product[standard_cost])
)
-- 4.283.440.000
```

```dax
Gross Margin  = [Revenue With Cost] - [COGS]           -- 888.400.150
Gross Profit  = [Gross Margin]                          -- alias cho bảng Top/Bottom

Gross Margin % = DIVIDE( [Gross Margin], [Revenue With Cost] )
-- 17,18%.  ⚠️ NẾU chia cho [Revenue Net] → 17,06%.
-- ⚠️ NẾU coi COGS(VT999) = 0 rồi chia [Revenue Net] → 17,76%. Đây là bẫy §4.2.
```

```dax
Fill Rate =
DIVIDE(
    CALCULATE( SUM(fact_sales[qty_delivered]),
               fact_sales[doc_status] IN { "Completed", "Open" } ),
    CALCULATE( SUM(fact_sales[qty_order]),
               fact_sales[doc_status] IN { "Completed", "Open" } )
)
-- 87,21%.  Chỉ "Completed" → 96,82% (tự tô hồng).
```

```dax
On-time Delivery =
VAR Delivered = FILTER( fact_sales, NOT ISBLANK(fact_sales[actual_delivery_date]) )
RETURN
DIVIDE(
    COUNTROWS( FILTER( Delivered,
        fact_sales[actual_delivery_date] <= fact_sales[delivery_due_date] ) ),
    COUNTROWS( Delivered )
)
-- 37,27% (n = 330).  Đơn Open chưa đến hạn thì chưa thể gọi là trễ.
```

```dax
Avg Days Late =                          -- 3,37 ngày · n = 207 đơn TRỄ
AVERAGEX(
    FILTER( fact_sales, fact_sales[actual_delivery_date] > fact_sales[delivery_due_date] ),
    DATEDIFF( fact_sales[delivery_due_date], fact_sales[actual_delivery_date], DAY )
)

Avg Delivery Delay =                     -- 2,02 ngày · n = 330 đơn ĐÃ GIAO
AVERAGEX(
    FILTER( fact_sales, NOT ISBLANK(fact_sales[actual_delivery_date]) ),
    DATEDIFF( fact_sales[delivery_due_date], fact_sales[actual_delivery_date], DAY )
)
-- ⚠️ HAI CHỈ SỐ KHÁC NHAU. analysis.md §2.4 gọi cái thứ hai là "Avg Days Late".
--    Xem ERRATA.md E3. Hiện cái ĐẦU trên dashboard — nó trả lời "trễ thì trễ bao lâu".
```

```dax
Return Value =
CALCULATE( SUM(fact_sales[line_revenue]), fact_sales[doc_status] = "Return" )
-- −107.785.450

Return Rate =
DIVIDE(
    -[Return Value],
    CALCULATE( SUM(fact_sales[line_revenue]),
               fact_sales[doc_status] IN { "Completed", "Open" } )
)
-- 2,24%
```

### 4.2. Kế hoạch & Achievement Index (Dashboard 1)

```dax
Target = SUM( plan_monthly[target_revenue] )            -- 84.602.000.000

Revenue In Plan Scope =
CALCULATE( [Revenue Net], fact_sales[in_plan_scope] = TRUE )
-- 5.134.128.150 (397 dòng). Loại KH999 (không có region) và VT999 (không có category).

Pct of Plan = DIVIDE( [Revenue In Plan Scope], [Target] )   -- tooltip: 6,07%
```

```dax
Achievement Index =
VAR RatioLocal =
    DIVIDE( [Revenue In Plan Scope], [Target] )
VAR RatioGlobal =
    DIVIDE(
        CALCULATE( [Revenue In Plan Scope],
            REMOVEFILTERS(dim_month), REMOVEFILTERS(dim_market_region),
            REMOVEFILTERS(dim_category), REMOVEFILTERS(dim_customer),
            REMOVEFILTERS(dim_product) ),
        CALCULATE( [Target],
            REMOVEFILTERS(dim_month), REMOVEFILTERS(dim_market_region),
            REMOVEFILTERS(dim_category) )
    )
RETURN DIVIDE( RatioLocal, RatioGlobal ) * 100
-- 100 = mặt bằng chung (6,0686%).
-- ⚠️ RatioGlobal PHẢI dùng [Revenue In Plan Scope], không phải [Revenue Net].
--    Nếu dùng [Revenue Net] → global = 6,16% và MỌI Index lệch ~1,4%.
-- ⚠️ CHỈ đọc ở cấp Region / Category / Month. Ở cấp ô chỉ ~3,7 đơn hàng.
```

Giá trị kiểm chứng: Miền Bắc **124,9** · Miền Nam **99,5** · Miền Trung **78,6**
· Ắc quy 121,3 · Phụ tùng nhanh **67,0** · T2 60,9 · T5 **189,8**

### 4.3. Định dạng có điều kiện (Dashboard 1)

```dax
GM% Color =                                -- trả về HEX STRING, không phải số
VAR g = [Gross Margin %]
RETURN
SWITCH( TRUE(),
    ISBLANK(g),   "#9E9E9E",
    g < 0.13,     "#C0392B",               -- Lốp 11,76%
    g < 0.16,     "#E08E79",
    g < 0.19,     "#BDC3C7",               -- mốc giữa: 17,18%
    g < 0.21,     "#7FB3D5",
                  "#1F618D"                -- Hóa chất 21,60%
)
-- Thang DIVERGING quanh 17,18%. Đỏ ↔ xanh DƯƠNG, không xanh lá (mù màu).
-- Hex thật lấy từ design/palette.md khi Claude Design giao.
```

```dax
Is Slow Heavy =                            -- tô nền cam ở bảng Top/Bottom DB1
COALESCE( SELECTEDVALUE( item_moc[is_slow_heavy] ), FALSE )
```

### 4.4. Tồn kho (Dashboard 2)

```dax
Inventory Value EOM =
CALCULATE( SUM(fact_inventory[inventory_value]), fact_inventory[is_latest_eom] = TRUE )
-- 6.391.770.000 (144 dòng, đã loại VT999)

OnHandQty EOM =
CALCULATE( SUM(fact_inventory[on_hand_qty]), fact_inventory[is_latest_eom] = TRUE )
-- 10.175
```

```dax
MOC =
VAR OnHand = SUM( item_moc[on_hand_eom] )
VAR Sold6M = SUM( item_moc[sold_6m] )
RETURN DIVIDE( OnHand, DIVIDE( Sold6M, 6 ) )
-- ⚠️ sold_6m tính bằng SQL với filter doc_status IN ('Completed','Return').
--    KHÁC Revenue Net, KHÁC Fill Rate. Xem ERRATA.md E2.
-- ⚠️ DIVIDE() trả BLANK khi Sold6M = 0, không phải ∞.
```

```dax
Slow Heavy Value = CALCULATE( SUM(item_moc[inv_value_eom]), item_moc[is_slow_heavy] = TRUE )
Slow Heavy Count = CALCULATE( COUNTROWS(item_moc),          item_moc[is_slow_heavy] = TRUE )
Slow Heavy Pct   = DIVIDE( [Slow Heavy Value], CALCULATE([Slow Heavy Value], REMOVEFILTERS(item_moc)) )
-- 9 item · 2.402.800.000 · 37,6%
```

```dax
SlowHeavy Label =                          -- nhãn CHỈ cho 9 item trên scatter
IF( SELECTEDVALUE( item_moc[is_slow_heavy] ) = TRUE,
    SELECTEDVALUE( item_moc[item_code] ),
    BLANK() )
-- Nếu bật category label thô, scatter hiện nhãn CẢ 36 item. Rối không đọc được.
```

```dax
Discontinued Value =
CALCULATE( [Inventory Value EOM], dim_product[item_status] = "Discontinued" )
-- 580.050.000

Discontinued Pct = DIVIDE( [Discontinued Value],
                           CALCULATE([Inventory Value EOM], REMOVEFILTERS(dim_product)) )
-- 9,1%

Negative Stock Rows =
CALCULATE( COUNTROWS(fact_inventory),
           fact_inventory[flag_negative_stock] = TRUE,
           fact_inventory[is_latest_eom] = TRUE )
-- 4 dòng. VT018 âm ở 2 kho ⇒ lỗi quy trình, không phải ngẫu nhiên.

Below Safety Rows =
CALCULATE( COUNTROWS(fact_inventory),
           fact_inventory[flag_below_safety] = TRUE,
           fact_inventory[is_latest_eom] = TRUE )
-- 40 / 144 = 27,8%
```

```dax
Max Discount Before Loss =                 -- bảng Discontinued
VAR lp = SELECTEDVALUE( dim_product[list_price] )
VAR sc = SELECTEDVALUE( dim_product[standard_cost] )
RETURN DIVIDE( lp - sc, lp )
-- VT021 15,3% · VT007 21,9% · VT035 19,9%

Inv to Revenue Ratio =                     -- nhãn trên bar theo kho
DIVIDE( [Inventory Value EOM], [Revenue Net] )
-- Miền Bắc 1,21 · Miền Nam 1,04 · Miền Trung 1,53 (WH_DN chôn vốn nhiều nhất)

Inventory Pct =
DIVIDE( [Inventory Value EOM],
        CALCULATE([Inventory Value EOM], REMOVEFILTERS(dim_category)) )
```

### 4.5. Chất lượng dữ liệu (Dashboard 3)

**Tất cả tính trên `dq_fact_sales` (452 dòng), KHÔNG phải `fact_sales` (450 dòng).**

```dax
DQ Score SO =
DIVIDE(
    COUNTROWS(dq_fact_sales) - CALCULATE(COUNTROWS(dq_fact_sales), dq_fact_sales[flag_dq_dirty] = TRUE),
    COUNTROWS(dq_fact_sales)
)
-- 97,79%  (10 dòng bẩn / 452)

DQ Score INV =
DIVIDE(
    COUNTROWS(dq_fact_inventory) - CALCULATE(COUNTROWS(dq_fact_inventory), dq_fact_inventory[flag_dq_dirty] = TRUE),
    COUNTROWS(dq_fact_inventory)
)
-- 98,27%  (15 dòng / 865)

PV Score =
DIVIDE(
    CALCULATE( COUNTROWS(dq_fact_sales), dq_fact_sales[flag_process_violation] = TRUE ),
    COUNTROWS(dq_fact_sales)
)
-- 13,94%  (63 dòng / 452)
-- ⚠️ Màu PHẢI khác hẳn DQ Score. Hai tầng lỗi, hai người chịu trách nhiệm.
```

```dax
Bias No Cleaning  = CALCULATE( SUM(cleaning_scenarios[bias_pct]), cleaning_scenarios[scenario_order] = 2 )
Bias Bad Dedupe   = CALCULATE( SUM(cleaning_scenarios[bias_pct]), cleaning_scenarios[scenario_order] = 3 )
-- +2,82%  ·  −5,63%  (−293.054.650 VNĐ)
-- Làm sạch SAI nguy hiểm gấp đôi không làm sạch — và khó phát hiện hơn.

Inventory Recon Match Pct =
DIVIDE( CALCULATE(COUNTROWS(dq_inventory_recon), dq_inventory_recon[is_match] = TRUE),
        COUNTROWS(dq_inventory_recon) )
-- 99,88%  (864/865). Dòng lệch = VT999.
```

**PV Score theo nhân viên** — dùng `dq_fact_sales[salesperson]`, **không** `dim_customer[salesperson]`
(lệch nhau ở 76% số dòng).

| NV | Dòng bán | Vi phạm | % |
|---|---|---|---|
| Dũng | 109 | 21 | 19,3% |
| Bình | 114 | 17 | 14,9% |
| An | 115 | 14 | 12,2% |
| Chi | 114 | 11 | 9,6% |

> ⚠️ χ² = 4,716; p = 0,194. Chênh lệch **không có ý nghĩa thống kê**.
> Textbox `db3_txt_chisq` phải nằm ngay dưới bar chart. Hardcode giá trị.

**KHÔNG tạo measure "DQ Score theo nhân viên".** Chỉ 3/10 dòng bẩn là lỗi nhân viên thật.
Với n = 3, mọi khác biệt đều là nhiễu. Xem §6.7(c).

### 4.6. Field parameter

`Sort By` — cho sort toggle của `db1_tbl_topbottom`:

```dax
Sort By = {
    ("Revenue",      NAMEOF('_Measures'[Revenue Net]),   0),
    ("Gross Profit", NAMEOF('_Measures'[Gross Profit]),  1)
}
```

---

## 5. Định dạng & ẩn cột

| Measure | Format string |
|---|---|
| `Revenue Net`, `Gross Margin`, `Target`, `Inventory Value EOM`, `Slow Heavy Value` | `#,0,,\ "tr"` hoặc `#,0,,,\ "tỷ"` tùy card |
| `Gross Margin %`, `Fill Rate`, `On-time Delivery`, `Return Rate`, `DQ Score *`, `PV Score` | `0.00%` |
| `Achievement Index` | `0.0` |
| `MOC` | `0.0 "tháng"` |
| `Bias No Cleaning`, `Bias Bad Dedupe` | `+0.00%;-0.00%` |
| `Avg Days Late`, `Avg Delivery Delay` | `0.0 "ngày"` |

**Ẩn khỏi report view:** mọi cột khóa (`sales_sk`, `src_row_index`, `customer_code`,
`item_code`, `warehouse_code`, `category_code`), `line_revenue`, `in_plan_scope`,
`is_latest_eom`, `plan_monthly[category_name]` (trùng `dim_category`).

**Sắp xếp:** `dim_month[month_label]` sort theo `dim_month[month_start]`.

---

## 6. Gate 4 — kiểm tra trước khi sang report

Mở PBIP trong Power BI Desktop. Kéo vào một table visual **không slicer**:

| Measure | Phải ra |
|---|---|
| `Revenue Net` | 5.208.670.650 |
| `Gross Margin` | 888.400.150 |
| `Gross Margin %` | 17,18% |
| `Fill Rate` | 87,21% |
| `On-time Delivery` | 37,27% |
| `Achievement Index` | 100,0 |
| `Pct of Plan` | 6,07% |
| `Inventory Value EOM` | 6.391.770.000 |
| `Slow Heavy Count` | 9 |
| `Slow Heavy Value` | 2.402.800.000 |
| `DQ Score SO` | 97,79% |
| `PV Score` | 13,94% |

Một dòng sai là dừng. Đừng dựng report trên model sai.
