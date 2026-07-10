# Phân tích Dataset & Đặc tả 3 Dashboard

**Nguồn dữ liệu:** `Data_set.xlsx` — 7 sheet, kỳ 01/2026 – 06/2026
**Ngày phân tích:** 09/07/2026
**Trạng thái số liệu:** tất cả con số dưới đây đã được tính lại trực tiếp từ file, không ước lượng.

---

## 0. TÓM TẮT ĐIỀU HÀNH (Executive Summary)

Bộ dữ liệu là một **star schema** hoàn chỉnh: 2 bảng fact (bán hàng, tồn kho cuối tháng), 3 bảng dim, 1 bảng plan, 1 sheet gợi ý kiểm tra chất lượng dữ liệu.

Đây là dữ liệu **tổng hợp (synthetic)** phục vụ case study — sheet `data_quality_hint` liệt kê sẵn 6 rule, và cột `Note` trong `fact_sales_orders` ghi rõ tên lỗi bằng tiếng Việt. Lỗi được cài cắm có chủ đích.

**Bốn phát hiện quan trọng nhất — theo thứ tự mức độ ảnh hưởng:**

| # | Phát hiện | Ảnh hưởng |
|---|---|---|
| 1 | **`fact_sales_orders` KHÔNG có khóa tự nhiên.** `OrderNo` không phải mã đơn hàng: trong 84 `OrderNo` có ≥2 dòng, **97,6% chứa nhiều hơn 1 khách hàng**. Sheet `data_quality_hint` gọi `OrderNo+LineNo` là "khóa" — dữ liệu bác bỏ chính gợi ý đó. Chỉ có **1 cặp trùng thật**. | Dedupe theo `OrderNo+LineNo` → **mất oan 293.054.650 VNĐ (−5,63%)** doanh thu hợp lệ |
| 2 | **`fact_sales_orders` là mẫu ~6% của sổ đơn hàng, không cùng phạm vi với plan.** Plan 6 tháng = 84,60 tỷ; Actual khớp grain = 5,13 tỷ ⇒ lệch **16,48 lần**. Không phải lỗi đơn vị: giá trị/dòng đơn hoàn toàn bình thường, chỉ thiếu số lượng giao dịch (75 vs ~1.086 dòng/tháng) | KPI "% đạt kế hoạch" tuyệt đối không dùng được ⇒ thay bằng Achievement Index |
| 3 | **`Region` mơ hồ** — 65,7% số dòng có vùng khách ≠ vùng kho. **Đã chốt rule:** `plan.Region` ≡ `dim_customer.Region`; Dashboard 1 dùng vùng khách, Dashboard 2 dùng vùng kho | Chọn sai ⇒ doanh thu Miền Trung lệch 36% |
| 4 | **`LastReceiptDate` là Excel serial number, không phải date** (45.816 → 46.198) | Mọi phân tích aging tồn kho sẽ sai nếu không convert |

---

## 1. CẤU TRÚC DỮ LIỆU

### 1.1. Sơ đồ quan hệ

```
                    plan_monthly_sales
                 (Month × Region × Category)
                            ▲
                            │ many-to-many
                            │ (khác grain!)
                            │
  dim_customer ──┐          │
  (40 dòng)      │          │
                 ├──► fact_sales_orders ◄──┬── dim_product
  dim_warehouse ─┤     (452 dòng)          │   (36 dòng)
  (5 dòng)       │                         │
                 └──► fact_inventory_EOM ◄─┘
                       (865 dòng)
```

### 1.2. Bảng tổng hợp

| Sheet | Loại | Dòng | Khóa tự nhiên | Grain |
|---|---|---|---|---|
| `fact_sales_orders` | Fact (transaction) | 452 | OrderNo + LineNo ⚠️ | 1 dòng = 1 line item |
| `fact_inventory_EOM` | Fact (periodic snapshot) | 865 | MonthEnd + ItemCode + WarehouseCode ✅ | Tồn cuối tháng × item × kho |
| `dim_product` | Dimension | 36 | ItemCode | |
| `dim_customer` | Dimension | 40 | CustomerCode | |
| `dim_warehouse` | Dimension | 5 | WarehouseCode | |
| `plan_monthly_sales` | Plan/Budget | 108 | MonthStart + Region + CategoryCode | 6 tháng × 3 vùng × 6 nhóm |
| `data_quality_hint` | Metadata | 6 | RuleCode | |

⚠️ `OrderNo + LineNo` **không phải khóa** — và `fact_sales_orders` **không có khóa tự nhiên nào** (xem §3.1). Phải sinh **surrogate key** ở tầng ETL. `fact_inventory_EOM` thì có khóa tự nhiên unique 100%.

**Kiểm tra tính đầy đủ (completeness):**
- `fact_inventory_EOM` = 6 tháng × 36 item × 4 kho = 864 dòng + 1 dòng orphan `VT999` = 865 ✅
- `plan_monthly_sales` = 6 tháng × 3 vùng × 6 nhóm = 108 ✅
- Không có item nào bán ra mà thiếu dòng tồn kho, và ngược lại.
- Cả 40 khách hàng trong dim đều có phát sinh giao dịch.

### 1.3. Bảng chú giải cột (data dictionary) — các cột dễ hiểu nhầm

| Cột | Bảng | Lưu ý |
|---|---|---|
| `QtyOrder`, `QtyDelivered` | fact_sales_orders | **Âm với DocStatus = Return** (22 dòng). Đây là quy ước, không phải lỗi. |
| `Salesperson` | fact_sales_orders | Nhân viên bán **đơn hàng đó** |
| `Salesperson` | dim_customer | Nhân viên **phụ trách tài khoản**. Lệch nhau ở 344/452 dòng (76%) |
| `UnitPrice` | fact_sales_orders | Bằng `ListPrice` ở **99,3%** dòng ⇒ giá không đàm phán, đòn bẩy duy nhất là `DiscountPct` |
| `InventoryValue` | fact_inventory_EOM | Cột **dẫn xuất** = `OnHandQty × StandardCost` (đúng 864/865 dòng). Không mang thêm thông tin |
| `SafetyStock` | fact_inventory_EOM | Thuộc tính của cặp (Item, Warehouse), nằm nhầm chỗ trong bảng fact |
| `LastReceiptDate` | fact_inventory_EOM | **Kiểu số nguyên (Excel serial), number_format = General.** Phải convert |

---

## 2. ĐỊNH NGHĨA METRIC — VÀ NHỮNG GÌ ĐỀ BÀI KHÔNG NÓI RÕ

Đề bài đưa 4 công thức. Cả 4 đều có **điểm mơ hồ về mẫu số / phạm vi lọc**. Dưới đây là công thức đề bài, chỗ mơ hồ, và khuyến nghị.

### 2.1. Revenue Net

> **Đề bài:** `Revenue Net = QtyDelivered × UnitPrice × (1 − DiscountPct)`, loại trừ Cancelled

**Phát hiện:** Toàn bộ 49 dòng `Cancelled` đều có `QtyDelivered = 0`. Nghĩa là **việc "loại trừ Cancelled" KHÔNG làm thay đổi Revenue một đồng nào** — công thức đã tự động cho ra 0.

Câu lọc `DocStatus <> 'Cancelled'` chỉ thực sự có tác dụng ở **Fill Rate** (xem §2.3), nơi mẫu số `QtyOrder` khác 0.

Phạm vi thực tế của Revenue Net = `Completed` + `Open` + `Return`.
- `Open` (71 dòng, 65 dòng đã giao một phần) → **được tính doanh thu** theo đề bài. Đây là lựa chọn "cash-basis theo lượng đã giao", hợp lý.
- `Return` (22 dòng) → Qty âm ⇒ tự động trừ ra. Giá trị trả lại: **−107.785.450 VNĐ = 2,24% gross revenue**.

**Công thức triển khai:**
```
Revenue Net = SUMX(
    FILTER(fact_sales_orders, [DocStatus] <> "Cancelled"),
    [QtyDelivered] * [UnitPrice] * (1 - [DiscountPct])
)
```

### 2.2. Gross Margin

> **Đề bài:** `Gross Margin = Revenue Net − QtyDelivered × StandardCost`

**Điểm cần xử lý:** `VT999` là orphan, không có `StandardCost` ⇒ COGS = NULL ⇒ Gross Margin của 2 dòng đó bị thổi phồng bằng đúng doanh thu (36.830.500 VNĐ). Phải xử lý null trước.

**Nên bổ sung `Gross Margin %`** — vì con số tuyệt đối không so sánh được giữa các nhóm hàng:
```
Gross Margin % = Gross Margin / Revenue Net
```

### 2.3. Fill Rate

> **Đề bài:** `Fill Rate = QtyDelivered / QtyOrder`, với đơn dương

"Đơn dương" (`QtyOrder > 0`) tự động loại 22 dòng `Return` — đúng, vì Qty âm sẽ làm méo tỷ lệ. **Nhưng đề bài không nói có loại `Cancelled` không.** Kết quả chênh 7,3 điểm phần trăm:

| Phạm vi | Fill Rate | Bình luận |
|---|---|---|
| Đơn dương, **giữ** Cancelled | 81,38% | Phạt doanh nghiệp vì đơn khách tự hủy → không công bằng |
| Đơn dương, **loại** Cancelled | **87,21%** ✅ | Chỉ đo nghĩa vụ giao hàng thực sự |
| Chỉ Completed | 96,82% | **Tự tô hồng** — bỏ qua toàn bộ đơn đang dở |
| Chỉ Open | 48,51% | |

**Khuyến nghị:** loại `Cancelled` và `Return`, giữ `Completed` + `Open`. Ghi rõ giả định trên dashboard.

```
Fill Rate = DIVIDE(
    CALCULATE(SUM([QtyDelivered]), [DocStatus] IN {"Completed","Open"}),
    CALCULATE(SUM([QtyOrder]),     [DocStatus] IN {"Completed","Open"})
)
```

### 2.4. On-time Delivery (OTD)

> **Đề bài:** `OTD = ActualDeliveryDate <= DeliveryDueDate`

**Vấn đề mẫu số:** 120 dòng có `ActualDeliveryDate` NULL — phân bố chính xác là 71 Open + 49 Cancelled. Đây là **null hợp lệ**, không phải thiếu dữ liệu.

| Định nghĩa mẫu số | OTD |
|---|---|
| Chỉ dòng đã có ngày giao thực tế (n = 330) | **37,27%** ✅ |
| Tất cả trừ Cancelled, coi NULL = trễ (n = 403) | 30,52% |

**Khuyến nghị:** dùng mẫu số = dòng đã giao xong. Đơn `Open` chưa đến hạn thì chưa thể gọi là trễ.

Bổ sung 2 chỉ số phụ, vì chỉ một tỷ lệ % không đủ để hành động:
- `Avg Days Late` = **2,0 ngày** (median 1, max 7)
- `% Severely Late (> 3 ngày)`

**⚠️ Insight cốt lõi:** Fill Rate 87,21% nhưng OTD chỉ 37,27%. Nghĩa là **"giao đủ hàng nhưng giao muộn"**. Đề bài chỉ yêu cầu Fill Rate — nếu bạn chỉ hiện Fill Rate, bức tranh vận hành bị che mất hoàn toàn.

### 2.5. % Đạt kế hoạch — và Achievement Index

> **Rule đã chốt:** `plan_monthly_sales.Region` ≡ `dim_customer.Region`. Plan là kế hoạch theo **thị trường (vùng khách hàng)**, không phải theo vùng kho.

| | Giá trị 6 tháng |
|---|---|
| `plan_monthly_sales` tổng | 84.602.000.000 VNĐ |
| Revenue Net (khớp grain Month × Region × Category, 397 dòng) | 5.134.128.150 VNĐ |
| **% đạt kế hoạch** | **6,07%** |
| **Plan gấp Actual** | **16,48 lần** |

Chênh lệch so với Revenue Net tổng (5.208.670.650) là **74.542.500 VNĐ**, gồm 2 dòng `KH999` (không có Region: 37.712.000) và 2 dòng `VT999` (không có Category: 36.830.500).

#### 2.5.1. Chẩn đoán: vì sao lệch 16,48 lần

| Giả thuyết | Kiểm chứng | Kết luận |
|---|---|---|
| **GT1 — Lỗi đơn vị** (nghìn đồng vs đồng) | Tỷ số = **16,48**, không phải 10 / 100 / 1.000, cũng không phải 12 (tháng↔năm) | ❌ Loại |
| **GT2 — Plan bị nhân một hệ số cố định** | Nếu đúng, tỷ lệ đạt phải không đổi ở mọi ô. Thực tế CV (hệ số biến thiên) trên 108 ô = **1,077** | ❌ Loại |
| **GT3 — `fact_sales_orders` chỉ là mẫu (sample)** | Xem §2.5.2 | ✅ **Đây là câu trả lời** |

Độ dao động của tỷ lệ đạt (bằng chứng loại GT2):

| Cắt theo | Thấp nhất | Cao nhất |
|---|---|---|
| Tháng | 3,69% (T2/2026) | **11,52% (T5/2026)** |
| Vùng khách hàng | 4,77% (Miền Trung) | 7,58% (Miền Bắc) |
| Nhóm hàng | 4,07% (Phụ tùng nhanh) | 7,36% (Ắc quy) |

#### 2.5.2. Bằng chứng: thiếu ở SỐ ĐƠN, không phải ở GIÁ TRỊ ĐƠN

| Chỉ số | Giá trị | Đánh giá |
|---|---|---|
| Số dòng đơn hàng thực tế | **75 dòng/tháng** | |
| Giá trị trung bình 1 dòng | 12.989.204 VNĐ | **Hoàn toàn bình thường** |
| Gross Margin % | 17,18% | Đúng chuẩn ngành phụ tùng |
| Số dòng/tháng cần có để đạt plan | **~1.086 dòng** | |
| **Tỷ lệ** | **≈ 14,5 lần** | Khớp với hệ số lệch 16,48× |

Kinh tế học ở cấp độ dòng đơn hàng hoàn toàn hợp lý — giá đúng, chiết khấu đúng, biên lợi nhuận đúng. Cái thiếu chỉ là **số lượng giao dịch**.

Dấu hiệu củng cố — trong 108 ô (Month × Region × Category):

| Loại ô | Số ô | Chi tiết |
|---|---|---|
| Không có giao dịch nào | **3** | (T2·M.Bắc·Dầu nhớt), (T2·M.Trung·Thân vỏ), (T6·M.Trung·Hóa chất) |
| Có giao dịch nhưng doanh thu = 0 | 1 | (T3·M.Nam·Hóa chất) — chứa dòng `UnitPrice = 0` |
| **Doanh thu ÂM** | **1** | (T6·M.Trung·Dầu nhớt): **−505.600** — hàng trả lại lớn hơn hàng bán |

> **Kết luận:** `fact_sales_orders` là **mẫu khoảng 6%** của sổ đơn hàng đầy đủ, trong khi `plan_monthly_sales` được lấy nguyên ở quy mô 100%. Hai bảng không cùng phạm vi.

#### 2.5.3. Achievement Index — định nghĩa và giá trị

Vì `% đạt kế hoạch = 6,07%` không đọc được trên dashboard điều hành, KPI thứ 4 hiển thị **Achievement Index** — chuẩn hóa tỷ lệ đạt về trung bình = 100:

```
Achievement Index(nhóm) = [ Actual(nhóm) / Target(nhóm) ]
                          ÷ [ Actual(tổng) / Target(tổng) ]
                          × 100
```

Với `Actual(tổng) / Target(tổng) = 6,07%`. Index = 100 nghĩa là "đạt đúng mặt bằng chung"; > 100 là vượt; < 100 là kém.

**Theo vùng khách hàng**

| Region | Actual | Target | % đạt | **Index** |
|---|---|---|---|---|
| Miền Bắc | 1.947.827.200 | 25.689.000.000 | 7,58% | **124,9** |
| Miền Nam | 1.792.218.470 | 29.684.000.000 | 6,04% | 99,5 |
| **Miền Trung** | 1.430.912.980 | 29.229.000.000 | 4,77% | **78,6** |

**Theo nhóm hàng**

| Nhóm hàng | % đạt | **Index** |
|---|---|---|
| Ắc quy | 7,36% | **121,3** |
| Hóa chất | 7,33% | 120,7 |
| Dầu nhớt | 7,25% | 119,5 |
| Phụ tùng thân vỏ | 5,75% | 94,7 |
| Lốp | 4,90% | 80,8 |
| **Phụ tùng nhanh** | 4,07% | **67,0** |

**Theo tháng**

| Tháng | T1 | T2 | T3 | T4 | T5 | T6 |
|---|---|---|---|---|---|---|
| Index | 71,9 | **60,9** | 107,7 | 71,3 | **189,8** | 107,6 |

Đọc được ngay: **Miền Trung chỉ đạt 79% mặt bằng chung; Phụ tùng nhanh là nhóm yếu nhất, chỉ đạt 2/3 mặt bằng.** Tháng 5 vọt lên 189,8 — cần kiểm tra xem là mùa vụ hay do vài đơn lớn.

#### 2.5.4. Giới hạn của Achievement Index — phải ghi rõ khi trình bày

**(a) Index không phải chỉ số chuẩn ngành.** Kỹ thuật chuẩn hóa về 100 là phổ biến trong BI, nhưng công thức và tên gọi ở đây là **do tài liệu này định nghĩa**. Phải kèm định nghĩa khi trình bày.

**(b) Chỉ dùng Index ở cấp TỔNG HỢP, không dùng ở cấp ô.** Toàn bộ 397 dòng chia cho 108 ô = **3,68 dòng/ô**, và **29/105 ô có ≤ 2 đơn hàng**. Ở grain đó, Index dao động từ **−0,7 đến 848,3** — hoàn toàn do một đơn hàng lớn ngẫu nhiên rơi vào ô nào. Index chỉ đáng tin ở cấp Region (≈132 dòng), Category (≈66 dòng) hoặc Month (≈66 dòng).

**(c) Mẫu số của Index có thể âm hoặc bằng 0.** 1 ô có actual âm, 1 ô có actual = 0. Heatmap **không thể dùng thang màu bắt đầu từ 0**.

**(d) Index dùng ở đúng một nơi: Dashboard 1.** Dashboard 2 và 3 không dùng `plan_monthly_sales`.

⚠️ **Tam giác hóa (triangulation):** Miền Trung vừa có Achievement Index thấp nhất (**78,6**), vừa chứa ô doanh thu âm duy nhất (T6, Dầu nhớt: −505.600), vừa có tỷ lệ tồn kho / doanh thu cao nhất ở kho WH_DN — 1,53 (§5.6, I1). Ba chỉ số độc lập cùng chỉ về một hướng ⇒ **Miền Trung là vấn đề thật, không phải nhiễu thống kê.**

**Khuyến nghị triển khai:**
1. Card KPI thứ 4 hiển thị **Achievement Index**; đặt `% đạt kế hoạch = 6,07%` vào tooltip.
2. Ghi rõ trên dashboard: *"Plan và fact không cùng phạm vi (fact là mẫu ~6%). Index = tỷ lệ đạt chuẩn hóa về mặt bằng chung = 100. Chỉ đọc Index ở cấp vùng/nhóm hàng/tháng, không đọc ở từng ô."*

---

## 3. KẾT QUẢ KIỂM TRA CHẤT LƯỢNG DỮ LIỆU

### 3.1. ⚠️ DQ03 — "Duplicate key" là một cái bẫy

Sheet hint nói: *"Trùng OrderNo + LineNo"*. Có **50 dòng** vi phạm, thuộc **24 cụm khóa**.

**Nhưng khi soi vào giá trị:** chỉ **2 dòng (1 cụm)** là trùng hoàn toàn. **23/24 cụm còn lại có `ItemCode` khác nhau** — và khác cả `CustomerCode`, `DocDate`, `WarehouseCode`, `DocStatus`.

#### Xác minh dòng trùng thật — hai phương pháp độc lập, cùng kết quả

| Phương pháp | Cách làm | Kết quả |
|---|---|---|
| **(1) Theo cột `Note`** | Lọc `Note = "Dòng bị trùng khóa OrderNo+LineNo"` | Đúng **1 dòng**: index 450 |
| **(2) Theo so sánh giá trị** *(không dùng `Note`)* | Trong 50 dòng vi phạm khóa, tìm dòng trùng khớp **toàn bộ 14 cột dữ liệu** | Đúng **2 dòng**: index 20 và index 450 |

Cả hai hội tụ về cùng một cặp:

| idx | DocDate | OrderNo | LineNo | KH | Item | Kho | QtyOrder | QtyDelivered | UnitPrice | Disc | Status | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 20 | 2026-02-02 | SO2602-0137 | 1 | KH026 | VT002 | WH_HN | 28 | 28 | 427.000 | 0,0 | Completed | *(trống)* |
| **450** | 2026-02-02 | SO2602-0137 | 1 | KH026 | VT002 | WH_HN | 28 | 28 | 427.000 | 0,0 | Completed | **Dòng bị trùng khóa OrderNo+LineNo** |

➡️ **Kết luận: xóa index 450, giữ index 20.** Doanh thu giảm **11.956.000 VNĐ**.

> **Lưu ý về phương pháp:** cột `Note` là *đáp án được cài sẵn* trong bộ đề, không tồn tại trong dữ liệu vận hành thật. Dùng nó để định vị dòng là hợp lệ, nhưng bài nộp nên trình bày theo **phương pháp (2)** — vì đó là rule tái sử dụng được (`duplicated(subset = tất cả cột nghiệp vụ)`), còn phương pháp (1) thì không.

Ví dụ cụm `SO2601-0102 | LineNo 3`:

| DocDate | CustomerCode | ItemCode | Warehouse | Qty | DocStatus |
|---|---|---|---|---|---|
| 2026-01-16 | KH013 | VT008 | WH_HCM | 6 | Completed |
| 2026-01-06 | KH001 | VT014 | WH_HN | 3 | Completed |
| 2026-01-10 | KH016 | VT004 | WH_HCM | 18 | Cancelled |

Ba giao dịch **khác khách, khác ngày, khác kho, khác hàng** — nhưng cùng số đơn hàng.

#### `OrderNo` có phải mã đơn hàng không? — Kiểm chứng

Nếu `OrderNo` là mã đơn hàng thật, mọi dòng cùng một `OrderNo` phải cùng khách, cùng ngày, cùng kho. Trong **84 `OrderNo` có từ 2 dòng trở lên**:

| Kiểm tra | Kết quả |
|---|---|
| Có **>1 khách hàng** trong cùng `OrderNo` | **97,6%** |
| Có **>1 ngày đặt hàng** | 92,9% |
| Có **>1 kho** | 73,8% |
| **Nhất quán hoàn toàn** (1 khách, 1 ngày) | **1,2%** — đúng 1 đơn |
| `LineNo` chạy đúng 1..n trong mỗi `OrderNo` | **22,3%** *(vd: `SO2601-0003` chỉ có LineNo 3)* |
| Tiền tố `SO26MM` khớp tháng của `DocDate` | 452/452 = **100%** |

**Kết luận: `fact_sales_orders` không có khóa tự nhiên.** `OrderNo`/`LineNo` là nhãn được sinh ra, chỉ mang thông tin tháng. Mỗi dòng là một giao dịch độc lập. Không thể "trùng khóa" khi chưa từng có khóa — nên **48 dòng cùng `OrderNo+LineNo` khác nội dung KHÔNG phải dòng bẩn**.

#### Xác minh dòng trùng thật — hai phương pháp độc lập, cùng kết quả

| Phương pháp | Cách làm | Kết quả |
|---|---|---|
| **(1) Theo cột `Note`** | Lọc `Note = "Dòng bị trùng khóa OrderNo+LineNo"` | Đúng **1 dòng**: index 450 |
| **(2) Theo so sánh giá trị** *(không dùng `Note`)* | Trong 50 dòng vi phạm, tìm dòng trùng khớp **toàn bộ 14 cột** | Đúng **2 dòng**: index 20 và 450 |

| idx | DocDate | OrderNo | LineNo | KH | Item | Kho | Qty | UnitPrice | Status | Note |
|---|---|---|---|---|---|---|---|---|---|---|
| 20 | 2026-02-02 | SO2602-0137 | 1 | KH026 | VT002 | WH_HN | 28 | 427.000 | Completed | *(trống)* |
| **450** | 2026-02-02 | SO2602-0137 | 1 | KH026 | VT002 | WH_HN | 28 | 427.000 | Completed | **Dòng bị trùng khóa…** |

> **Lưu ý phương pháp:** cột `Note` là *đáp án cài sẵn* trong bộ đề, không tồn tại trong dữ liệu thật. Bài nộp nên trình bày theo **phương pháp (2)** — rule tái sử dụng được.

#### Xử lý đúng

| Cách xử lý | Doanh thu bị mất | Đánh giá |
|---|---|---|
| `drop_duplicates(['OrderNo','LineNo'])` | **−305.010.650 VNĐ** | ❌ Sai. Xóa 26 giao dịch thật |
| Chỉ xóa 1 dòng trùng thật (index 450) | **−11.956.000 VNĐ** | ✅ Đúng |

1. **Xóa index 450** — dòng trùng hoàn toàn.
2. **Sinh surrogate key** ở tầng ETL (số thứ tự dòng). Không dùng `OrderNo+LineNo`; cũng không dùng composite key nhiều cột — composite key unique chỉ vì các dòng tình cờ khác nhau, không có ràng buộc nào bảo đảm.
3. **Không gắn cờ, không xóa** 48 dòng còn lại. Chúng không vi phạm gì.

Đây là **bẫy sâu nhất của bộ đề**. Phần lớn người làm bài sẽ dedupe máy móc và ra sai doanh thu **−5,63%**.

### 3.2. Bảng audit đầy đủ — 10 vấn đề

| # | Rule | Vấn đề | Số dòng | Ảnh hưởng | Xử lý | Rule chặn tương lai |
|---|---|---|---|---|---|---|
| 1 | DQ03 | **Không có khóa tự nhiên.** `OrderNo` không phải mã đơn (97,6% đơn nhiều dòng có >1 khách). Chỉ 1 cặp trùng thật | 2 (trùng thật) | −293,1 tr nếu dedupe sai | Xóa index 450; sinh **surrogate key** ở ETL. Giữ nguyên 48 dòng còn lại | Hard block: fact table phải có surrogate PK do hệ thống sinh |
| 2 | DQ01 | Orphan `KH999` (3 dòng, 37,7 tr) và `VT999` (2 dòng SO + 1 dòng inventory, 36,8 tr) | 6 | Inner join làm mất 74,5 tr doanh thu | Thêm dòng "Unknown" vào dim, **không xóa dòng fact** | Hard block: FK phải tồn tại trong dim |
| 3 | DQ02 | Bán hàng `Discontinued` (3 item / 41 dòng); khách `Inactive` (2 KH / 23 dòng); kho `WH_OLD` (1 dòng) | 65 | Quy trình duyệt lỏng lẻo | **Gắn cờ, không xóa** — đây là giao dịch thật | Hard block ở POS: không cho chọn master inactive |
| 4 | DQ04 | `UnitPrice = 0` | 1 | Biên lợi nhuận âm | Cách ly khỏi phân tích giá/biên | Hard block: UnitPrice > 0 |
| 5 | DQ04 | `DiscountPct = 65%` (còn lại đều ≤ 20%) | 1 | Biên âm; doanh thu 917.700 VNĐ | Cách ly + gắn cờ | Soft warning: Discount > 20% cần duyệt cấp trên |
| 6 | DQ04 | **Outlier `QtyOrder = 900`** (median 18, max còn lại 35) | 1 | Doanh thu 135.000.000 VNĐ (2,5% tổng) | Loại khỏi trend chart; nếu giữ, phải chú thích | Soft warning: Qty > 3× P99 theo item |
| 7 | DQ04 | **Tồn âm** — 14 dòng, trong đó **4 dòng còn âm tại 30/06/2026** | 14 | Không thể tồn âm về mặt vật lý | Điều tra nghiệp vụ (bán trước khi nhập?). **Không set = 0** | Hard block: OnHandQty ≥ 0 tại thời điểm chốt sổ |
| 8 | DQ06 | ⚠️ **`LastReceiptDate` là số serial, không phải date** | 865 | Mọi phân tích aging sai | Convert bắt buộc trước khi làm gì khác | Ép kiểu tại tầng ETL |
| 9 | *(không có trong hint)* | `fact.Salesperson` ≠ `dim_customer.Salesperson` ở **344/452 dòng (76%)** | 344 | Báo cáo hiệu suất NV sai hoàn toàn | Chốt định nghĩa: fact = NV bán đơn; dim = NV phụ trách KH. **Dùng fact cho báo cáo doanh số** | Ghi rõ trong data dictionary |
| 10 | *(không có trong hint)* | **Plan và fact không cùng phạm vi** — fact là mẫu ~6%, lệch 16,48 lần (xem §2.5) | toàn bộ | KPI "% đạt kế hoạch" tuyệt đối (6,07%) không đọc được | Thay bằng **Achievement Index** (chuẩn hóa = 100), % thô đưa vào tooltip | Reconcile scope của plan với fact trước khi publish |

**Bổ sung — các null là hợp lệ, đừng "sửa":**
- `ActualDeliveryDate` null 120 dòng = 71 Open + 49 Cancelled. Đúng logic nghiệp vụ.
- `Note` null 442/452 và `StockStatusNote` null 850/865 — đây là cột chú thích, null là bình thường.
- `QtyOrder ≤ 0` ở 22 dòng — **toàn bộ là `Return`**. Quy ước ghi nhận, không phải lỗi.

### 3.3. Waterfall Reconciliation — tóm tắt

*(Bản đầy đủ kèm hai nhánh đối chứng ở §6.5. Bảng dưới đây chỉ để chốt con số Revenue Net dùng xuyên suốt tài liệu.)*

| Bước | Diễn giải | Giá trị (VNĐ) | Lũy kế |
|---|---|---|---|
| A | Gross Revenue (Completed + Open, gồm mọi lỗi) | +5.463.412.100 | 5.463.412.100 |
| B | Trừ dòng trùng thật (1 dòng) | −11.956.000 | 5.451.456.100 |
| C | Trừ outlier `QtyOrder = 900` | −135.000.000 | 5.316.456.100 |
| D | Trừ hàng trả lại (Return, 22 dòng) | −107.785.450 | **5.208.670.650** |
| — | *Cancelled đóng góp 0 đồng — không xuất hiện trong waterfall* | 0 | |
| — | *Nếu dedupe máy móc theo `OrderNo+LineNo` (SAI): mất thêm* | *−293.054.650* | *4.915.616.000 (−5,63%)* |

**Kết quả cuối cùng sau làm sạch:**

| Metric | Giá trị |
|---|---|
| Revenue Net | **5.208.670.650 VNĐ** |
| COGS | 4.283.440.000 VNĐ |
| Gross Margin | **888.400.150 VNĐ** |
| Gross Margin % | **17,18%** *(mẫu số = 5.171.840.150, loại 2 dòng VT999 không có COGS)* |
| Fill Rate | **87,21%** |
| On-time Delivery | **37,27%** (n = 330) |
| Avg Days Late | 2,0 ngày |
| % đạt kế hoạch | 6,07% *(hiển thị dưới dạng Achievement Index — xem §2.5.3)* |

*(Số dòng còn lại: 450/452)*

---

## 4. ĐẶC TẢ DASHBOARD 1 — EXECUTIVE SALES

> **Yêu cầu đề bài:** *Tóm tắt doanh thu theo tháng, theo vùng, theo nhóm hàng. KPI: Revenue Net, Gross Margin, Fill Rate, % đạt kế hoạch, Top/Bottom sản phẩm hoặc khách hàng.*

Toàn bộ §4 bám sát đúng phạm vi này. Phân tích mở rộng chuyển xuống §4.6 dưới dạng tùy chọn.

### 4.1. Ba quyết định định nghĩa — ĐÃ CHỐT

| # | Quyết định | Đã chốt |
|---|---|---|
| **(a)** | `Region` ở Dashboard 1 | **Vùng KHÁCH HÀNG** (`dim_customer.Region`). Rule nền: `plan_monthly_sales.Region` ≡ `dim_customer.Region` — plan là kế hoạch theo thị trường. Dashboard 1 lấy góc nhìn khách hàng |
| **(b)** | Kênh "Nội bộ" | **Vẫn tính vào Revenue Net.** `Channel` là một giá trị của dimension, không phải metric riêng — dùng làm slicer, không tạo KPI |
| **(c)** | `Salesperson` | Dùng cột trong `fact_sales_orders` — **nhân viên bán đơn hàng đó** |

> ⚠️ **Dashboard 2 dùng `dim_warehouse.Region`** (hàng nằm ở kho, không nằm ở khách hàng). Hai dashboard dùng hai định nghĩa Region khác nhau — **bắt buộc ghi chú**, nếu không người đọc tưởng số bị sai. 65,7% số dòng có vùng khách ≠ vùng kho.

**Hệ quả của quyết định (a):** 2 dòng `KH999` (orphan, không có Region) bị loại khỏi mọi phép so sánh với plan — 37.712.000 VNĐ. Cộng với 2 dòng `VT999` (không có Category), tổng 74.542.500 VNĐ nằm ngoài grain của plan. Xử lý: thêm bucket **"Unknown"** để tổng doanh thu vẫn khớp 5.208.670.650, nhưng loại khỏi mẫu số Index.

### 4.2. Năm KPI bắt buộc — công thức và giá trị

| KPI | Công thức | Phạm vi lọc | Giá trị |
|---|---|---|---|
| **Revenue Net** | `Σ QtyDelivered × UnitPrice × (1 − DiscountPct)` | `DocStatus ≠ 'Cancelled'` (401 dòng) | **5.208.670.650 VNĐ** |
| **Gross Margin** | `Revenue Net − Σ QtyDelivered × StandardCost` | Như trên, **trừ 2 dòng `VT999`** (không có StandardCost) → 399 dòng | **888.400.150 VNĐ** |
| **Gross Margin %** | `Gross Margin ÷ Revenue của 399 dòng` | Mẫu số = 5.171.840.150 | **17,18%** |
| **Fill Rate** | `Σ QtyDelivered ÷ Σ QtyOrder` | `QtyOrder > 0` **và** `DocStatus ≠ 'Cancelled'` | **87,21%** |
| **Achievement Index** *(thay cho % đạt kế hoạch)* | `(Actual/Target của nhóm) ÷ (Actual/Target tổng) × 100` | Grain Month × Region × Category, 397 dòng | **100 = mặt bằng**<br>tooltip: % đạt = **6,07%** |

> ⚠️ **Bẫy Gross Margin %:** `VT999` là orphan, không có `StandardCost`. Nếu để công cụ tự bỏ qua null (coi COGS = 0), GM% bị thổi lên **17,76%**. Mẫu số của GM% **bắt buộc** phải là doanh thu của đúng những dòng có COGS (5.171.840.150), không phải tổng Revenue Net (5.208.670.650). Chênh 0,58 điểm phần trăm.

> ⚠️ **Achievement Index chỉ đọc ở cấp tổng hợp** (vùng / nhóm hàng / tháng), không đọc ở từng ô — xem §2.5.4(b). Ở cấp ô chỉ có ~3,7 đơn hàng, Index dao động từ −0,7 đến 848,3.

Hai KPI phụ nên bổ sung (đề bài không yêu cầu, nhưng thiếu chúng thì bức tranh sai lệch):

| KPI phụ | Giá trị | Vì sao |
|---|---|---|
| **On-time Delivery** | **37,27%** | Fill Rate 87,21% mà OTD 37,27% ⇒ *"giao đủ nhưng giao muộn"*. Chỉ hiện Fill Rate là che mất vấn đề vận hành |
| **Return Rate** | 2,24% gross | 107.785.450 VNĐ hàng trả lại — cần biết nó nằm ở đâu |

### 4.3. Ba lát cắt doanh thu bắt buộc

#### (1) Theo THÁNG

| Tháng | Revenue Net | Gross Margin | GM% | Target | % đạt | **Index** |
|---|---|---|---|---|---|---|
| 2026-01 | 642.593.910 | 110.363.910 | 17,17% | 14.737.000.000 | 4,36% | 71,9 |
| 2026-02 | 514.718.460 | 94.418.460 | 18,34% | 13.935.000.000 | 3,69% | **60,9** |
| 2026-03 | 895.400.650 | 146.300.650 | 16,34% | 13.134.000.000 | 6,54% | 107,7 |
| 2026-04 | 688.069.060 | 112.658.560 | 17,30% | 15.034.000.000 | 4,33% | 71,3 |
| **2026-05** | **1.512.309.680** | 272.429.680 | 18,01% | 13.127.000.000 | 11,52% | **189,8** |
| 2026-06 | 955.578.890 | 152.228.890 | 15,93% | 14.635.000.000 | 6,53% | 107,6 |

**Đọc gì:** T5 gấp gần 3× T2. Kiểm tra xem là mùa vụ thật hay do vài đơn lớn — dòng outlier `QtyOrder = 900` đã bị loại; nếu giữ, T5 còn cao hơn nữa. Nửa đầu năm (T1–T4) đều dưới mặt bằng, chỉ T5–T6 vượt.

#### (2) Theo VÙNG (khách hàng)

| Region | Revenue Net | Gross Margin | GM% | Target | % đạt | **Index** |
|---|---|---|---|---|---|---|
| Miền Bắc | 1.947.827.200 | 352.737.200 | **18,11%** | 25.689.000.000 | 7,58% | **124,9** |
| Miền Nam | 1.792.218.470 | 299.318.470 | 16,70% | 29.684.000.000 | 6,04% | 99,5 |
| **Miền Trung** | 1.430.912.980 | 228.152.480 | 16,37% | 29.229.000.000 | 4,77% | **78,6** |
| *Unknown (KH999)* | *37.712.000* | *—* | *—* | *—* | *—* | *—* |

**Đọc gì:** Miền Trung yếu toàn diện — Index thấp nhất (78,6) **và** GM% thấp nhất (16,37%). Khác với kết luận khi gán theo vùng kho, ở đây Miền Trung không "bán ít nhưng bán được giá"; nó vừa bán ít vừa bán rẻ. Miền Bắc dẫn đầu cả hai chiều.

#### (3) Theo NHÓM HÀNG

| Nhóm hàng | Revenue Net | Gross Margin | **GM%** | Target | % đạt | **Index** |
|---|---|---|---|---|---|---|
| Dầu nhớt | 1.074.967.900 | 203.007.900 | 18,89% | 14.317.000.000 | 7,25% | 119,5 |
| Ắc quy | 1.000.535.080 | 141.805.080 | 14,17% | 13.591.000.000 | 7,36% | **121,3** |
| Hóa chất | 951.724.080 | 205.564.080 | **21,60%** | 12.990.000.000 | 7,33% | 120,7 |
| Phụ tùng thân vỏ | 813.056.660 | 135.496.660 | 16,67% | 14.145.000.000 | 5,75% | 94,7 |
| **Lốp** | 755.306.860 | 88.846.860 | **11,76%** | 15.395.000.000 | 4,90% | 80,8 |
| **Phụ tùng nhanh** | 576.249.570 | 113.679.570 | 19,73% | 14.164.000.000 | 4,07% | **67,0** |
| *Unknown (VT999)* | *36.830.500* | *—* | *—* | *—* | *—* | *—* |

**Đọc gì:**
- **Hóa chất** doanh thu chỉ đứng thứ 3 nhưng **Gross Profit cao nhất (205,6 tr)** nhờ GM% 21,6%. Đây là nhóm nên đẩy.
- **Lốp** GM% chỉ 11,76% ⇒ Gross Profit thấp nhất, trong khi target lại cao nhất (15,4 tỷ). Kế hoạch đang đặt cược vào nhóm biên mỏng nhất.
- **Phụ tùng nhanh** Index 67,0 — yếu nhất, dù GM% tốt (19,73%). Đây là nhóm bị bỏ lỡ: biên tốt mà không bán được.

### 4.4. Top / Bottom — dùng Gross Profit, không phải Revenue

Đề bài cho phép chọn *"sản phẩm **hoặc** khách hàng"*. **Chọn sản phẩm** — vì Top/Bottom sản phẩm cho kết luận khác nhau giữa Revenue và Gross Profit, còn Top/Bottom khách hàng gần như trùng nhau (Top 10 theo Revenue và Top 10 theo Gross Profit là **cùng một tập 10 khách**, chỉ khác thứ tự).

**TOP 5 sản phẩm**

| Xếp theo **Revenue** | Revenue | | Xếp theo **Gross Profit** | Gross Profit | GM% |
|---|---|---|---|---|---|
| VT008 Ắc quy 08 | 483.076.080 | | VT025 Dầu nhớt 25 | 83.295.360 | 20% |
| VT025 Dầu nhớt 25 | 410.895.360 | | VT006 Hóa chất 06 | 70.964.100 | 22% |
| **VT015 Lốp 15** | **405.811.440** | | VT008 Ắc quy 08 | 65.476.080 | 14% |
| VT023 Thân vỏ 23 | 363.420.000 | | VT023 Thân vỏ 23 | 57.420.000 | 16% |
| VT006 Hóa chất 06 | 330.164.100 | | VT031 Dầu nhớt 31 | 55.586.880 | 18% |

> **Insight:** `VT015 Lốp 15` đứng **#3 về Revenue nhưng rơi khỏi Top 5 Gross Profit** — GM chỉ 12%. Ngược lại `VT031 Dầu nhớt 31` không có trong Top 5 Revenue nhưng lọt Top 5 Gross Profit. Bảng xếp theo Revenue sẽ khiến ban lãnh đạo đẩy sai sản phẩm.

**BOTTOM 5 sản phẩm (theo Gross Profit)**

| Item | Revenue | Gross Profit | GM% | Ghi chú |
|---|---|---|---|---|
| VT033 Lốp 33 | 16.230.900 | 1.180.900 | **7%** | MOC 65,7 tháng — nhưng giá trị tồn dưới trung vị, **không** thuộc nhóm Slow & Heavy (§5.2) |
| VT036 Hóa chất 36 | 13.365.000 | 3.105.000 | 23% | Biên tốt, chỉ là bán ít |
| VT003 Lốp 03 | 31.303.920 | 3.223.920 | 10% | |
| VT017 Thân vỏ 17 | 20.515.500 | 3.775.500 | 18% | |
| VT021 Lốp 21 | 58.728.600 | 5.878.600 | 10% | **Discontinued**, còn tồn 250,6 tr, thuộc nhóm Slow & Heavy (§5.2, §5.4) |

> ⚠️ **Tam giác hóa:** `VT021` xuất hiện ở cả ba nơi — Bottom Gross Profit (đây), Slow & Heavy (§5.2), Discontinued còn tồn (§5.4). `VT007` cũng vậy. **Đây là hai sản phẩm cần quyết định thanh lý ngay.** Riêng `VT033` tuy Bottom GP và MOC cao nhất, giá trị tồn lại nhỏ (72,8 tr) ⇒ ưu tiên thấp hơn.

### 4.5. Layout — bám sát đề bài

```
┌────────────────────────────────────────────────────────────────────┐
│  [Slicer: Tháng]  [Slicer: Region-khách]  [Slicer: Channel]        │
├──────────┬──────────┬──────────┬──────────────┬────────────────────┤
│Revenue   │  Gross   │   Fill   │  Achievement │  (phụ) OTD 37,27%  │
│  Net     │  Margin  │   Rate   │    Index     │  (phụ) Return 2,24%│
│ 5,21 tỷ  │ 888,4 tr │  87,21%  │  100 = TB    │                    │
│          │ (17,18%) │          │ tooltip:6,07%│                    │
├──────────┴──────────┴──────────┴──────────────┴────────────────────┤
│                                                                     │
│  (1) Column+Line: Revenue Net theo THÁNG                            │
│      cột = Revenue Net · đường = Achievement Index (thang phụ, 100) │
│                                                                     │
├─────────────────────────────────┬───────────────────────────────────┤
│  (2) Bar ngang: theo VÙNG KHÁCH │  (3) Bar ngang: theo NHÓM HÀNG    │
│      cột = Revenue Net          │      cột = Revenue Net            │
│      nhãn = Achievement Index   │      màu = GM% (thang đỏ→xanh)    │
│      đường mốc = Index 100      │      nhãn = Achievement Index     │
├─────────────────────────────────┴───────────────────────────────────┤
│  (4) Bảng Top 5 / Bottom 5 SẢN PHẨM                                 │
│      cột: Item · Revenue · Gross Profit · GM% · [sort toggle]       │
│      ⚠️ tô nền cam nếu item cũng nằm trong danh sách tồn chậm       │
└─────────────────────────────────────────────────────────────────────┘
📝 Chú thích bắt buộc trên trang:
   • Region = vùng KHÁCH HÀNG (Dashboard 2 dùng vùng KHO — khác nhau).
   • Achievement Index = tỷ lệ đạt kế hoạch chuẩn hóa, 100 = mặt bằng chung (6,07%).
     Chỉ đọc ở cấp vùng / nhóm hàng / tháng. KHÔNG đọc ở từng ô (~3,7 đơn/ô).
   • Kênh Nội bộ (24,5% doanh thu) ĐƯỢC tính vào Revenue Net.
   • Plan và fact không cùng phạm vi (fact là mẫu ~6%).
   • Đã loại 1 dòng trùng, 1 dòng outlier Qty=900. VT999 không có COGS ⇒ loại khỏi GM.
```

Bốn hình cho đúng ba lát cắt đề bài yêu cầu (tháng / vùng / nhóm hàng) + một bảng Top-Bottom. Không thêm hình nào khác — trang điều hành cần đọc trong 30 giây.

**Không dựng heatmap Region × Category ở trang này.** Ở grain đó chỉ có ~22 dòng đơn mỗi ô (gộp 6 tháng) và ~3,7 dòng nếu tách theo tháng; Index sẽ dao động từ −0,7 đến 848,3. Nếu vẫn muốn có, đặt ở trang drill-through kèm cảnh báo và thang màu cho phép giá trị âm.

### 4.6. Phân tích mở rộng — chỉ làm nếu còn thời gian

Không thuộc phạm vi đề bài. Đặt sang trang phụ (drill-through), không đưa lên trang chính.

| # | Câu hỏi | Trực quan hóa |
|---|---|---|
| E1 | Chênh lệch doanh thu đến từ **lượng hay chiết khấu**? | Price-Volume-Mix bridge. Vì `UnitPrice = ListPrice` ở 99,3% dòng ⇒ chỉ còn 2 biến |
| E2 | **Chiết khấu có mua được doanh thu không?** | Scatter: DiscountPct TB theo khách (X) vs Revenue (Y). Không tương quan ⇒ đang cho không chiết khấu |
| E3 | Có bao nhiêu dòng **bán dưới giá vốn**? | **2 dòng**: `UnitPrice = 0` và `DiscountPct = 65%` |
| E4 | Nhân viên nào có **GM% thấp nhất** (bán bằng chiết khấu)? | Bar: Revenue (cột) + GM% (đường), 4 NV. Dùng `fact.Salesperson` |
| E5 | **Concentration risk** — Top 5 khách chiếm bao nhiêu? | **23,0%** — không nguy hiểm ở mức này |
| E6 | Hàng trả lại tập trung ở nhóm/vùng nào? | Bar: Return theo Category. **Miền Trung có 1 ô doanh thu ÂM** (T6, Dầu nhớt: −505.600) |

---

## 5. ĐẶC TẢ DASHBOARD 2 — INVENTORY & SLOW MOVING

> **Yêu cầu đề bài:** *Tồn kho cuối tháng mới nhất; mặt hàng tồn cao nhưng bán chậm 6 tháng; tồn âm; hàng discontinued còn tồn; tồn kho theo kho/nhóm hàng.*

Năm yêu cầu → năm khối nội dung ở §5.2–§5.6. **Region ở dashboard này = `dim_warehouse.Region`** (hàng nằm ở kho, không nằm ở khách hàng) — khác Dashboard 1.

### 5.1. Nền tảng: tồn kho cuối tháng mới nhất (EOM 30/06/2026)

| | Giá trị |
|---|---|
| Số dòng snapshot | 145 (36 item × 4 kho + 1 dòng orphan `VT999`) |
| **Tổng giá trị tồn (loại `VT999`)** | **6.391.770.000 VNĐ** |
| Tổng số lượng | 10.175 |
| Dòng orphan `VT999` (WH_HN) | 50 đơn vị · 5.000.000 VNĐ — **loại khỏi mọi phân tích** |

> ⚠️ Nếu không loại `VT999`, tổng thành 6.396.770.000 và WH_HN bị thổi lên 1.728.270.000. Chênh nhỏ nhưng làm số không khớp với `dim_product`.

**Hai công thức nền:**

```
MOC (Months of Cover) = OnHandQty(EOM T6) ÷ (Σ QtyDelivered 6 tháng ÷ 6)
Ngưỡng: MOC > 12 = slow moving · MOC > 24 = dead stock
```

### 5.2. ⚠️ Yêu cầu "tồn CAO nhưng bán CHẬM" — là điều kiện KÉP

**Bẫy 1:** không có mặt hàng nào bán được 0 đơn vị trong 6 tháng. Định nghĩa slow-moving = *"không bán được gì"* → danh sách rỗng.

**Bẫy 2 (nghiêm trọng hơn):** xếp hạng chỉ theo MOC sẽ cho ra **cảnh báo sai**. Bốn item có MOC rất cao nhưng giá trị tồn **dưới trung vị (127.610.000 VNĐ/item)** — bán chậm nhưng không chôn vốn:

| Item | Giá trị tồn | MOC | Nhận định |
|---|---|---|---|
| VT033 Lốp 33 | 72.800.000 | 65,7 | MOC cao nhất bộ dữ liệu, nhưng chỉ 72,8 tr vốn. **Thanh lý không cứu được dòng tiền** |
| VT036 Hóa chất 36 | 49.500.000 | 30,6 | |
| VT005 Thân vỏ 05 | 105.720.000 | 23,5 | |
| VT028 PT nhanh 28 | 126.100.000 | 16,6 | |

**Định nghĩa đúng — góc phần tư (quadrant):**

```
Slow & Heavy = InventoryValue > median(127.610.000) AND MOC > 12
```

**Kết quả: 9 item · 2.402.800.000 VNĐ · 37,6% tổng giá trị tồn kho đang mắc kẹt.**

| Item | Tên | ABC | Status | Tồn | Giá trị tồn (VNĐ) | Bán 6T | **MOC** |
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

**Đọc gì:**
- **4/9 item là hạng A** — hàng được phân loại "quan trọng nhất" lại đang chết vốn 1.302.550.000 VNĐ. Phân loại ABC hoặc dự báo nhu cầu đang sai.
- **VT023** giá trị tồn lớn nhất (473,4 tr) nhưng MOC chỉ 12,8 — nằm sát ngưỡng. Đây là item mà bảng xếp theo MOC bỏ sót hoàn toàn.
- **VT011 và VT014**: MOC > 45 tháng ở hạng A. Đây là hai case cực đoan nhất.

### 5.3. Tồn âm tại 30/06/2026

**4 dòng còn âm**, không phải lỗi lịch sử đã tự khỏi (cả 6 tháng có 14 dòng âm):

| Item | Tên | Kho | OnHandQty | InventoryValue | SafetyStock |
|---|---|---|---|---|---|
| VT018 | Hóa chất 18 | WH_HN | **−7** | −3.360.000 | 10 |
| VT010 | Phụ tùng nhanh 10 | WH_DN | −3 | −2.700.000 | 30 |
| VT016 | Phụ tùng nhanh 16 | WH_DA | −2 | −1.300.000 | 20 |
| VT018 | Hóa chất 18 | WH_DN | −1 | −480.000 | 20 |

Phân bố 4 dòng: **WH_DN 2 · WH_DA 1 · WH_HN 1**. *(Phân bố của 14 dòng trên cả 6 tháng là WH_HCM 4 · WH_DA 4 · WH_DN 4 · WH_HN 2 — đừng nhầm hai con số.)*

**Đọc gì:** `VT018` âm ở **2 kho khác nhau** ⇒ nhiều khả năng là lỗi quy trình (xuất kho trước khi nhập, hoặc ghi nhận sai chiều), không phải lỗi ngẫu nhiên ở một kho. **Không set = 0.** Phải điều tra nghiệp vụ.

### 5.4. Hàng Discontinued còn tồn

**580.050.000 VNĐ = 9,1% tổng giá trị tồn kho.**

| Item | Tên | Tồn | Giá trị tồn | StandardCost | ListPrice | **Chiết khấu tối đa để không lỗ** |
|---|---|---|---|---|---|---|
| VT021 | Lốp 21 | 716 | 250.600.000 | 350.000 | 413.000 | **15,3%** |
| VT007 | Dầu nhớt 07 | 502 | 175.700.000 | 350.000 | 448.000 | **21,9%** |
| VT035 | Phụ tùng thân vỏ 35 | 615 | 153.750.000 | 250.000 | 312.000 | **19,9%** |

Phân bố theo kho (số lượng):

| Item | WH_HN | WH_DA | WH_DN | WH_HCM |
|---|---|---|---|---|
| VT007 | 96 | 195 | 125 | 86 |
| VT021 | 151 | 185 | 217 | 163 |
| VT035 | 188 | 157 | 102 | 168 |

**Đọc gì:** Hàng Discontinued vẫn nằm rải đều ở cả 4 kho — chưa có động thái gom về một điểm để thanh lý. `VT021` là ca xấu nhất: giá trị tồn lớn nhất, nhưng biên mỏng nhất (chỉ chiết khấu được 15,3% trước khi lỗ so với giá vốn). Ba item này đồng thời xuất hiện ở bảng §5.2 và §4.4 (Bottom Gross Profit).

### 5.5. Tồn kho theo KHO và theo NHÓM HÀNG

**(a) Theo kho** *(đã loại `VT999`)*

| Kho | Vùng | OnHandQty | InventoryValue |
|---|---|---|---|
| WH_HN | Miền Bắc | 2.754 | 1.723.270.000 |
| WH_DN | Miền Trung | 2.410 | 1.629.770.000 |
| WH_HCM | Miền Nam | 2.524 | 1.535.270.000 |
| WH_DA | Miền Bắc | 2.487 | 1.503.460.000 |
| **Tổng** | | **10.175** | **6.391.770.000** |

**(b) Theo nhóm hàng**

| Nhóm hàng | OnHandQty | InventoryValue | % tồn kho |
|---|---|---|---|
| Dầu nhớt | 1.674 | 1.358.720.000 | 21,3% |
| Phụ tùng thân vỏ | 3.175 | 1.340.800.000 | 21,0% |
| Ắc quy | 1.115 | 1.207.820.000 | 18,9% |
| Hóa chất | 1.177 | 1.047.240.000 | 16,4% |
| Lốp | 1.792 | 971.400.000 | 15,2% |
| **Phụ tùng nhanh** | 1.242 | **465.790.000** | **7,3%** |

**(c) Ma trận Kho × Nhóm hàng (giá trị tồn, VNĐ)**

| Nhóm hàng | WH_HN | WH_DA | WH_DN | WH_HCM |
|---|---|---|---|---|
| Dầu nhớt | 305.460.000 | 293.730.000 | **457.870.000** | 301.660.000 |
| Phụ tùng thân vỏ | 391.850.000 | 248.200.000 | **400.190.000** | 300.560.000 |
| Ắc quy | 288.220.000 | 262.420.000 | 155.050.000 | **502.130.000** |
| Hóa chất | 307.620.000 | 316.800.000 | 262.860.000 | 159.960.000 |
| Lốp | 294.160.000 | 259.860.000 | 285.630.000 | 131.750.000 |
| Phụ tùng nhanh | 135.960.000 | 122.450.000 | 68.170.000 | 139.210.000 |

**Đọc gì:**
- **Phụ tùng nhanh** chỉ chiếm 7,3% tồn kho — trong khi ở Dashboard 1 nó có **Achievement Index thấp nhất (67,0)** dù GM% tốt (19,7%). Giả thuyết: *bán kém vì không có hàng để bán.* Đây là câu hỏi đáng đào nhất.
- **WH_HCM** giữ 502,1 triệu Ắc quy — gấp 3,2× WH_DN. Phân bổ lệch rõ rệt, cần đối chiếu với nhu cầu vùng.
- **WH_DN** giữ nhiều Dầu nhớt và Thân vỏ nhất, nhưng lại là kho có tỷ lệ tồn/doanh thu tệ nhất (xem §5.6).

### 5.6. Phân tích bổ sung — không bắt buộc nhưng đáng làm

| # | Câu hỏi | Phát hiện |
|---|---|---|
| I1 | **Tỷ lệ tồn kho / doanh thu theo vùng** — phân bổ có hợp lý không? | MB **1,21** · MN **1,04** · **MT 1,53** ⇒ WH_DN (Miền Trung) chôn vốn nhiều nhất trên mỗi đồng doanh thu |
| I2 | **Stockout risk** — bao nhiêu dòng dưới safety stock? | **40/144 dòng (27,8%)**, thuộc **24 item**; 1 dòng tồn = 0 mà safety > 0 |
| I3 | **Nghịch lý kép** — item dưới safety có phải hàng bán chạy không? | **Không mang tính hệ thống.** Tốc độ bán TB của item dưới safety = 136,2 vs toàn bộ = 148,2 — gần như nhau. **Nhưng có case cá biệt rõ rệt:** `VT026 Ắc quy 26` bán 316 đơn vị/6T, MOC chỉ **2,3 tháng** mà vẫn dưới safety ⇒ nguy cơ đứt hàng thật |
| I4 | **Aging tồn kho** | `LastReceiptDate` là Excel serial (45.816 → 46.198 ≈ 06/2025 → 06/2026). **Convert trước**, rồi mới tính số ngày nằm kho |

> ⚠️ **Tam giác hóa:** `VT021` và `VT007` xuất hiện đồng thời ở (a) Bottom Gross Profit — §4.4, (b) Slow & Heavy — §5.2, (c) Discontinued còn tồn — §5.4. Ba dashboard độc lập cùng chỉ về hai sản phẩm này ⇒ **quyết định thanh lý có căn cứ vững nhất**.

### 5.7. Layout — bám sát 5 yêu cầu

```
┌────────────────────────────────────────────────────────────────────┐
│  [Slicer: Kho] [Slicer: Nhóm hàng] [Slicer: ABC] [Slicer: Status]  │
│  📌 Ảnh chụp tồn kho: 30/06/2026 (kỳ mới nhất)                     │
├──────────────┬──────────────┬──────────────┬───────────────────────┤
│ Tổng giá trị │ Vốn mắc kẹt  │  Discontinued│  Tồn âm  │ Dưới safety│
│   tồn kho    │ (Slow&Heavy) │   còn tồn    │          │            │
│  6.391,8 tr  │ 2.402,8 tr   │  580,1 tr    │  4 dòng  │ 40/144 dòng│
│              │   (37,6%)    │   (9,1%)     │    ⚠️    │  (27,8%)   │
├──────────────┴──────────────┴──────────────┴──────────┴────────────┤
│  (YC-2) Scatter GÓC PHẦN TƯ — trái tim của trang                   │
│    X = MOC (đường mốc 12)  ·  Y = Giá trị tồn (đường mốc 127,6 tr) │
│    bubble size = OnHandQty · màu = ABC_Class                       │
│    → góc trên-phải = "Slow & Heavy" (9 item) tô đỏ, gắn nhãn item  │
├──────────────────────────────────┬─────────────────────────────────┤
│  (YC-5a) Bar: tồn theo KHO       │  (YC-5b) Bar: tồn theo NHÓM HÀNG│
│         + nhãn tỷ lệ tồn/DT      │         + nhãn % tồn kho        │
├──────────────────────────────────┴─────────────────────────────────┤
│  (YC-5c) Heatmap Kho × Nhóm hàng (giá trị tồn)                     │
├──────────────────────────────────┬─────────────────────────────────┤
│  (YC-3) Bảng TỒN ÂM              │  (YC-4) Bảng DISCONTINUED       │
│   Item·Kho·OnHand·Value·Safety   │   Item·Tồn·Value·% CK tối đa    │
│   4 dòng, tô đỏ                  │   3 item, cột "CK tối đa"       │
└──────────────────────────────────┴─────────────────────────────────┘
📝 Chú thích bắt buộc:
   • Region ở trang này = vùng KHO (Dashboard 1 dùng vùng KHÁCH HÀNG).
   • Đã loại dòng orphan VT999 (WH_HN, 50 đv, 5.000.000 VNĐ).
   • Slow & Heavy = Giá trị tồn > trung vị (127.610.000) VÀ MOC > 12 tháng.
     Xếp hạng chỉ theo MOC sẽ cho cảnh báo sai (VT033: MOC 65,7 nhưng chỉ 72,8 tr vốn).
   • Tồn âm KHÔNG được set = 0 — là dấu hiệu lỗi quy trình, cần điều tra.
```

Bốn khối hình phủ đúng 5 yêu cầu: scatter góc phần tư (YC-2), hai bar + heatmap (YC-5), hai bảng chi tiết (YC-3, YC-4), toàn bộ trên nền EOM tháng mới nhất (YC-1).

---

## 6. ĐẶC TẢ DASHBOARD 3 — DATA QUALITY / RECONCILIATION

> **Yêu cầu đề bài:** *Liệt kê tối thiểu 5 vấn đề dữ liệu phát hiện được; nêu cách xử lý hoặc rule kiểm tra sau này. Có thể dùng bảng audit hoặc checklist.*

### 6.0. Mục tiêu của trang

Dashboard 3 khác hai trang kia ở **đối tượng đọc**:

| Dashboard | Ai đọc | Câu hỏi họ mang theo |
|---|---|---|
| 1 — Executive Sales | Ban lãnh đạo | *"Tháng này bán thế nào?"* |
| 2 — Inventory | Quản lý kho / mua hàng | *"Hàng nào đang chôn vốn?"* |
| **3 — Data Quality** | **Data owner / IT / kế toán trưởng** | ***"Có tin được hai trang kia không?"*** |

> **Mục tiêu:** Chứng minh số liệu ở Dashboard 1 và 2 **đáng tin đến mức nào**, định lượng phần **không đáng tin bằng tiền**, và chỉ ra **ai phải sửa cái gì**.

Đây không phải trang khoe lỗi. Nó là **giấy chứng nhận chất lượng** cho hai trang còn lại.

### 6.1. Mười một câu hỏi phải trả lời

**Tầng 1 — PHÁT HIỆN**

| # | Câu hỏi | Khối trả lời |
|---|---|---|
| Q1 | Có bao nhiêu vấn đề, thuộc loại nào? | Bảng Audit (§6.3) |
| Q2 | Bao nhiêu dòng bị ảnh hưởng, chồng lấn ra sao? | Bảng Audit |
| Q3 | Vấn đề nào `data_quality_hint` **bỏ sót**? | Cột đánh dấu trong Bảng Audit |

**Tầng 2 — ĐỊNH LƯỢNG**

| # | Câu hỏi | Khối trả lời |
|---|---|---|
| Q4 | Không làm sạch thì Revenue Net sai bao nhiêu? | Waterfall (§6.4) |
| Q5 | **Làm sạch SAI** thì sai bao nhiêu? | Waterfall, nhánh đối chứng |
| Q6 | Vấn đề nào ảnh hưởng **tiền**, vấn đề nào chỉ ảnh hưởng **báo cáo**? | Ma trận (§6.2) |
| Q7 | Tồn kho có reconcile được không? | Reconciliation #2 (§6.5) |

**Tầng 3 — HÀNH ĐỘNG**

| # | Câu hỏi | Khối trả lời |
|---|---|---|
| Q8 | Lỗi **dữ liệu**, lỗi **quy trình**, hay lỗi **thiết kế**? | Ma trận (§6.2) |
| Q9 | Lỗi tập trung ở tháng nào / kho nào / ai bán? | Ba chỉ số (§6.6) |
| Q10 | Rule nào **chặn cứng**, rule nào chỉ **cảnh báo**? | Checklist (§6.7) |
| Q11 | Sau khi áp rule, chỉ số kỳ vọng là bao nhiêu? | Checklist |

*Q5 quan trọng hơn Q4: sai do lười (không làm sạch) là **+2,82%**; sai do làm sạch ẩu là **−5,63%** — và không ai phát hiện, vì con số trông "sạch hơn".*

### 6.2. Ba tầng lỗi — ba chỉ số — ba người sửa

Một chỉ số "% dòng sạch" duy nhất sẽ trộn lẫn ba thứ khác bản chất:

| Tầng | Câu hỏi nó trả lời | Ví dụ | **Chỉ số** | Ai sửa |
|---|---|---|---|---|
| **Dữ liệu** | *Có ghi đúng cái đã xảy ra không?* | `UnitPrice = 0`, dòng trùng, orphan `KH999` | **DQ Score = 97,79%** | Người nhập liệu / ETL |
| **Quy trình** | *Cái đã xảy ra có được phép không?* | Bán hàng Discontinued, bán cho khách Inactive | **PV Score = 13,94%** | Quản lý bán hàng |
| **Thiết kế** | *Hệ thống có đúng không?* | Không có khóa tự nhiên · `LastReceiptDate` sai kiểu · plan khác phạm vi | **Không đo bằng %** — liệt kê | IT / kiến trúc dữ liệu |

> **Điểm mấu chốt của tầng Quy trình:** dòng dữ liệu đó **hoàn toàn chính xác**. Nó ghi đúng rằng ngày X, nhân viên Y đã bán hàng đã ngừng kinh doanh cho khách đã đóng. Không ký tự nào sai. Cái sai là **hành vi**, không phải **bản ghi**. Trộn 63 dòng này vào DQ Score là đổ lỗi cho đội nhập liệu và tha cho đội bán hàng.

### 6.3. ⚠️ Phát hiện quan trọng nhất: `data_quality_hint` tự mâu thuẫn

Sheet hint ghi **DQ03 = "Duplicate key — Trùng OrderNo + LineNo"**, ngầm khẳng định `OrderNo + LineNo` là khóa chính. **Dữ liệu bác bỏ chính gợi ý đó.**

Trong **84 `OrderNo` có từ 2 dòng trở lên**:

| Kiểm tra | Kết quả |
|---|---|
| Có **>1 khách hàng** trong cùng `OrderNo` | **97,6%** |
| Có **>1 ngày đặt hàng** | 92,9% |
| Có **>1 kho** | 73,8% |
| **Nhất quán hoàn toàn** (1 khách, 1 ngày) | **1,2%** — đúng 1 đơn |
| `LineNo` chạy đúng 1..n trong mỗi `OrderNo` | **22,3%** *(vd: `SO2601-0003` chỉ có LineNo 3)* |
| Tiền tố `SO26MM` khớp `DocDate` | 452/452 = **100%** |

**Kết luận:** `fact_sales_orders` **không có khóa tự nhiên**. `OrderNo`/`LineNo` là nhãn được sinh ra, chỉ mang thông tin tháng. Mỗi dòng là một giao dịch độc lập.

Hệ quả:
1. **Không thể "trùng khóa" khi chưa từng có khóa.** 48 dòng cùng `OrderNo+LineNo` nhưng khác nội dung **không phải dòng bẩn**.
2. **Chỉ có 1 lỗi trùng lặp thật:** cặp `SO2602-0137 | LineNo 1` giống nhau ở cả 14 cột (index 20 và 450).
3. **Khuyến nghị:** dùng **surrogate key** (số thứ tự dòng do ETL sinh), không dùng `OrderNo+LineNo`, cũng không dùng composite key nhiều cột — composite key unique chỉ vì các dòng tình cờ khác nhau, không có ràng buộc nào bảo đảm.

Đây là **bẫy sâu nhất của bộ đề**: `drop_duplicates(['OrderNo','LineNo'])` xóa 26 giao dịch thật và làm bốc hơi **293.054.650 VNĐ** doanh thu hợp lệ.

### 6.4. BẢNG AUDIT — 11 vấn đề

`hint?` = sheet `data_quality_hint` có nhắc tới không. **5/11 vấn đề là do phân tích tự tìm ra.**

| # | hint? | Vấn đề | Bảng | Số dòng | Ảnh hưởng tiền | Cách xử lý | Rule tương lai |
|---|---|---|---|---|---|---|---|
| 1 | ❌ | **Không có khóa tự nhiên.** `OrderNo`/`LineNo` không phải khóa (97,6% đơn nhiều dòng có >1 khách) | SO | toàn bộ | **−293,1 tr nếu dedupe sai** | Sinh surrogate key ở ETL. **Không** dedupe theo `OrderNo+LineNo` | 🔴 Hard: fact table phải có surrogate PK |
| 2 | ✅ DQ03 | **Dòng trùng thật** — `SO2602-0137\|1`, giống cả 14 cột | SO | 2 | −11.956.000 | Xóa 1 bản (index 450) | 🔴 Hard: chặn insert bản ghi giống hệt |
| 3 | ✅ DQ01 | **Orphan FK** — `KH999` (3 dòng), `VT999` (2 dòng SO + 1 dòng INV) | SO, INV | 5 + 1 | 74,5 tr rơi ngoài grain plan | Thêm dòng **"Unknown"** vào dim. **Không xóa dòng fact** | 🔴 Hard: FK phải tồn tại trong dim |
| 4 | ✅ DQ04 | `UnitPrice = 0` — `SO2606-0087`, NV An | SO | 1 | Biên âm | Cách ly khỏi phân tích giá/biên | 🔴 Hard: `UnitPrice > 0` |
| 5 | ✅ DQ04 | `DiscountPct = 65%` — `SO2601-0088`, NV Bình *(P95 = P99 = 10%)* | SO | 1 | Biên âm; 917.700 VNĐ | Cách ly + yêu cầu duyệt | 🟡 Soft: `Discount > 20%` cần duyệt cấp trên |
| 6 | ✅ DQ04 | **`QtyOrder = 900` — BẤT KHẢ THI VỀ VẬT LÝ**, không phải outlier thống kê. `SO2605-9999` giao 900 đv `VT005` từ kho `WH_HCM`, nhưng kho này **chưa bao giờ giữ quá 300 đv** (xem §6.4b) | SO | 1 | −135.000.000 | **Loại bỏ có căn cứ**, không winsorize | 🔴 Hard: `QtyDelivered ≤ OnHandQty(Item, Warehouse)` — **rule đối chiếu chéo 2 bảng fact**<br>🔴 Hard: chặn mã đơn có hậu tố sentinel `9999`/`0000`<br>🟡 Soft: `Qty > 3× P99` theo item |
| 7 | ✅ DQ04 | **Tồn âm** — 14 dòng, **4 dòng còn âm tại 30/06/2026**. `VT018` âm ở **2 kho** | INV | 14 | Không thể tồn âm vật lý | Điều tra nghiệp vụ. **Không set = 0** | 🔴 Hard: `OnHandQty ≥ 0` khi chốt sổ |
| 8 | ✅ DQ06 | **`LastReceiptDate` là Excel serial number**, không phải date (45.816 → 46.198 = 08/06/2025 → 25/06/2026) | INV | 865 | Mọi phân tích aging sai | Convert bắt buộc trước mọi bước khác | 🔴 Hard: ép kiểu tại tầng ETL |
| 9 | ❌ | **`fact.Salesperson` ≠ `dim_customer.Salesperson`** ở 344/452 dòng (76%) | SO | 344 | Báo cáo hiệu suất NV sai hoàn toàn | Chốt định nghĩa: fact = NV bán đơn; dim = NV phụ trách KH | 📘 Ghi vào data dictionary |
| 10 | ❌ | **Plan và fact không cùng phạm vi** — fact là mẫu ~6%, lệch 16,48× | PLAN | 108 ô | KPI "% đạt kế hoạch" không đọc được | Dùng Achievement Index (§2.5.3) | 📘 Reconcile scope trước khi publish |
| 11 | ❌ | **`InventoryValue` là cột dẫn xuất** = `OnHandQty × StandardCost` (khớp 864/865) | INV | 865 | Cột thừa; sửa Qty phải sửa Value | Không lưu; tính lại bằng measure | 📘 Chuẩn hóa mô hình dữ liệu |

*(Vấn đề #12 — bán cho master inactive/discontinued, 63 dòng — **không nằm ở bảng này**. Nó thuộc tầng Quy trình, xem §6.6.)*

**Chồng lấn:** 5 cờ cấp dòng của `fact_sales_orders` (DupTrue 2, OrphanFK 5, ZeroPrice 1, HighDiscount 1, QtyOutlier 1) **không chồng lấn nhau** — cộng dồn = 10 = số dòng bẩn thực tế. Với `fact_inventory_EOM`: 14 + 1 = 15 dòng, cũng không chồng lấn.

#### 6.4b. Điều tra sâu: vì sao `QtyOrder = 900` là bản ghi bất khả thi

Dòng: `SO2605-9999` · 17/05/2026 · `VT005` · kho `WH_HCM` · **QtyOrder = QtyDelivered = 900** · `DocStatus = Completed` · giao 21/05 · `NV An`.

**Đối chiếu chéo với `fact_inventory_EOM` cho `VT005`:**

| Tháng | WH_DA | WH_DN | **WH_HCM** | WH_HN | Tổng 4 kho |
|---|---|---|---|---|---|
| 2026-01 | 72 | 74 | 93 | 52 | 291 |
| 2026-02 | 110 | 42 | 34 | 47 | 233 |
| 2026-03 | 86 | 69 | 20 | 49 | 224 |
| 2026-04 | 229 | 244 | 271 | 189 | 933 |
| **2026-05** | 232 | 180 | **300** | 249 | **961** |
| 2026-06 | 157 | 228 | 240 | 256 | 881 |

**Kho `WH_HCM` chưa bao giờ giữ quá 300 đơn vị `VT005`.** Không thể giao 900 đơn vị từ kho có tối đa 300. Gom cả 4 kho (max 961) cũng không đủ, và đơn chỉ ghi một kho.

Bốn dấu hiệu độc lập củng cố:

| Bằng chứng | Chi tiết |
|---|---|
| **Tồn kho không giảm** | Cuối T5 `WH_HCM` vẫn còn 300 — không có dấu vết xuất 900 đv |
| **Mã đơn sentinel** | `SO2605-`**`9999`** — mã duy nhất trong 452 dòng có hậu tố 9999/0000; các mã khác chạy `0001`–`0137` |
| **Vị trí trong file** | Index 451 — **dòng cuối cùng**, ngay sau dòng trùng (index 450). Hai dòng lỗi được nối vào đuôi file |
| **Bất hợp lý thương mại** | Đơn lớn nhất bộ dữ liệu nhưng `DiscountPct = 0`. Đơn 900 đv không chiết khấu một đồng |

Quy mô: gấp **26 lần** trung vị (26 đv), gấp **25,7 lần** `P99 = 35`, và chiếm **80% toàn bộ sản lượng `VT005`** trong 6 tháng (900/1.125).

> **Hệ quả về cách xử lý:** đây **không phải outlier**. Outlier là giá trị hiếm nhưng *có thể* xảy ra; dòng này *không thể* xảy ra. Chuyển từ "winsorize / ghi chú" sang **"loại bỏ, có căn cứ vật lý"**.
>
> **Rule sinh ra từ phát hiện này** là rule mạnh nhất trong cả checklist, vì nó đối chiếu **hai bảng fact** với nhau — không rule đơn bảng nào bắt được:
> ```
> 🔴 QtyDelivered ≤ OnHandQty của (ItemCode, WarehouseCode) tại thời điểm giao
> ```

**Null hợp lệ — đừng "sửa":**
- `ActualDeliveryDate` null 120 dòng = 71 Open + 49 Cancelled. Đúng logic nghiệp vụ.
- `QtyOrder ≤ 0` ở 22 dòng — **toàn bộ là `Return`**. Quy ước ghi nhận, không phải lỗi.
- `Note` null 442/452, `StockStatusNote` null 850/865 — cột chú thích.

### 6.5. RECONCILIATION #1 — Waterfall doanh thu

| Bước | Diễn giải | Giá trị (VNĐ) | Lũy kế |
|---|---|---|---|
| A | Gross Revenue (Completed + Open, gồm mọi lỗi) | +5.463.412.100 | 5.463.412.100 |
| B | Trừ dòng trùng thật (1 dòng) | −11.956.000 | 5.451.456.100 |
| C | Trừ outlier `QtyOrder = 900` | −135.000.000 | 5.316.456.100 |
| D | Cộng Return (22 dòng, giá trị âm) | −107.785.450 | **5.208.670.650** |
| — | *Cancelled đóng góp **0 đồng** — `QtyDelivered = 0` ở cả 49 dòng* | 0 | |

**Hai nhánh đối chứng — trái tim của trang:**

| Kịch bản | Revenue Net | Sai lệch |
|---|---|---|
| ✅ Làm sạch đúng | **5.208.670.650** | — |
| ⚠️ Không làm sạch gì | 5.355.626.650 | **+2,82%** |
| ❌ **Dedupe máy móc theo `OrderNo+LineNo`** | 4.915.616.000 | **−5,63%** (mất 293.054.650 VNĐ) |

> Làm sạch **sai** nguy hiểm gấp đôi không làm sạch — và khó phát hiện hơn, vì kết quả trông "gọn gàng".

### 6.6. RECONCILIATION #2 — Tồn kho *(phép đối chiếu độc lập)*

```
Kiểm tra: InventoryValue  ==  OnHandQty × StandardCost
```

| Kết quả | |
|---|---|
| Khớp | **864 / 865 = 99,88%** |
| Không khớp | **1 dòng** |

Dòng lệch duy nhất: `2026-06-30 · VT999 · WH_HN · 50 đv · 5.000.000 VNĐ` — vì `VT999` không có trong `dim_product` nên không có `StandardCost`.

> **Giá trị của phép đối chiếu này:** nó **tự phát hiện ra orphan `VT999` mà không cần join với `dim_product`**. Một rule reconciliation nội bộ bắt được lỗi tham chiếu ngoại — đây là kiểu kiểm soát chéo mà hệ thống thật cần có.

### 6.7. BA CHỈ SỐ — và chỉ số nào chấm được ai

**(a) DQ Score — cắt theo THÁNG và KHO** *(không cắt theo nhân viên, xem (c))*

`fact_sales_orders`: **10 dòng bẩn / 452 = DQ Score 97,79%**
`fact_inventory_EOM`: **15 dòng bẩn / 865 = DQ Score 98,27%**

| Tháng | Dòng | Bẩn | DQ% | | Kho | Dòng | Bẩn | DQ% |
|---|---|---|---|---|---|---|---|---|
| 2026-01 | 69 | 1 | 98,55% | | WH_DN | 103 | 1 | 99,03% |
| 2026-02 | 56 | 2 | 96,43% | | WH_HCM | 115 | 2 | 98,26% |
| 2026-03 | 77 | 2 | 97,40% | | WH_DA | 119 | 3 | 97,48% |
| **2026-04** | 72 | 3 | **95,83%** | | **WH_HN** | 114 | 4 | **96,49%** |
| 2026-05 | 104 | 1 | 99,04% | | WH_OLD | 1 | 0 | 100% |
| 2026-06 | 74 | 1 | 98,65% | | | | | |

⚠️ Với 10 dòng bẩn trải trên 6 tháng và 4 kho, **chênh lệch giữa các nhóm là nhiễu, không phải tín hiệu.** Trình bày như một bảng theo dõi, **không** kết luận "tháng 4 tệ nhất".

**(b) Process Violation Score — chấm theo NHÂN VIÊN**

Tổng: **63 dòng / 452 = 13,94%** *(Khách Inactive 23 · Item Discontinued 41 · Kho WH_OLD 1; cộng dồn 65, union 63 do 2 dòng dính 2 loại)*

| Nhân viên | Dòng bán | Vi phạm | **% vi phạm** |
|---|---|---|---|
| **NV Dũng** | 109 | 21 | **19,3%** |
| NV Bình | 114 | 17 | 14,9% |
| NV An | 115 | 14 | 12,2% |
| **NV Chi** | 114 | 11 | **9,6%** |

> ⚠️ **Kiểm định chi-square: χ² = 4,716; p = 0,194.** Chênh lệch gấp 2 lần giữa NV Dũng và NV Chi **KHÔNG có ý nghĩa thống kê** ở mức 5%. Với cỡ mẫu này, chưa đủ bằng chứng để nói NV Dũng vi phạm nhiều hơn NV Chi.
>
> **Phải ghi con số p này lên dashboard.** Xếp hạng nhân viên bằng một chênh lệch không có ý nghĩa thống kê là cách nhanh nhất để mất niềm tin của người bị chấm.

**(c) Vì sao KHÔNG chấm DQ Score theo nhân viên**

Chỉ có **3 dòng** thuộc loại lỗi mà nhân viên thực sự gây ra:

| Dòng | OrderNo | Nhân viên | Lỗi |
|---|---|---|---|
| 133 | SO2606-0087 | NV An | `UnitPrice = 0` |
| 249 | SO2601-0088 | NV Bình | `DiscountPct = 65%` |
| 451 | SO2605-**9999** | NV An | `QtyOrder = 900` |

Chấm 4 người trên 3 dòng ⇒ NV Chi và NV Dũng đạt 100% không phải vì cẩn thận hơn, mà vì 3 lỗi tình cờ không rơi vào họ. **Với n = 3, mọi khác biệt đều là nhiễu.** Các cờ còn lại (dòng trùng, orphan FK) là lỗi hệ thống — quy cho nhân viên là vu oan.

### 6.8. CHECKLIST RULE KIỂM TRA

**🔴 Hard block — chặn cứng tại hệ thống nguồn**

| # | Rule | Bắt được vấn đề |
|---|---|---|
| H1 | Fact table phải có **surrogate primary key** do hệ thống sinh | #1 |
| H2 | Chặn insert bản ghi **giống hệt** một bản ghi đã tồn tại | #2 |
| H3 | `CustomerCode`, `ItemCode`, `WarehouseCode` phải tồn tại trong dim tương ứng | #3 |
| H4 | `UnitPrice > 0` | #4 |
| H5 | `OnHandQty ≥ 0` tại thời điểm chốt sổ | #7 |
| H6 | Ép kiểu `date` cho mọi cột ngày tại tầng ETL | #8 |
| H7 | Chặn mã đơn có hậu tố sentinel (`9999`, `0000`) — dấu hiệu dữ liệu test lọt production | #6 |
| H8 | Không cho chọn master có `Status ≠ Active` khi tạo đơn | Tầng quy trình |
| **H9** | **`QtyDelivered ≤ OnHandQty(Item, Warehouse)` tại thời điểm giao** — rule đối chiếu chéo 2 bảng fact | #6 |

**🟡 Soft warning — cảnh báo, cho phép ghi đè có duyệt**

| # | Rule | Ngưỡng | Bắt được |
|---|---|---|---|
| S1 | Chiết khấu bất thường | `DiscountPct > 20%` *(P95 = P99 = 10%)* | #5 |
| S2 | Số lượng bất thường | `QtyOrder > 3 × P99` theo từng item | #6 |
| S3 | Bán dưới giá vốn | `UnitPrice × (1 − Disc) < StandardCost` | #4, #5 |
| S4 | Giao trễ | `ActualDeliveryDate > DeliveryDueDate` | OTD 37,27% |

**📘 Ghi vào tài liệu — không chặn được bằng rule kỹ thuật**

| # | Nội dung |
|---|---|
| D1 | Data dictionary phải phân biệt `fact.Salesperson` (NV bán đơn) vs `dim_customer.Salesperson` (NV phụ trách KH) — #9 |
| D2 | Reconcile **phạm vi** của `plan_monthly_sales` với fact trước khi publish KPI kế hoạch — #10 |
| D3 | Không lưu cột dẫn xuất `InventoryValue`; tính bằng measure — #11 |

**Q11 — Chỉ số kỳ vọng sau khi áp rule:**

| Chỉ số | Hiện tại | Sau H1–H9 | Ghi chú |
|---|---|---|---|
| DQ Score (SO) | 97,79% | **100%** | H2, H3, H4, H7, H9 bắt hết 10 dòng |
| DQ Score (INV) | 98,27% | **100%** | H3, H5 bắt hết 15 dòng |
| PV Score | 13,94% | **0%** | H8 chặn tại nguồn |
| Reconciliation tồn kho | 99,88% | **100%** | H3 loại bỏ orphan |

### 6.9. Nguyên tắc xử lý xuyên suốt

> **Gắn cờ (flag), không xóa (delete).**
> Xóa dòng fact làm sai tổng doanh thu và **mất bằng chứng để quy trách nhiệm**. Thêm cột `Flag_*` và một dim "Unknown" giữ nguyên tính toàn vẹn số liệu, đồng thời cho phép người dùng bật/tắt để so sánh.

**Ngoại lệ duy nhất:** dòng trùng hoàn toàn (`SO2602-0137 | LineNo 1`, index 450) — xóa 1 bản.

**Không áp dụng cho:** 48 dòng cùng `OrderNo+LineNo` khác nội dung. Chúng **không phải lỗi**, không cần cờ, không được xóa. Chỉ cần surrogate key.

### 6.10. Những gì Dashboard 3 KHÔNG trả lời được

Đưa phần này lên dashboard. Nó cho thấy bạn hiểu giới hạn của dữ liệu.

| Câu hỏi | Vì sao không trả lời được |
|---|---|
| **Vì sao `VT018` tồn âm?** | `fact_inventory_EOM` là **snapshot cuối tháng**, không có bảng phát sinh nhập/xuất. Phát hiện được *"có âm"*, không truy được *"âm vì giao dịch nào"* |
| **Ai nhập sai dòng `UnitPrice = 0`?** | Không có cột `CreatedBy` / `ModifiedAt`. `Salesperson` là người bán, không chắc là người nhập |
| **Vì sao `OrderNo` bị trùng?** | Không có log hệ thống. Chỉ kết luận được *"không phải khóa"*, không biết cơ chế sinh mã |
| **Vì sao `QtyOrder = 900`?** | Chứng minh được *"dòng này sai"* (bất khả thi vật lý), nhưng **không biết vì sao sai**: gõ nhầm 90→900? 9→900? hay bản ghi test lọt vào? Không có `CreatedBy`, không có log |
| **Plan lập theo cơ sở nào?** | Không có metadata. Chỉ chứng minh được nó **không cùng phạm vi** với fact |

### 6.11. Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  MỤC TIÊU (text box, 1 câu)                                      │
├─────────────┬─────────────┬─────────────┬────────────────────────┤
│  DQ Score   │  PV Score   │ Sai lệch    │  Sai lệch nếu          │
│  SO 97,79%  │   13,94%    │ nếu KHÔNG   │  DEDUPE SAI            │
│  INV 98,27% │             │ làm sạch    │  −5,63% (−293,1 tr)    │
│             │             │  +2,82%     │        ⚠️              │
├─────────────┴─────────────┴─────────────┴────────────────────────┤
│  Q4+Q5: WATERFALL doanh thu (có nhánh đối chứng "dedupe sai")    │
├──────────────────────────────────┬───────────────────────────────┤
│  Q6+Q8: MA TRẬN 3 TẦNG LỖI       │  Q7: RECONCILIATION tồn kho   │
│  Dữ liệu · Quy trình · Thiết kế  │  864/865 khớp · 1 dòng lệch   │
│  (ai sửa)                        │  = VT999 (tự phát hiện orphan)│
├──────────────────────────────────┴───────────────────────────────┤
│  Q1+Q2+Q3: BẢNG AUDIT — 11 vấn đề                                │
│  (cột "hint?" đánh dấu 5 vấn đề tự tìm ra)                       │
├──────────────────────────────────┬───────────────────────────────┤
│  Q9: DQ Score theo tháng/kho     │  Q9: PV Score theo NHÂN VIÊN  │
│  ⚠️ ghi rõ: chênh lệch là nhiễu  │  ⚠️ ghi rõ: χ²=4,716; p=0,194 │
├──────────────────────────────────┴───────────────────────────────┤
│  Q10+Q11: CHECKLIST — 9 Hard block · 4 Soft warning · 3 Ghi chú  │
├──────────────────────────────────────────────────────────────────┤
│  §6.10: Những gì trang này KHÔNG trả lời được                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. THỨ TỰ THỰC HIỆN ĐỀ XUẤT

1. **Convert `LastReceiptDate`** từ Excel serial → date. *(Nếu bỏ qua, mọi phân tích aging sai.)*
2. **Điều tra 50 dòng trùng khóa** → xóa 1 dòng trùng thật (index 450), sinh surrogate key ở ETL. Giữ nguyên 48 dòng còn lại — chúng không phải lỗi.
3. **Thêm dòng "Unknown"** vào `dim_customer` (KH999) và `dim_product` (VT999). Không xóa dòng fact.
4. **Gắn cờ** các dòng vi phạm DQ02, DQ04 (không xóa).
5. ~~Chốt các định nghĩa~~ — **ĐÃ CHỐT:** Dashboard 1 dùng `dim_customer.Region`; Dashboard 2 dùng `dim_warehouse.Region`; kênh Nội bộ **có** tính vào Revenue Net; `Salesperson` lấy từ `fact_sales_orders`.
6. **Chuẩn hóa grain của plan** — tổng hợp fact lên mức Tháng × Region × Category, hoặc dựng bridge table nếu làm Power BI.
7. Xây measure theo §2.
8. Dựng 3 dashboard.

---

## 8. QUYẾT ĐỊNH TRIỂN KHAI

### 8.1. Trạng thái các quyết định

| # | Câu hỏi | Trạng thái |
|---|---|---|
| 1 | Kênh "Nội bộ" có tính vào Revenue không? | ✅ **CÓ tính.** `Channel` là giá trị dimension, dùng làm slicer |
| 2 | `Region` = vùng khách hay vùng kho? | ✅ **DB1 = `dim_customer.Region` · DB2 = `dim_warehouse.Region`** |
| 3 | `Salesperson` lấy từ đâu? | ✅ **`fact_sales_orders`** (NV bán đơn) |
| 4 | KPI "% đạt kế hoạch" trình bày thế nào? | ✅ **Achievement Index** (chuẩn hóa = 100), % thô vào tooltip |
| 5 | `QtyOrder = 900` — giữ hay loại? | ✅ **Loại, có căn cứ vật lý** (§6.4b). Không phải outlier |
| 6 | 63 dòng bán cho master inactive — tính vào DQ Score? | ✅ **Không.** Tách thành **Process Violation Score** riêng |
| 7 | 48 dòng cùng `OrderNo+LineNo` — dòng bẩn? | ✅ **Không.** `OrderNo` chưa từng là khóa (§6.3) |
| 8 | **Output cuối cùng** | ✅ **Power BI, định dạng PBIP (TMDL + PBIR)**, dựng bằng Agent Skills for Power BI |

### 8.2. Ghi chú về công cụ — trạng thái tại 07/2026

⚠️ **Phân biệt hai thứ hay bị gọi chung là "Fabric AI skills":**

| Tên | Chức năng | Trạng thái |
|---|---|---|
| **Fabric data agent** | Hỏi–đáp hội thoại trên dữ liệu OneLake (lakehouse, warehouse, semantic model, KQL DB) | **GA** — nhưng **không tạo được report** |
| **Agent Skills for Power BI** | Tạo semantic model, trang report, layout, **file PBIR**, publish, cải tiến lặp | **Preview** (công bố tại Build 06/2026) |

Công cụ cần dùng là **Agent Skills for Power BI**. Skills hướng dẫn trợ lý AI (GitHub Copilot CLI, VS Code Copilot, Claude Code, Cursor, Windsurf) cách làm việc đúng với Fabric; **MCP server** cấp quyền thao tác thực (vd. Power BI Modeling MCP để dựng semantic model). Bộ skill gồm: *PBI report authoring · report design · report planner & management · semantic model authoring*.

**Trạng thái PBIR:** mặc định trong Power BI Service từ 01/2026, trong Desktop từ bản 03/2026. **Vẫn ở Preview; GA dự kiến Q3/2026.** Với bài nộp thì không vấn đề; với hệ thống production cần biết rằng định dạng đang là *default nhưng chưa GA*.

**Lợi thế của PBIP cho bài này:** mọi visual, page, measure là file JSON/TMDL riêng, có JSON schema công khai ⇒ **review được như code**, diff được, đưa vào Git được. Với một bài case study cần chứng minh tính chặt chẽ, đây là lợi thế lớn hơn một file `.pbix` nhị phân.

### 8.3. Hệ quả kỹ thuật của việc chọn PBIP

Sáu vấn đề đã phát hiện trong tài liệu này đều **để lại dấu vết trong PBIP** — cần xử lý ở đúng tầng:

| Vấn đề | Tầng xử lý | Việc cụ thể |
|---|---|---|
| **Không có khóa tự nhiên** (§6.3) | Power Query | Thêm `Index Column` làm surrogate key. **Không** dùng `Remove Duplicates` trên `OrderNo`+`LineNo` |
| **`LastReceiptDate` là serial number** | Power Query | `Date.From(Number.From([LastReceiptDate]))` — làm **trước** mọi bước khác |
| **Orphan `KH999`, `VT999`** | TMDL | Power BI tự tạo dòng trống khi vi phạm quan hệ. Nên **thêm dòng "Unknown" tường minh** vào dim để tổng doanh thu vẫn khớp 5.208.670.650 |
| **Plan khác grain fact** | TMDL | `plan_monthly_sales` ở grain Month × Region × Category. Cần **bridge table** hoặc quan hệ many-to-many. Không join trực tiếp vào `fact_sales_orders` |
| **Hai định nghĩa `Region`** | TMDL | **Không** gộp thành một dim Region dùng chung. Giữ `dim_customer[Region]` cho DB1 và `dim_warehouse[Region]` cho DB2. Nếu cần một dim chung thì dùng **role-playing dimension** với hai quan hệ inactive + `USERELATIONSHIP` |
| **`InventoryValue` là cột dẫn xuất** | TMDL | Không import cột này. Tính bằng measure: `SUMX(fact_inventory_EOM, [OnHandQty] * RELATED(dim_product[StandardCost]))` |

**Bốn measure cần cẩn thận khi viết DAX:**

| Measure | Bẫy |
|---|---|
| `Gross Margin %` | Mẫu số phải là doanh thu của **các dòng có `StandardCost`** (5.171.840.150), không phải tổng Revenue Net. Nếu để DAX tự bỏ qua BLANK, GM% bị thổi lên 17,76% thay vì 17,18% |
| `Fill Rate` | Lọc `DocStatus IN {"Completed","Open"}` — không phải chỉ `Completed` |
| `Achievement Index` | Mẫu số là tỷ lệ đạt **toàn cục** (6,07%), phải dùng `ALL()` để thoát filter context |
| `MOC` | `DIVIDE()` để tránh chia 0; item có `sold6m = 0` phải trả về BLANK, không phải `∞` |

### 8.4. Còn treo

| # | Câu hỏi |
|---|---|
| 1 | Có được phép thêm chỉ số ngoài danh sách KPI đề bài (Achievement Index, PV Score, MOC) không? |
| 2 | Bài nộp có yêu cầu kèm file làm sạch (Excel/CSV) bên cạnh PBIP không? |
| 3 | Có cần deploy lên Fabric workspace, hay chỉ nộp thư mục PBIP + Git repo? |

---

*Toàn bộ số liệu trong tài liệu này được tính trực tiếp từ `Data_set.xlsx` bằng pandas. Các con số "sau làm sạch" áp dụng: xóa 1 dòng trùng hoàn toàn (index 450), loại 1 dòng outlier `QtyOrder = 900`, giữ nguyên 48 dòng cùng `OrderNo+LineNo` khác nội dung (không phải lỗi), giữ nguyên các dòng orphan và master inactive.*