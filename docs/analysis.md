# Phân tích Dataset & Đặc tả 3 Dashboard

**Nguồn dữ liệu:** `Data_set.xlsx` — 7 sheet, kỳ 01/2026 – 06/2026
**Ngày phân tích:** 09/07/2026

> ⚠️ **Đọc `ERRATA.md` trước khi viết DAX.** Sáu con số/phát biểu trong tài liệu này
> đã được kiểm chứng lại bằng dữ liệu thật; bốn cái cần đính chính.

---

## 0. TÓM TẮT ĐIỀU HÀNH

Star schema hoàn chỉnh: 2 fact (bán hàng, tồn kho cuối tháng), 3 dim, 1 plan, 1 sheet hint.
Dữ liệu **synthetic** — lỗi được cài cắm có chủ đích.

| # | Phát hiện | Ảnh hưởng |
|---|---|---|
| 1 | **`fact_sales_orders` KHÔNG có khóa tự nhiên.** Trong 84 `OrderNo` có ≥2 dòng, **97,6% chứa >1 khách hàng**. Chỉ **1 cặp trùng thật** | Dedupe theo `OrderNo+LineNo` → mất oan **293.054.650 VNĐ (−5,63%)** |
| 2 | **Fact là mẫu ~6% của sổ đơn hàng.** Plan 6 tháng = 84,60 tỷ; Actual khớp grain = 5,13 tỷ ⇒ lệch **16,48 lần**. Không phải lỗi đơn vị | KPI "% đạt kế hoạch" tuyệt đối không dùng được ⇒ **Achievement Index** |
| 3 | **`Region` mơ hồ** — 65,7% dòng có vùng khách ≠ vùng kho | Chọn sai ⇒ doanh thu Miền Trung lệch 36% |
| 4 | **`LastReceiptDate` là Excel serial number** (45.816 → 46.198) | Mọi phân tích aging sai nếu không convert |

---

## 1. CẤU TRÚC DỮ LIỆU

| Sheet | Loại | Dòng | Khóa tự nhiên | Grain |
|---|---|---|---|---|
| `fact_sales_orders` | Fact (transaction) | 452 | **KHÔNG CÓ** ⚠️ | 1 dòng = 1 line item |
| `fact_inventory_EOM` | Fact (periodic snapshot) | 865 | MonthEnd + ItemCode + WarehouseCode ✅ | Tồn cuối tháng × item × kho |
| `dim_product` | Dimension | 36 | ItemCode | |
| `dim_customer` | Dimension | 40 | CustomerCode | |
| `dim_warehouse` | Dimension | 5 | WarehouseCode | |
| `plan_monthly_sales` | Plan | 108 | MonthStart + Region + CategoryCode | 6 tháng × 3 vùng × 6 nhóm |
| `data_quality_hint` | Metadata | 6 | RuleCode | |

**Completeness:**
- `fact_inventory_EOM` = 6 × 36 × 4 = 864 + 1 orphan `VT999` = 865 ✅
- `plan_monthly_sales` = 6 × 3 × 6 = 108 ✅
- Cả 40 khách hàng đều có giao dịch.

### Cột dễ hiểu nhầm

| Cột | Bảng | Lưu ý |
|---|---|---|
| `QtyOrder`, `QtyDelivered` | fact_sales | **Âm với `DocStatus = Return`** (22 dòng). Quy ước, không phải lỗi |
| `Salesperson` | fact_sales | NV bán **đơn hàng đó** |
| `Salesperson` | dim_customer | NV **phụ trách tài khoản**. Lệch nhau ở 344/452 dòng (76%) |
| `UnitPrice` | fact_sales | Bằng `ListPrice` ở **99,3%** dòng ⇒ đòn bẩy duy nhất là `DiscountPct` |
| `InventoryValue` | fact_inventory | Cột **dẫn xuất** = `OnHandQty × dim_product.StandardCost` (864/865 khớp) |
| `StandardCost` | **dim_product** | ⚠️ KHÔNG nằm trong `fact_inventory_EOM`. Xem `ERRATA.md` E1 |
| `LastReceiptDate` | fact_inventory | **Số nguyên (Excel serial).** Epoch = `1899-12-30` |

---

## 2. ĐỊNH NGHĨA METRIC

### 2.1. Revenue Net

`Revenue Net = QtyDelivered × UnitPrice × (1 − DiscountPct)`, loại `Cancelled`.

**Phát hiện:** cả 49 dòng `Cancelled` đều có `QtyDelivered = 0` ⇒ lọc `Cancelled`
**không đổi Revenue một đồng**. Câu lọc đó chỉ có tác dụng ở **Fill Rate**.

Phạm vi thực tế: `Completed` + `Open` + `Return`. Giá trị trả lại: **−107.785.450 VNĐ = 2,24%**.

### 2.2. Gross Margin

`VT999` là orphan, không có `StandardCost` ⇒ COGS = NULL. Nếu công cụ coi COGS = 0,
Gross Margin phồng thêm **36.830.500 VNĐ** và GM% lên **17,76%** thay vì 17,18%.

Mẫu số GM% **bắt buộc** = doanh thu của các dòng CÓ `StandardCost` = **5.171.840.150**.

### 2.3. Fill Rate

| Phạm vi | Fill Rate |
|---|---|
| Đơn dương, **giữ** Cancelled | 81,38% — phạt DN vì khách tự hủy |
| Đơn dương, **loại** Cancelled | **87,21%** ✅ |
| Chỉ `Completed` | 96,82% — **tự tô hồng** |
| Chỉ `Open` | 48,51% |

⇒ `DocStatus IN {"Completed","Open"}`.

### 2.4. On-time Delivery

120 dòng `ActualDeliveryDate` NULL = 71 `Open` + 49 `Cancelled`. **Null hợp lệ.**

| Mẫu số | OTD |
|---|---|
| Dòng đã có ngày giao thực tế (n = 330) | **37,27%** ✅ |
| Tất cả trừ Cancelled, coi NULL = trễ (n = 403) | 30,52% |

Hai chỉ số phụ — **khác nhau, xem `ERRATA.md` E3:**
- `Avg Delivery Delay` = **2,02 ngày** (n = 330, gồm cả đơn giao sớm/đúng hạn)
- `Avg Days Late` = **3,37 ngày** (n = 207 đơn thực sự trễ) — nên dùng cái này

> ⚠️ **Insight cốt lõi:** Fill Rate 87,21% nhưng OTD 37,27% ⇒ **"giao đủ hàng nhưng giao muộn"**.
> Chỉ hiện Fill Rate là che mất toàn bộ vấn đề vận hành.

### 2.5. Achievement Index

`plan_monthly_sales.Region` ≡ `dim_customer.Region` (kế hoạch theo **thị trường**).

| | Giá trị |
|---|---|
| `plan_monthly_sales` tổng | 84.602.000.000 |
| Revenue Net khớp grain (397 dòng) | **5.134.128.150** |
| % đạt kế hoạch | **6,07%** |
| Plan gấp Actual | **16,48 lần** |

Chênh với Revenue Net tổng (5.208.670.650) = **74.542.500** — gồm `KH999` (không có Region)
và `VT999` (không có Category). ⇒ Mẫu số global của Index **phải loại 4 dòng này**.

#### Chẩn đoán: vì sao lệch 16,48 lần

| Giả thuyết | Kiểm chứng | Kết luận |
|---|---|---|
| Lỗi đơn vị | Tỷ số 16,48 — không phải 10/100/1.000/12 | ❌ |
| Plan nhân hệ số cố định | CV trên 108 ô = **1,077** | ❌ |
| **Fact chỉ là mẫu** | 75 dòng/tháng vs ~1.086 cần có ⇒ ≈14,5× | ✅ |

Giá trị TB một dòng đơn = 12.989.204 VNĐ, GM% = 17,18% — **hoàn toàn bình thường**.
Cái thiếu chỉ là **số lượng giao dịch**.

#### Định nghĩa

```
Achievement Index(nhóm) = [Actual(nhóm) / Target(nhóm)]
                        ÷ [Actual(tổng) / Target(tổng)]   ← = 6,07%
                        × 100
```

| Region | % đạt | **Index** | | Nhóm hàng | **Index** | | Tháng | Index |
|---|---|---|---|---|---|---|---|---|
| Miền Bắc | 7,58% | **124,9** | | Ắc quy | **121,3** | | T1 | 71,9 |
| Miền Nam | 6,04% | 99,5 | | Hóa chất | 120,7 | | T2 | **60,9** |
| **Miền Trung** | 4,77% | **78,6** | | Dầu nhớt | 119,5 | | T3 | 107,7 |
| | | | | Thân vỏ | 94,7 | | T4 | 71,3 |
| | | | | Lốp | 80,8 | | T5 | **189,8** |
| | | | | **Phụ tùng nhanh** | **67,0** | | T6 | 107,6 |

#### Giới hạn — phải ghi rõ trên dashboard

**(a)** Index **không** phải chỉ số chuẩn ngành. Tài liệu này định nghĩa nó.
**(b)** **Chỉ đọc ở cấp tổng hợp.** 397 dòng / 108 ô = **3,68 dòng/ô**; 29/105 ô có ≤2 đơn.
Ở grain đó Index dao động **−0,7 → 848,3**.
**(c)** Mẫu số có thể âm hoặc bằng 0 (1 ô âm, 1 ô = 0). Heatmap không thể dùng thang từ 0.
**(d)** Chỉ dùng ở Dashboard 1.

> ⚠️ **Tam giác hóa:** Miền Trung vừa có Index thấp nhất (78,6), vừa chứa ô doanh thu âm
> duy nhất (T6 · Dầu nhớt: −505.600), vừa có tỷ lệ tồn/doanh thu cao nhất (WH_DN: 1,53).
> Ba chỉ số độc lập cùng chỉ một hướng ⇒ **vấn đề thật, không phải nhiễu.**

---

## 3. CHẤT LƯỢNG DỮ LIỆU

### 3.1. ⚠️ DQ03 — "Duplicate key" là một cái bẫy

Sheet hint nói *"Trùng OrderNo + LineNo"*. Có **50 dòng** vi phạm, thuộc 24 cụm.
Nhưng chỉ **2 dòng (1 cụm)** trùng hoàn toàn.

#### `OrderNo` có phải mã đơn hàng không?

Trong **84 `OrderNo` có từ 2 dòng trở lên**:

| Kiểm tra | Kết quả |
|---|---|
| Có >1 khách hàng trong cùng `OrderNo` | **97,6%** |
| Có >1 ngày đặt hàng | 92,9% |
| Có >1 kho | 73,8% |
| Nhất quán hoàn toàn | **1,2%** — đúng 1 đơn |
| `LineNo` chạy đúng 1..n | **22,3%** |
| Tiền tố `SO26MM` khớp `DocDate` | 452/452 = **100%** |

**`fact_sales_orders` không có khóa tự nhiên.** `OrderNo`/`LineNo` là nhãn được sinh ra,
chỉ mang thông tin tháng. **Không thể "trùng khóa" khi chưa từng có khóa** ⇒ 48 dòng cùng
`OrderNo+LineNo` khác nội dung **KHÔNG phải dòng bẩn**.

#### Xác minh dòng trùng thật — hai phương pháp độc lập

| Phương pháp | Kết quả |
|---|---|
| **(1)** Lọc cột `Note` | 1 dòng: index **450** |
| **(2)** So sánh **toàn bộ 14 cột nghiệp vụ** *(không dùng `Note`)* | 2 dòng: index **20** và **450** |

| idx | DocDate | OrderNo | LineNo | KH | Item | Kho | Qty | UnitPrice | Status |
|---|---|---|---|---|---|---|---|---|---|
| 20 | 2026-02-02 | SO2602-0137 | 1 | KH026 | VT002 | WH_HN | 28 | 427.000 | Completed |
| **450** | 2026-02-02 | SO2602-0137 | 1 | KH026 | VT002 | WH_HN | 28 | 427.000 | Completed |

➡️ **Xóa index 450, giữ index 20.** Doanh thu giảm 11.956.000 VNĐ.

> Cột `Note` là *đáp án cài sẵn*, không tồn tại trong dữ liệu vận hành thật.
> Bài nộp phải trình bày theo **phương pháp (2)** — rule tái sử dụng được.

| Cách xử lý | Doanh thu mất | |
|---|---|---|
| `drop_duplicates(['OrderNo','LineNo'])` | **−305.010.650** | ❌ Xóa 26 giao dịch thật |
| Chỉ xóa index 450 | **−11.956.000** | ✅ |

### 3.2. Waterfall Reconciliation

| Bước | Diễn giải | Giá trị (VNĐ) | Lũy kế |
|---|---|---|---|
| A | Gross Revenue (Completed + Open, gồm mọi lỗi) | +5.463.412.100 | 5.463.412.100 |
| B | Trừ dòng trùng thật | −11.956.000 | 5.451.456.100 |
| C | Trừ dòng `QtyOrder = 900` | −135.000.000 | 5.316.456.100 |
| D | Trừ hàng trả lại (22 dòng) | −107.785.450 | **5.208.670.650** |
| — | *Cancelled đóng góp 0 đồng* | 0 | |

**Ba kịch bản:**

| | Revenue Net | Sai lệch |
|---|---|---|
| ✅ Làm sạch đúng | **5.208.670.650** | — |
| ⚠️ Không làm sạch gì | 5.355.626.650 | **+2,82%** |
| ❌ Dedupe máy móc | 4.915.616.000 | **−5,63%** (−293.054.650) |

> **Làm sạch SAI nguy hiểm gấp đôi không làm sạch** — và khó phát hiện hơn,
> vì kết quả trông "gọn gàng".

### 3.3. Kết quả sau làm sạch

| Metric | Giá trị |
|---|---|
| Revenue Net | **5.208.670.650 VNĐ** |
| COGS | 4.283.440.000 |
| Gross Margin | **888.400.150** |
| Gross Margin % | **17,18%** *(mẫu số = 5.171.840.150)* |
| Fill Rate | **87,21%** |
| On-time Delivery | **37,27%** (n = 330) |
| Avg Days Late | 3,37 ngày (n = 207) |
| % đạt kế hoạch | 6,07% |

*(450/452 dòng còn lại)*

---

## 4. DASHBOARD 1 — EXECUTIVE SALES

> *Tóm tắt doanh thu theo tháng / vùng / nhóm hàng. KPI: Revenue Net, Gross Margin,
> Fill Rate, % đạt kế hoạch, Top/Bottom sản phẩm hoặc khách hàng.*

### 4.1. Ba quyết định — ĐÃ CHỐT

| | Quyết định |
|---|---|
| **Region** | **Vùng KHÁCH HÀNG** (`dim_customer.Region`) |
| **Kênh "Nội bộ"** | **Vẫn tính vào Revenue Net.** `Channel` là dimension, dùng làm slicer |
| **Salesperson** | Cột trong `fact_sales_orders` — NV bán đơn hàng đó |

> ⚠️ **Dashboard 2 dùng `dim_warehouse.Region`.** Hai dashboard, hai định nghĩa Region.
> **Bắt buộc ghi chú.** 65,7% dòng có vùng khách ≠ vùng kho.

### 4.2. Năm KPI

| KPI | Phạm vi lọc | Giá trị |
|---|---|---|
| Revenue Net | `DocStatus ≠ 'Cancelled'` | **5.208.670.650** |
| Gross Margin | Như trên, trừ 2 dòng `VT999` | **888.400.150** |
| Gross Margin % | Mẫu số = 5.171.840.150 | **17,18%** |
| Fill Rate | `DocStatus IN {Completed, Open}` | **87,21%** |
| Achievement Index | Grain Month × Region × Category, 397 dòng | **100 = mặt bằng** · tooltip 6,07% |

KPI phụ: **OTD 37,27%** · **Return Rate 2,24%**

### 4.3. Ba lát cắt

#### (1) Theo THÁNG

| Tháng | Revenue Net | GM% | % đạt | **Index** |
|---|---|---|---|---|
| 2026-01 | 642.593.910 | 17,17% | 4,36% | 71,9 |
| 2026-02 | 514.718.460 | 18,34% | 3,69% | **60,9** |
| 2026-03 | 895.400.650 | 16,34% | 6,54% | 107,7 |
| 2026-04 | 688.069.060 | 17,30% | 4,33% | 71,3 |
| **2026-05** | **1.512.309.680** | 18,01% | 11,52% | **189,8** |
| 2026-06 | 955.578.890 | 15,93% | 6,53% | 107,6 |

T5 gấp gần 3× T2. Nửa đầu năm đều dưới mặt bằng.

#### (2) Theo VÙNG (khách hàng)

| Region | Revenue Net | GM% | **Index** |
|---|---|---|---|
| Miền Bắc | 1.947.827.200 | **18,11%** | **124,9** |
| Miền Nam | 1.792.218.470 | 16,70% | 99,5 |
| **Miền Trung** | 1.430.912.980 | 16,37% | **78,6** |
| *(Unknown)* | *37.712.000* | — | — |

Miền Trung yếu toàn diện: Index thấp nhất **và** GM% thấp nhất. Vừa bán ít vừa bán rẻ.

#### (3) Theo NHÓM HÀNG

| Nhóm hàng | Revenue Net | Gross Margin | **GM%** | **Index** |
|---|---|---|---|---|
| Dầu nhớt | 1.074.967.900 | 203.007.900 | 18,89% | 119,5 |
| Ắc quy | 1.000.535.080 | 141.805.080 | 14,17% | **121,3** |
| Hóa chất | 951.724.080 | **205.564.080** | **21,60%** | 120,7 |
| Phụ tùng thân vỏ | 813.056.660 | 135.496.660 | 16,67% | 94,7 |
| **Lốp** | 755.306.860 | **88.846.860** | **11,76%** | 80,8 |
| **Phụ tùng nhanh** | 576.249.570 | 113.679.570 | 19,73% | **67,0** |
| *(Unknown)* | *36.830.500* | — | — | — |

- **Hóa chất** doanh thu thứ 3 nhưng **Gross Profit cao nhất** — nhóm nên đẩy.
- **Lốp** GM% 11,76%, Gross Profit thấp nhất, mà target lại **cao nhất** (15,4 tỷ).
  Kế hoạch đang đặt cược vào nhóm biên mỏng nhất.
- **Phụ tùng nhanh** Index 67,0 — yếu nhất, dù GM% tốt. Biên tốt mà không bán được.

### 4.4. Top / Bottom — dùng Gross Profit, không phải Revenue

Chọn **sản phẩm**, không phải khách hàng: Top 10 khách theo Revenue và theo Gross Profit
là **cùng một tập 10 khách**, chỉ khác thứ tự. Sản phẩm thì khác hẳn.

| Xếp theo **Revenue** | | Xếp theo **Gross Profit** | GM% |
|---|---|---|---|
| VT008 Ắc quy 08 | 483.076.080 | VT025 Dầu nhớt 25 | 20% |
| VT025 Dầu nhớt 25 | 410.895.360 | VT006 Hóa chất 06 | 22% |
| **VT015 Lốp 15** | **405.811.440** | VT008 Ắc quy 08 | 14% |
| VT023 Thân vỏ 23 | 363.420.000 | VT023 Thân vỏ 23 | 16% |
| VT006 Hóa chất 06 | 330.164.100 | VT031 Dầu nhớt 31 | 18% |

> `VT015` đứng **#3 Revenue nhưng rơi khỏi Top 5 Gross Profit** (GM 12%).
> Bảng xếp theo Revenue khiến ban lãnh đạo đẩy sai sản phẩm.

**BOTTOM 5 (theo Gross Profit):** VT033 · VT036 · VT003 · VT017 · **VT021** *(Discontinued, còn tồn 250,6 tr)*

> ⚠️ **Tam giác hóa:** `VT021` và `VT007` xuất hiện ở cả ba nơi — Bottom Gross Profit,
> Slow & Heavy (§5.2), Discontinued còn tồn (§5.4). **Hai sản phẩm cần thanh lý ngay.**

### 4.5. Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  [Slicer: Tháng]  [Slicer: Region-khách]  [Slicer: Channel]        │
├──────────┬──────────┬──────────┬──────────────┬────────────────────┤
│Revenue   │  Gross   │   Fill   │  Achievement │  (phụ) OTD 37,27%  │
│  Net     │  Margin  │   Rate   │    Index     │  (phụ) Return 2,24%│
│ 5,21 tỷ  │ 888,4 tr │  87,21%  │  100 = TB    │                    │
├──────────┴──────────┴──────────┴──────────────┴────────────────────┤
│  (1) Column+Line: Revenue Net theo THÁNG                            │
│      cột = Revenue Net · đường = Achievement Index (thang phụ, 100) │
├─────────────────────────────────┬───────────────────────────────────┤
│  (2) Bar ngang: theo VÙNG KHÁCH │  (3) Bar ngang: theo NHÓM HÀNG    │
│      nhãn = Achievement Index   │      màu = GM% (diverging)        │
├─────────────────────────────────┴───────────────────────────────────┤
│  (4) Bảng Top 5 / Bottom 5 SẢN PHẨM  [sort toggle]                  │
│      ⚠️ tô nền cam nếu item nằm trong danh sách tồn chậm            │
└─────────────────────────────────────────────────────────────────────┘
```

**Chú thích bắt buộc trên trang** *(nguyên văn, không rút gọn)*:
- Region = vùng **KHÁCH HÀNG** (Dashboard 2 dùng vùng **KHO** — khác nhau).
- Achievement Index = tỷ lệ đạt kế hoạch chuẩn hóa, 100 = mặt bằng chung (6,07%). Chỉ đọc ở cấp vùng / nhóm hàng / tháng. KHÔNG đọc ở từng ô (~3,7 đơn/ô).
- Kênh Nội bộ (24,5% doanh thu) ĐƯỢC tính vào Revenue Net.
- Plan và fact không cùng phạm vi (fact là mẫu ~6%).
- Đã loại 1 dòng trùng, 1 dòng `QtyOrder = 900`. VT999 không có COGS ⇒ loại khỏi GM.

> **KHÔNG dựng heatmap Region × Category ở trang này.** ~3,7 đơn/ô, Index dao động −0,7 → 848,3.

---

## 5. DASHBOARD 2 — INVENTORY & SLOW MOVING

> *Tồn kho cuối tháng mới nhất; mặt hàng tồn cao nhưng bán chậm 6 tháng; tồn âm;
> hàng discontinued còn tồn; tồn kho theo kho/nhóm hàng.*

**Region ở dashboard này = `dim_warehouse.Region`** — khác Dashboard 1.

### 5.1. Nền tảng — EOM 30/06/2026

| | Giá trị |
|---|---|
| Số dòng snapshot | 145 (36 item × 4 kho + 1 orphan `VT999`) |
| **Tổng giá trị tồn (loại `VT999`)** | **6.391.770.000 VNĐ** |
| Tổng số lượng | 10.175 |

```
MOC (Months of Cover) = OnHandQty(EOM T6) ÷ (sold_6m ÷ 6)
Ngưỡng: MOC > 12 = slow moving · MOC > 24 = dead stock
```

> ⚠️ **`sold_6m` = `Σ QtyDelivered` với `DocStatus IN ('Completed','Return')`.**
> KHÁC filter của Revenue Net, KHÁC Fill Rate. Xem `ERRATA.md` E2.
> Dùng nhầm cho ra 6 item Slow&Heavy thay vì 9.

### 5.2. ⚠️ "Tồn CAO nhưng bán CHẬM" là điều kiện KÉP

**Bẫy 1:** không mặt hàng nào bán 0 đơn vị trong 6 tháng ⇒ định nghĩa "không bán được gì"
cho danh sách rỗng.

**Bẫy 2:** xếp hạng chỉ theo MOC cho **cảnh báo sai**. Bốn item có MOC rất cao nhưng
giá trị tồn dưới trung vị (**127.610.000**):

| Item | Giá trị tồn | MOC | |
|---|---|---|---|
| VT033 Lốp 33 | 72.800.000 | **65,7** | MOC cao nhất bộ dữ liệu — nhưng **thanh lý không cứu được dòng tiền** |
| VT036 Hóa chất 36 | 49.500.000 | 30,6 | |
| VT005 Thân vỏ 05 | 105.720.000 | 23,5 | |
| VT028 PT nhanh 28 | 126.100.000 | 16,6 | |

**Định nghĩa đúng:**

```
Slow & Heavy = InventoryValue > median(127.610.000) AND MOC > 12
```

**Kết quả: 9 item · 2.402.800.000 VNĐ · 37,6% tổng giá trị tồn kho đang mắc kẹt.**

| Item | Tên | ABC | Status | Tồn | Giá trị tồn | Bán 6T | **MOC** |
|---|---|---|---|---|---|---|---|
| VT023 | Phụ tùng thân vỏ 23 | **A** | Active | 263 | **473.400.000** | 123 | 12,8 |
| VT011 | Phụ tùng thân vỏ 11 | **A** | Active | 929 | 325.150.000 | 123 | **45,3** |
| VT012 | Hóa chất 12 | B | Active | 357 | 321.300.000 | 146 | 14,7 |
| VT014 | Ắc quy 14 | **A** | Active | 143 | 257.400.000 | 19 | **45,2** |
| VT021 | Lốp 21 | C | **Discontinued** | 716 | 250.600.000 | 143 | 30,0 |
| VT027 | Lốp 27 | **A** | Active | 274 | 246.600.000 | 88 | 18,7 |
| VT019 | Dầu nhớt 19 | C | Active | 221 | 198.900.000 | 99 | 13,4 |
| VT007 | Dầu nhớt 07 | C | **Discontinued** | 502 | 175.700.000 | 187 | 16,1 |
| VT035 | Phụ tùng thân vỏ 35 | C | **Discontinued** | 615 | 153.750.000 | 161 | 22,9 |

- **4/9 item là hạng A** — hàng "quan trọng nhất" đang chết vốn 1.302.550.000 VNĐ.
  Phân loại ABC hoặc dự báo nhu cầu đang sai.
- **VT023** giá trị tồn lớn nhất nhưng MOC 12,8 — bảng xếp theo MOC bỏ sót hoàn toàn.
- **VT011, VT014**: MOC > 45 tháng ở hạng A. Hai case cực đoan nhất.

### 5.3. Tồn âm tại 30/06/2026 — 4 dòng

| Item | Kho | OnHandQty | SafetyStock |
|---|---|---|---|
| VT018 Hóa chất 18 | WH_HN | **−7** | 10 |
| VT010 PT nhanh 10 | WH_DN | −3 | 30 |
| VT016 PT nhanh 16 | WH_DA | −2 | 20 |
| VT018 Hóa chất 18 | WH_DN | −1 | 20 |

`VT018` âm ở **2 kho khác nhau** ⇒ lỗi quy trình, không phải ngẫu nhiên một kho.
**KHÔNG set = 0.** Phải điều tra nghiệp vụ.

*(Cả 6 tháng có 14 dòng âm: WH_HCM 4 · WH_DA 4 · WH_DN 4 · WH_HN 2 — đừng nhầm hai con số.)*

### 5.4. Discontinued còn tồn — 580.050.000 VNĐ = 9,1%

| Item | Tồn | Giá trị tồn | StandardCost | ListPrice | **CK tối đa để không lỗ** |
|---|---|---|---|---|---|
| VT021 Lốp 21 | 716 | 250.600.000 | 350.000 | 413.000 | **15,3%** |
| VT007 Dầu nhớt 07 | 502 | 175.700.000 | 350.000 | 448.000 | **21,9%** |
| VT035 Thân vỏ 35 | 615 | 153.750.000 | 250.000 | 312.000 | **19,9%** |

Hàng Discontinued nằm rải đều cả 4 kho — chưa gom về một điểm để thanh lý.
`VT021` xấu nhất: tồn lớn nhất, biên mỏng nhất.

### 5.5. Tồn kho theo KHO và NHÓM HÀNG

| Kho | Vùng | OnHandQty | InventoryValue |
|---|---|---|---|
| WH_HN | Miền Bắc | 2.754 | 1.723.270.000 |
| WH_DN | Miền Trung | 2.410 | 1.629.770.000 |
| WH_HCM | Miền Nam | 2.524 | 1.535.270.000 |
| WH_DA | Miền Bắc | 2.487 | 1.503.460.000 |
| **Tổng** | | **10.175** | **6.391.770.000** |

| Nhóm hàng | InventoryValue | % tồn kho |
|---|---|---|
| Dầu nhớt | 1.358.720.000 | 21,3% |
| Phụ tùng thân vỏ | 1.340.800.000 | 21,0% |
| Ắc quy | 1.207.820.000 | 18,9% |
| Hóa chất | 1.047.240.000 | 16,4% |
| Lốp | 971.400.000 | 15,2% |
| **Phụ tùng nhanh** | **465.790.000** | **7,3%** |

**Ma trận Kho × Nhóm hàng (VNĐ)**

| Nhóm hàng | WH_HN | WH_DA | WH_DN | WH_HCM |
|---|---|---|---|---|
| Dầu nhớt | 305.460.000 | 293.730.000 | **457.870.000** | 301.660.000 |
| Phụ tùng thân vỏ | 391.850.000 | 248.200.000 | **400.190.000** | 300.560.000 |
| Ắc quy | 288.220.000 | 262.420.000 | 155.050.000 | **502.130.000** |
| Hóa chất | 307.620.000 | 316.800.000 | 262.860.000 | 159.960.000 |
| Lốp | 294.160.000 | 259.860.000 | 285.630.000 | 131.750.000 |
| Phụ tùng nhanh | 135.960.000 | 122.450.000 | 68.170.000 | 139.210.000 |

- **Phụ tùng nhanh** chỉ 7,3% tồn kho — mà Dashboard 1 cho Index thấp nhất (67,0)
  dù GM% tốt. Giả thuyết: **bán kém vì không có hàng để bán.** Câu hỏi đáng đào nhất.
- **WH_HCM** giữ 502,1 tr Ắc quy — gấp 3,2× WH_DN. Phân bổ lệch rõ rệt.

### 5.6. Bổ sung

| # | Phát hiện |
|---|---|
| I1 | **Tỷ lệ tồn/doanh thu theo vùng:** MB 1,21 · MN 1,04 · **MT 1,53** ⇒ WH_DN chôn vốn nhiều nhất |
| I2 | **Stockout risk:** 40/144 dòng (27,8%) dưới safety stock, thuộc 24 item |
| I3 | Tốc độ bán TB của item dưới safety = 136,2 vs toàn bộ 148,2 — **không mang tính hệ thống.** Nhưng `VT026 Ắc quy 26` bán 316 đv/6T, MOC chỉ **2,3 tháng** mà vẫn dưới safety ⇒ nguy cơ đứt hàng thật |
| I4 | **Aging:** `LastReceiptDate` là Excel serial (2025-06-08 → 2026-06-25). Convert trước |

### 5.7. Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  [Slicer: Kho] [Slicer: Nhóm hàng] [Slicer: ABC] [Slicer: Status]  │
│  📌 Ảnh chụp tồn kho: 30/06/2026 (kỳ mới nhất)                     │
├──────────────┬──────────────┬──────────────┬──────────┬────────────┤
│ Tổng giá trị │ Vốn mắc kẹt  │ Discontinued │  Tồn âm  │ Dưới safety│
│  6.391,8 tr  │ 2.402,8 tr   │   580,1 tr   │  4 dòng  │ 40/144 dòng│
│              │   (37,6%)    │    (9,1%)    │    ⚠️    │  (27,8%)   │
├──────────────┴──────────────┴──────────────┴──────────┴────────────┤
│  (YC-2) Scatter GÓC PHẦN TƯ — trái tim của trang                   │
│    X = MOC (đường mốc 12)  ·  Y = Giá trị tồn (mốc 127,6 tr)       │
│    bubble size = OnHandQty · màu = ABC_Class                       │
│    → góc trên-phải = "Slow & Heavy" (9 item), gắn nhãn item        │
├──────────────────────────────────┬─────────────────────────────────┤
│  (YC-5a) Bar: tồn theo KHO       │  (YC-5b) Bar: tồn theo NHÓM HÀNG│
│         + nhãn tỷ lệ tồn/DT      │         + nhãn % tồn kho        │
├──────────────────────────────────┴─────────────────────────────────┤
│  (YC-5c) Heatmap Kho × Nhóm hàng                                   │
├──────────────────────────────────┬─────────────────────────────────┤
│  (YC-3) Bảng TỒN ÂM (4 dòng)     │  (YC-4) Bảng DISCONTINUED (3)   │
└──────────────────────────────────┴─────────────────────────────────┘
```

**Chú thích bắt buộc** *(nguyên văn)*:
- Region ở trang này = vùng **KHO** (Dashboard 1 dùng vùng **KHÁCH HÀNG**).
- Đã loại dòng orphan VT999 (WH_HN, 50 đv, 5.000.000 VNĐ).
- Slow & Heavy = Giá trị tồn > trung vị (127.610.000) **VÀ** MOC > 12 tháng. Xếp hạng chỉ theo MOC sẽ cho cảnh báo sai (VT033: MOC 65,7 nhưng chỉ 72,8 tr vốn).
- Tồn âm **KHÔNG** được set = 0 — là dấu hiệu lỗi quy trình, cần điều tra.

---

## 6. DASHBOARD 3 — DATA QUALITY / RECONCILIATION

> *Liệt kê tối thiểu 5 vấn đề dữ liệu; nêu cách xử lý hoặc rule kiểm tra sau này.*

### 6.0. Mục tiêu

| Dashboard | Ai đọc | Câu hỏi họ mang theo |
|---|---|---|
| 1 — Executive Sales | Ban lãnh đạo | *"Tháng này bán thế nào?"* |
| 2 — Inventory | Quản lý kho / mua hàng | *"Hàng nào đang chôn vốn?"* |
| **3 — Data Quality** | **Data owner / IT / kế toán trưởng** | ***"Có tin được hai trang kia không?"*** |

> **Chứng minh số liệu ở Dashboard 1 và 2 đáng tin đến mức nào, định lượng phần
> không đáng tin bằng tiền, và chỉ ra ai phải sửa cái gì.**

Đây không phải trang khoe lỗi. Nó là **giấy chứng nhận chất lượng** cho hai trang còn lại.

### 6.1. Mười một câu hỏi

**Tầng 1 — PHÁT HIỆN:** Q1 bao nhiêu vấn đề · Q2 bao nhiêu dòng · Q3 hint bỏ sót cái nào
**Tầng 2 — ĐỊNH LƯỢNG:** Q4 không làm sạch sai bao nhiêu · **Q5 làm sạch SAI sai bao nhiêu**
· Q6 vấn đề nào ảnh hưởng tiền · Q7 tồn kho reconcile được không
**Tầng 3 — HÀNH ĐỘNG:** Q8 lỗi tầng nào · Q9 tập trung ở đâu · Q10 rule cứng/mềm · Q11 chỉ số kỳ vọng

> *Q5 quan trọng hơn Q4: sai do lười là **+2,82%**; sai do làm sạch ẩu là **−5,63%** —
> và không ai phát hiện, vì con số trông "sạch hơn".*

### 6.2. Ba tầng lỗi — ba chỉ số — ba người sửa

| Tầng | Câu hỏi | Ví dụ | **Chỉ số** | Ai sửa |
|---|---|---|---|---|
| **Dữ liệu** | *Có ghi đúng cái đã xảy ra không?* | `UnitPrice = 0`, dòng trùng, orphan | **DQ Score = 97,79%** | Người nhập liệu / ETL |
| **Quy trình** | *Cái đã xảy ra có được phép không?* | Bán hàng Discontinued, khách Inactive | **PV Score = 13,94%** | Quản lý bán hàng |
| **Thiết kế** | *Hệ thống có đúng không?* | Không có khóa · date sai kiểu · plan khác phạm vi | **Không đo bằng %** | IT / kiến trúc dữ liệu |

> **Điểm mấu chốt của tầng Quy trình:** dòng dữ liệu đó **hoàn toàn chính xác**.
> Nó ghi đúng rằng ngày X, nhân viên Y đã bán hàng đã ngừng kinh doanh cho khách đã đóng.
> Không ký tự nào sai. Cái sai là **hành vi**, không phải **bản ghi**.
> Trộn 63 dòng này vào DQ Score là đổ lỗi cho đội nhập liệu và tha cho đội bán hàng.

### 6.3. BẢNG AUDIT — 11 vấn đề

`hint?` = sheet `data_quality_hint` có nhắc tới không. **5/11 do phân tích tự tìm ra.**

| # | hint? | Vấn đề | Bảng | Dòng | Ảnh hưởng tiền | Rule |
|---|---|---|---|---|---|---|
| 1 | ❌ | **Không có khóa tự nhiên** | SO | toàn bộ | **−293,1 tr nếu dedupe sai** | 🔴 H1 |
| 2 | ✅ | **Dòng trùng thật** — `SO2602-0137\|1`, giống cả 14 cột | SO | 2 | −11.956.000 | 🔴 H2 |
| 3 | ✅ | **Orphan FK** — `KH999` (3), `VT999` (2 SO + 1 INV) | SO, INV | 5+1 | 74,5 tr ngoài grain plan | 🔴 H3 |
| 4 | ✅ | `UnitPrice = 0` — `SO2606-0087`, NV An | SO | 1 | Biên âm | 🔴 H4 |
| 5 | ✅ | `DiscountPct = 65%` — `SO2601-0088`, NV Bình *(P95=P99=10%)* | SO | 1 | 917.700 | 🟡 S1 |
| 6 | ✅ | **`QtyOrder = 900` — BẤT KHẢ THI VẬT LÝ** (xem §6.3b) | SO | 1 | −135.000.000 | 🔴 H7 + **H9** |
| 7 | ✅ | **Tồn âm** — 14 dòng, 4 còn âm tại 30/06. `VT018` âm ở 2 kho | INV | 14 | — | 🔴 H5 |
| 8 | ✅ | **`LastReceiptDate` là Excel serial** | INV | 865 | Aging sai | 🔴 H6 |
| 9 | ❌ | `fact.Salesperson` ≠ `dim_customer.Salesperson` ở 76% dòng | SO | 344 | Báo cáo NV sai | 📘 D1 |
| 10 | ❌ | **Plan và fact không cùng phạm vi** — lệch 16,48× | PLAN | 108 ô | KPI không đọc được | 📘 D2 |
| 11 | ❌ | `InventoryValue` là cột dẫn xuất (khớp 864/865) | INV | 865 | Cột thừa | 📘 D3 |

**Chồng lấn:** 5 cờ của `fact_sales` (DupRow 2, OrphanFK 5, ZeroPrice 1, HighDiscount 1,
Sentinel 1) **không chồng lấn nhau** — cộng dồn = 10 = số dòng bẩn thực tế.
Với `fact_inventory`: 14 + 1 = 15.

*(Vấn đề #12 — 63 dòng bán cho master inactive — thuộc tầng Quy trình, không nằm ở bảng này.)*

#### 6.3b. Vì sao `QtyOrder = 900` là bản ghi bất khả thi

`SO2605-9999` · 17/05/2026 · `VT005` · kho `WH_HCM` · **Qty = 900** · Completed · NV An.

Đối chiếu chéo với `fact_inventory_EOM` cho `VT005`:

| Tháng | WH_DA | WH_DN | **WH_HCM** | WH_HN | Tổng |
|---|---|---|---|---|---|
| 2026-01 | 72 | 74 | 93 | 52 | 291 |
| 2026-02 | 110 | 42 | 34 | 47 | 233 |
| 2026-03 | 86 | 69 | 20 | 49 | 224 |
| 2026-04 | 229 | 244 | 271 | 189 | 933 |
| **2026-05** | 232 | 180 | **300** | 249 | **961** |
| 2026-06 | 157 | 228 | 240 | 256 | 881 |

**Kho `WH_HCM` chưa bao giờ giữ quá 300 đơn vị `VT005`.** Không thể giao 900.

| Bằng chứng độc lập | Chi tiết |
|---|---|
| Tồn kho không giảm | Cuối T5 `WH_HCM` vẫn còn 300 — không dấu vết xuất 900 đv |
| Mã đơn sentinel | `SO2605-`**`9999`** — mã duy nhất có hậu tố 9999/0000 |
| Vị trí trong file | Index 451 — **dòng cuối cùng**, ngay sau dòng trùng (450) |
| Bất hợp lý thương mại | Đơn lớn nhất bộ dữ liệu nhưng `DiscountPct = 0` |

Gấp **26×** trung vị, **25,7×** `P99 = 35`, chiếm **80% sản lượng `VT005`** 6 tháng.

> Đây **không phải outlier**. Outlier là giá trị hiếm nhưng *có thể* xảy ra;
> dòng này *không thể* xảy ra. ⇒ **Loại bỏ, có căn cứ vật lý.**
>
> Rule sinh ra từ đây là rule mạnh nhất trong checklist — nó đối chiếu **hai bảng fact**:
> ```
> 🔴 H9: QtyDelivered ≤ OnHandQty của (ItemCode, WarehouseCode) tại thời điểm giao
> ```

### 6.4. RECONCILIATION #2 — Tồn kho

```
Kiểm tra: InventoryValue == OnHandQty × dim_product.StandardCost
```

**864 / 865 = 99,88% khớp.** Dòng lệch duy nhất: `VT999 · WH_HN · 50 đv · 5.000.000` —
không có trong `dim_product` nên không có `StandardCost`.

> Một phép đối chiếu số học nội bộ bắt được lỗi **tham chiếu ngoại**.
> *(⚠️ Nó **cần** join `dim_product` — xem `ERRATA.md` E1.)*

### 6.5. BA CHỈ SỐ — và chỉ số nào chấm được ai

**(a) DQ Score — cắt theo THÁNG và KHO**, không cắt theo nhân viên.

`fact_sales`: 10/452 = **97,79%** · `fact_inventory`: 15/865 = **98,27%**

⚠️ Với 10 dòng bẩn trải trên 6 tháng và 4 kho, **chênh lệch giữa các nhóm là nhiễu,
không phải tín hiệu.** Trình bày như bảng theo dõi, **không** kết luận "tháng 4 tệ nhất".

**(b) Process Violation Score — chấm theo NHÂN VIÊN**

Tổng **63/452 = 13,94%** *(Khách Inactive 23 · Item Discontinued 41 · Kho WH_OLD 1;
cộng dồn 65, union 63 do 2 dòng dính 2 loại)*

| Nhân viên | Dòng bán | Vi phạm | **%** |
|---|---|---|---|
| **NV Dũng** | 109 | 21 | **19,3%** |
| NV Bình | 114 | 17 | 14,9% |
| NV An | 115 | 14 | 12,2% |
| **NV Chi** | 114 | 11 | **9,6%** |

> ⚠️ **χ² = 4,716; p = 0,194.** Chênh lệch gấp 2 lần giữa NV Dũng và NV Chi
> **KHÔNG có ý nghĩa thống kê** ở mức 5%.
>
> **Phải ghi con số p này lên dashboard.** Xếp hạng nhân viên bằng một chênh lệch
> không có ý nghĩa thống kê là cách nhanh nhất để mất niềm tin của người bị chấm.

**(c) Vì sao KHÔNG chấm DQ Score theo nhân viên**

Chỉ **3 dòng** là lỗi nhân viên thực sự gây ra: `UnitPrice=0` (NV An) · `Discount 65%`
(NV Bình) · `Qty=900` (NV An). Chấm 4 người trên 3 dòng ⇒ NV Chi và NV Dũng đạt 100%
không phải vì cẩn thận hơn, mà vì 3 lỗi tình cờ không rơi vào họ.
**Với n = 3, mọi khác biệt đều là nhiễu.**

### 6.6. CHECKLIST RULE

**🔴 Hard block**

| # | Rule | Bắt vấn đề |
|---|---|---|
| H1 | Fact table phải có **surrogate primary key** do hệ thống sinh | 1 |
| H2 | Chặn insert bản ghi **giống hệt** bản ghi đã tồn tại | 2 |
| H3 | `CustomerCode`/`ItemCode`/`WarehouseCode` phải tồn tại trong dim | 3 |
| H4 | `UnitPrice > 0` | 4 |
| H5 | `OnHandQty ≥ 0` tại thời điểm chốt sổ | 7 |
| H6 | Ép kiểu `date` cho mọi cột ngày tại tầng ETL | 8 |
| H7 | Chặn mã đơn có hậu tố sentinel (`9999`, `0000`) | 6 |
| H8 | Không cho chọn master có `Status ≠ Active` khi tạo đơn | 12 |
| **H9** | **`QtyDelivered ≤ OnHandQty(Item, Warehouse)`** — đối chiếu chéo 2 bảng fact | 6 |

**🟡 Soft warning** — cảnh báo, cho phép ghi đè có duyệt

| # | Rule | Ngưỡng |
|---|---|---|
| S1 | Chiết khấu bất thường | `DiscountPct > 20%` *(P95 = P99 = 10%)* |
| S2 | Số lượng bất thường | `QtyOrder > 3 × P99` theo item |
| S3 | Bán dưới giá vốn | `UnitPrice × (1−Disc) < StandardCost` |
| S4 | Giao trễ | `ActualDeliveryDate > DeliveryDueDate` |

**📘 Ghi vào tài liệu:** D1 phân biệt hai `Salesperson` · D2 reconcile scope plan ·
D3 không lưu `InventoryValue`

**Q11 — Chỉ số kỳ vọng sau khi áp rule:**

| Chỉ số | Hiện tại | Sau H1–H9 |
|---|---|---|
| DQ Score (SO) | 97,79% | **100%** |
| DQ Score (INV) | 98,27% | **100%** |
| PV Score | 13,94% | **0%** (H8) |
| Reconciliation tồn kho | 99,88% | **100%** (H3) |

*(⚠️ 8/10 dòng bị chặn cứng; index 20 là bản gốc hợp lệ, index 249 là soft warning.
Xem `ERRATA.md` E5.)*

### 6.7. Nguyên tắc xuyên suốt

> **Gắn cờ (flag), không xóa (delete).**
> Xóa dòng fact làm sai tổng doanh thu và **mất bằng chứng để quy trách nhiệm**.

**Ngoại lệ duy nhất:** dòng trùng hoàn toàn (index 450) — xóa 1 bản.
**Không áp dụng cho:** 48 dòng cùng `OrderNo+LineNo` khác nội dung. Chúng **không phải lỗi**.

### 6.8. Những gì Dashboard 3 KHÔNG trả lời được

Đưa phần này lên dashboard. Nó cho thấy bạn hiểu giới hạn của dữ liệu.

| Câu hỏi | Vì sao |
|---|---|
| **Vì sao `VT018` tồn âm?** | Snapshot cuối tháng, không có bảng phát sinh nhập/xuất. Phát hiện *"có âm"*, không truy được *"âm vì giao dịch nào"* |
| **Ai nhập sai `UnitPrice = 0`?** | Không có `CreatedBy`/`ModifiedAt`. `Salesperson` là người bán, không chắc là người nhập |
| **Vì sao `OrderNo` bị trùng?** | Không có log hệ thống. Chỉ kết luận được *"không phải khóa"* |
| **Vì sao `QtyOrder = 900`?** | Chứng minh được *"dòng này sai"*, nhưng không biết *vì sao*: gõ nhầm? bản ghi test? |
| **Plan lập theo cơ sở nào?** | Không có metadata. Chỉ chứng minh được nó **không cùng phạm vi** với fact |

### 6.9. Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  MỤC TIÊU (text box, 1 câu)                                      │
├─────────────┬─────────────┬─────────────┬────────────────────────┤
│  DQ Score   │  PV Score   │ Sai lệch    │  Sai lệch nếu          │
│  SO 97,79%  │   13,94%    │ nếu KHÔNG   │  DEDUPE SAI            │
│  INV 98,27% │             │ làm sạch    │  −5,63% (−293,1 tr)    │
│             │             │  +2,82%     │        ⚠️              │
├─────────────┴─────────────┴─────────────┴────────────────────────┤
│  Q4+Q5: WATERFALL doanh thu                                      │
├──────────────────────────────────┬───────────────────────────────┤
│  Q6+Q8: MA TRẬN 3 TẦNG LỖI       │  Q7: RECONCILIATION tồn kho   │
│  Dữ liệu · Quy trình · Thiết kế  │  864/865 khớp · lệch = VT999  │
├──────────────────────────────────┴───────────────────────────────┤
│  Q1+Q2+Q3: BẢNG AUDIT — 11 vấn đề (cột "hint?" đánh dấu 5 tự tìm)│
├──────────────────────────────────┬───────────────────────────────┤
│  Q9: DQ Score theo tháng/kho     │  Q9: PV Score theo NHÂN VIÊN  │
│  ⚠️ ghi rõ: chênh lệch là nhiễu  │  ⚠️ ghi rõ: χ²=4,716; p=0,194 │
├──────────────────────────────────┴───────────────────────────────┤
│  Q10+Q11: CHECKLIST — 9 Hard · 4 Soft · 3 Ghi chú                │
├──────────────────────────────────────────────────────────────────┤
│  §6.8: Những gì trang này KHÔNG trả lời được                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. QUYẾT ĐỊNH TRIỂN KHAI

| # | Câu hỏi | Trạng thái |
|---|---|---|
| 1 | Kênh "Nội bộ" có tính vào Revenue? | ✅ **CÓ.** `Channel` là dimension, dùng làm slicer |
| 2 | `Region` = vùng khách hay vùng kho? | ✅ **DB1 = khách · DB2 = kho** |
| 3 | `Salesperson` lấy từ đâu? | ✅ **`fact_sales_orders`** |
| 4 | KPI "% đạt kế hoạch"? | ✅ **Achievement Index**, % thô vào tooltip |
| 5 | `QtyOrder = 900` giữ hay loại? | ✅ **Loại, có căn cứ vật lý** |
| 6 | 63 dòng master inactive tính vào DQ Score? | ✅ **Không.** Tách thành **PV Score** |
| 7 | 48 dòng cùng `OrderNo+LineNo` là dòng bẩn? | ✅ **Không.** `OrderNo` chưa từng là khóa |
| 8 | Output cuối cùng | ✅ **Power BI PBIP (TMDL + PBIR)**, Import mode, nguồn Supabase |
