# Errata — sai lệch giữa `analysis.md` và `Data_set.xlsx`

Phát hiện khi verify từng con số bằng pandas + Postgres, ngày 09/07/2026.
**Bốn cái là lỗi trong `analysis.md`. Một cái là lỗi trong `implementation-plan.md` (do tôi).**

Không cái nào làm sai Revenue Net, GM, Fill Rate, OTD. Nhưng ba cái đầu sẽ làm
Claude Code viết sai DAX hoặc sai DDL nếu không biết trước.

---

## E1 — `fact_inventory_EOM` **KHÔNG có** cột `StandardCost` *(lỗi của plan)*

DDL tôi phác ở `implementation-plan.md` §4.1 có `standard_cost numeric` trong
`raw.fact_inventory_eom`. **Sai.** Sheet chỉ có 8 cột:

```
MonthEnd · ItemCode · WarehouseCode · OnHandQty · InventoryValue
· SafetyStock · LastReceiptDate · StockStatusNote
```

`StandardCost` sống ở `dim_product`.

**Hệ quả cho `analysis.md` §6.6.** Tài liệu viết:

> *"nó **tự phát hiện ra orphan `VT999` mà không cần join với `dim_product`**"*

**Không đúng.** Phép kiểm `InventoryValue == OnHandQty × StandardCost` **bắt buộc**
phải join `dim_product` để lấy `StandardCost`. Giá trị của rule vẫn còn — nó bắt được
lỗi tham chiếu ngoại bằng một phép đối chiếu số học — nhưng nó **không** hoạt động
mà không cần join. Đã sửa cách phát biểu trong `004_audit.sql`.

Đã verify: `864/865` khớp. Dòng lệch = `VT999` (không có `standard_cost` ⇒ NULL).

---

## E2 — ⚠️ `MOC` dùng filter **thứ ba**, khác cả Revenue Net lẫn Fill Rate

`analysis.md` §5.1 chỉ viết:

```
MOC = OnHandQty(EOM T6) ÷ (Σ QtyDelivered 6 tháng ÷ 6)
```

Không nói `Σ QtyDelivered` lấy trên những `DocStatus` nào. Tôi thử **sáu** định nghĩa;
chỉ **một** tái lập đúng bảng 9 item / 2.402.800.000 của §5.2:

| Định nghĩa `sold6m` | VT023 | VT011 | VT014 | VT021 | VT007 | Slow&Heavy |
|---|---|---|---|---|---|---|
| `<> 'Cancelled'` | 170 | 130 | 55 | 151 | 194 | 6 item · 1,41 tỷ ✗ |
| `IN (Completed, Open)` | 170 | 130 | 56 | 151 | 194 | 6 item ✗ |
| `= 'Completed'` | 123 | 123 | 20 | 143 | 201 | ✗ |
| **`IN (Completed, Return)`** | **123** | **123** | **19** | **143** | **187** | **9 item · 2.402.800.000** ✅ |
| *(analysis.md §5.2 ghi)* | 123 | 123 | 19 | 143 | 187 | 9 item · 2.402.800.000 |

**Ba filter khác nhau trong cùng một semantic model:**

| Metric | Filter |
|---|---|
| Revenue Net | `doc_status <> 'Cancelled'` → Completed + Open + Return |
| Fill Rate | `doc_status IN ('Completed','Open')` |
| **`sold6m` / MOC** | **`doc_status IN ('Completed','Return')`** |

Hợp lý về nghiệp vụ: hàng đã xuất kho thật = Completed, trừ đi hàng khách trả về =
Return (Qty âm). Đơn `Open` chưa giao xong nên chưa trừ tồn.

Nhưng nếu Claude Code viết `MOC` bằng filter của Revenue Net, nó ra **6 item /
1.409.200.000** thay vì 9 item / 2.402.800.000, và Dashboard 2 mất một phần ba
kết luận. Đã ghi rõ trong `003_mart.sql`, view `mart.item_moc`.

---

## E3 — `Avg Days Late = 2,0 ngày` là **trung bình độ trễ**, không phải "trung bình số ngày trễ"

`analysis.md` §2.4 ghi: *"`Avg Days Late` = **2,0 ngày** (median 1, max 7)"*.

Phân bố thật của `actual_delivery_date − delivery_due_date` trên 330 dòng đã giao:

| Ngày | −1 | 0 | 1 | 2 | 3 | 7 |
|---|---|---|---|---|---|---|
| Số dòng | 31 | 92 | 53 | 46 | 51 | 57 |

- Trên **cả 330 dòng** (kể cả giao sớm/đúng hạn): mean **2,02** · median **1** · max **7** → khớp §2.4
- Trên **207 dòng thực sự trễ** (`> 0` ngày): mean **3,37** · median **3** · max **7**

Đúng: `123/330 = 37,27%` giao đúng hạn ⇒ **207 đơn trễ**.

Nhãn "Days Late" gợi ý mẫu số là *đơn trễ*, nhưng con số 2,0 lại tính trên *toàn bộ
đơn đã giao*. **Hai chỉ số khác nhau, phải đặt tên khác nhau:**

- `Avg Delivery Delay` = **2,0 ngày** (n = 330) — độ trễ trung bình của mọi đơn đã giao
- `Avg Days Late` = **3,4 ngày** (n = 207) — trung bình số ngày trễ, tính trên đơn trễ

Nếu hiện trên dashboard, nên hiện cái thứ hai — nó mới trả lời "trễ thì trễ bao lâu".

---

## E4 — Bẫy GM% 17,76% được xác nhận, nhưng cơ chế cụ thể hơn §4.2 mô tả

Có **ba** con số, không phải hai:

| Cách tính | GM% |
|---|---|
| ✅ Đúng: GM và mẫu số cùng lấy trên 399 dòng có `standard_cost` | **17,18%** |
| ❌ Bẫy §4.2: coi `COGS(VT999) = 0` ⇒ GM phồng lên 925.230.650, chia tổng Revenue Net | **17,76%** |
| ❌ Bẫy khác: GM đúng (888.400.150) nhưng chia tổng Revenue Net (gồm cả VT999) | 17,06% |

Con số 17,76% trong `analysis.md` **chính xác**. Nhưng nguyên nhân là **COGS bị coi
= 0**, không phải "mẫu số sai". Hai lỗi khác nhau cho hai kết quả khác nhau.

DAX `SUMX(fact, [QtyDelivered] * RELATED(dim_product[StandardCost]))` trả BLANK cho
VT999, và `BLANK()` trong phép trừ hành xử như `0` ⇒ rơi thẳng vào bẫy 17,76%.
Phải lọc `NOT ISBLANK(StandardCost)` ở **cả tử lẫn mẫu**.

---

## E5 — `DQ Score SO = 97,79%` đúng, nhưng "10 dòng bẩn" ≠ "10 dòng bị chặn"

Tập 10 dòng bẩn: `{20, 54, 77, 133, 155, 179, 221, 249, 450, 451}` — đã verify.

Lưu ý `index 97` (`WH_OLD`, "Kho không hoạt động") **không** nằm trong tập này, dù cột
`Note` có đánh dấu nó. Đúng: đó là **Process Violation**, không phải lỗi dữ liệu (§6.2).
Bản ghi hoàn toàn chính xác.

Nhưng khi chạy `prove_rules.py`, chỉ **8/10** dòng bị Hard block chặn:

| Dòng | Kết quả | Vì sao |
|---|---|---|
| `20` | **Vào được** | Bản **đầu** của cặp trùng. H2 chặn bản **thứ hai** (450). Sau đó dòng 20 là giao dịch thật, duy nhất — không còn là lỗi |
| `249` | **Vào được** | `discount 65%` thuộc rule **S1 (soft)**. DB **cố ý** không chặn: §6.8 nói "cảnh báo, cho phép ghi đè có duyệt" |

Vậy phát biểu *"DQ Score → 100%"* của §6.8 (Q11) đúng, nhưng phải kèm điều kiện:
*8 dòng bị chặn cứng; dòng 20 là bản gốc hợp lệ; dòng 249 được duyệt qua soft warning.*

**Phát hiện phụ, đáng giá:** `H8` (master phải Active) chặn **đúng 63 dòng** — khớp
chính xác PV Score `63/452 = 13,94%`. Xác nhận §6.2 phân tầng đúng.

---

## E6 — Bẫy kỹ thuật: trigger `BEFORE INSERT` chạy **trước** khi Postgres kiểm FOREIGN KEY

Không nằm trong `analysis.md` — phát hiện khi implement.

Bản đầu của H9 raise exception khi không tìm thấy dữ liệu tồn kho cho cặp
`(item, warehouse)`. Kết quả: dòng 77 và 179 (`VT999`) bị H9 chặn với thông báo
*"không có dữ liệu tồn kho"*, **nuốt mất lỗi H3/FK thật**. Dòng 97 (`WH_OLD`) cũng
bị chặn oan — nó là PV, không phải DQ.

Sửa: khi `max_onhand IS NULL`, H9 `RETURN NEW` và để FK / H8 xử lý. H9 chỉ phát biểu
về trường hợp *có* dữ liệu tồn kho và số giao vượt quá.

Bài học tổng quát: **rule cross-table trong trigger phải im lặng ở những trường hợp
nằm ngoài phạm vi phát biểu của nó**, nếu không nó sẽ báo sai rule và khiến bảng audit
đổ lỗi nhầm chỗ.

---

## Tác động lên các artifact khác

| File | Cần sửa |
|---|---|
| `implementation-plan.md` §4.1 | Bỏ `standard_cost` khỏi `raw.fact_inventory_eom` ✅ đã sửa trong `001_raw.sql` |
| `implementation-plan.md` §4 (measure list) | `[MOC]` phải ghi rõ filter `IN (Completed, Return)` |
| `visual-map.md` §4.1 | Thêm `[Avg Days Late]` (n=207) vs `[Avg Delivery Delay]` (n=330) nếu muốn hiện |
| `analysis.md` §6.6 | Sửa phát biểu "không cần join `dim_product`" |
| `analysis.md` §5.1 | Bổ sung filter cho `MOC` |
| `analysis.md` §2.4 | Đổi tên `Avg Days Late` → `Avg Delivery Delay`, hoặc đổi mẫu số |
