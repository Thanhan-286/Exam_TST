# BI Case Study — Phân phối phụ tùng ô tô

Ba dashboard Power BI trên dữ liệu bán hàng + tồn kho, kỳ **01–06/2026**.
Stack: **Supabase (PostgreSQL) → Power BI PBIP (TMDL + PBIR) → Git**.
Dựng bằng **Claude Code + Agent Skills for Power BI**.

---

## 🤖 Nếu bạn là AI agent: đọc theo thứ tự này

| # | File | Vì sao |
|---|---|---|
| 1 | **`CLAUDE.md`** | 9 ràng buộc **không được vi phạm**. Đọc trước tiên |
| 2 | **`ERRATA.md`** | 6 sai lệch giữa `analysis.md` và dữ liệu thật. **3 cái sẽ làm bạn viết sai DAX** |
| 3 | `docs/analysis.md` | Nguồn sự thật về nghiệp vụ. Layout ở §4.5, §5.7, §6.9 |
| 4 | `docs/model-spec.md` | 13 bảng · 15 quan hệ · ~30 measure với DAX nguyên văn |
| 5 | `design/visual-map.md` | Hợp đồng thiết kế: block → visual type + field wells |
| 6 | `SETUP.md` | Cài plugin, prompt cho từng phase |

**Đừng đọc `db/migrations/001b_seed.sql`** — 139 KB `INSERT` statement, không có thông tin gì.

---

## Trạng thái

| Phase | Việc | Trạng thái |
|---|---|---|
| 0 | Spike kết nối Power BI ← Supabase | ⏳ Người dùng chạy |
| 1 | Supabase schema (`raw` → `stg` → `mart` + `audit`) | ✅ **Xong, đã test** |
| 2 | Load + reconcile | ✅ **20/20 assert xanh** |
| 3 | Claude Design → `palette.md`, `spec.md`, 3 screenshot | ⏳ **Đang chờ** |
| 4 | Semantic model (TMDL) | 🔜 **Không bị chặn — làm được ngay** |
| 5 | Report (PBIR) | 🔒 Chặn bởi Phase 3 |
| 6 | Đóng gói | 🔒 |

---

## Kiến trúc

```
data/Data_set.xlsx  (452 + 865 + 36 + 40 + 5 + 108 + 6 dòng)
     │
     ▼
┌──────────────────────────────────────────────────────┐
│ SUPABASE                                             │
│                                                      │
│ raw.*    Ảnh chụp hiện trường. 0 constraint.         │
│          Dòng trùng, tồn âm, orphan FK — GIỮ NGUYÊN  │
│    │                                                 │
│ stg.*    Cast date, surrogate key, 9 cờ.             │
│          Thêm member "Unknown". Không xóa dòng nào   │
│    │                                                 │
│ mart.*   ← Power BI đọc (role `pbi_reader`, SELECT)  │
│          Đã làm sạch: xóa 1 dòng trùng, 1 dòng       │
│          bất khả thi. GIỮ 48 dòng cùng OrderNo       │
│    │                                                 │
│ audit.*  Rule thành CHECK / FK / TRIGGER chạy được   │
└──────────────────────────────────────────────────────┘
     │  PostgreSQL connector · Session Pooler · SSL Require · Import
     ▼
pbip/  Model.SemanticModel (TMDL)  +  Report.Report (PBIR)
```

**Vì sao Supabase cho 1.317 dòng?** Không phải vì dữ liệu lớn. Vì nó biến 9 Hard block rule
từ *lời khuyên trong slide* thành `CHECK` / `FOREIGN KEY` / `TRIGGER` **chạy được, test được**.
Đặc biệt **H9** (`QtyDelivered ≤ OnHandQty`) — rule đối chiếu chéo hai bảng fact.
Power Query không làm được. Đó là lý do duy nhất, và nó đủ.

---

## Nghịch lý đã giải: "flag, don't delete" vs. constraint

`analysis.md` §6.7 nói **gắn cờ, không xóa** — dữ liệu bẩn phải vào được để còn làm bằng chứng.
`analysis.md` §6.6 nói `CHECK (unit_price > 0)`.

Hai điều này đá nhau. Giải bằng **3 schema**: `raw` không constraint (nhận rác),
`stg` gắn cờ, `mart` làm sạch. Constraint thật sống ở `audit.fact_sales_validated` —
một bảng ta **cố tình** INSERT 452 dòng vào để xem rule nào chặn dòng nào.

```
8/10 dòng bẩn bị chặn cứng
  index 450  H2  duplicate key violates unique constraint
  index 451  H9  qty_delivered=900 vượt tồn tối đa 300 của (VT005, WH_HCM)
  index  54  H3  violates foreign key constraint ...

index  20 vào được → ĐÚNG (bản gốc của cặp trùng)
index 249 vào được → ĐÚNG (S1 là soft warning)

H8 chặn đúng 63 dòng → PV Score 13,94% → 0%
```

Không phải bảng audit tĩnh. Là output của một test suite.

---

## Bảng số vàng

Chạy `psql "$DATABASE_URL" -f db/migrations/005_reconcile.sql`. **20/20 phải xanh.**

| Metric | Giá trị |
|---|---|
| Revenue Net | **5.208.670.650** |
| Gross Margin | 888.400.150 |
| Gross Margin % | **17,18%** *(mẫu số 5.171.840.150 — không phải Revenue Net)* |
| Fill Rate | 87,21% |
| On-time Delivery | 37,27% (n=330) |
| Inventory Value EOM | 6.391.770.000 |
| Slow & Heavy | 9 item · 2.402.800.000 |
| DQ Score SO / INV | 97,79% / 98,27% |
| PV Score | 13,94% |
| **⚠️ Nếu dedupe sai** | **4.915.616.000 (−5,63%)** |

Assert cuối cùng là cái quan trọng nhất. Nó chứng minh **cái bẫy tồn tại thật**:
`drop_duplicates(['OrderNo','LineNo'])` xóa 26 giao dịch thật và làm bốc hơi
**293.054.650 VNĐ** doanh thu hợp lệ. `OrderNo` chưa từng là khóa — 97,6% đơn nhiều dòng
chứa hơn một khách hàng.

---

## Cây thư mục

```
├─ CLAUDE.md              ràng buộc bất biến cho agent
├─ ERRATA.md              6 sai lệch đã kiểm chứng — ĐỌC TRƯỚC KHI VIẾT DAX
├─ SETUP.md               cài plugin, prompt từng phase
├─ RUNBOOK.md             cách chạy không cần cài gì
├─ run_all.sh             chạy toàn bộ (cần psql)
├─ data/Data_set.xlsx
├─ db/migrations/
│   ├─ 001_raw.sql          7 bảng, 0 constraint
│   ├─ 001b_seed.sql        1.512 dòng INSERT (dùng khi không có Python)
│   ├─ 002_stg.sql          cast, surrogate key, cờ
│   ├─ 003_mart.sql         view Power BI đọc + role pbi_reader
│   ├─ 004_audit.sql        rule → constraint + trigger
│   ├─ 005_reconcile.sql    ⭐ 20 assert. Chạy sau MỌI thay đổi
│   └─ 006_mart_audit.sql   lớp mart cho Dashboard 3
├─ etl/
│   ├─ load.py              Excel → raw (thay thế bởi 001b_seed.sql)
│   ├─ reconcile.py         thay thế bởi 005_reconcile.sql
│   └─ prove_rules.py       ⭐ chứng minh rule chặn được lỗi. Không có bản SQL
├─ docs/
│   ├─ analysis.md          nguồn sự thật
│   └─ model-spec.md        đặc tả semantic model
├─ design/
│   ├─ visual-map.md        hợp đồng thiết kế (khóa)
│   ├─ README.md            prompt cho Claude Design
│   ├─ palette.template.md
│   └─ spec.template.md
└─ pbip/                   Claude Code sinh ra ở Phase 4–5
```

---

## Bốn cái bẫy lớn nhất

1. **`OrderNo + LineNo` không phải khóa.** Dedupe theo nó → −293.054.650 VNĐ (−5,63%).
   Chỉ xóa `src_row_index = 450`.
2. **Mẫu số `Gross Margin %`** = doanh thu các dòng CÓ `standard_cost` (5.171.840.150).
   `BLANK()` trong phép trừ hành xử như `0` ⇒ DAX ngây thơ cho 17,76% thay vì 17,18%.
3. **`MOC` dùng filter thứ ba** — `doc_status IN ('Completed','Return')`. Khác Revenue Net,
   khác Fill Rate. Dùng nhầm ra 6 item Slow&Heavy thay vì 9. (`ERRATA.md` E2)
4. **`Region` có hai nghĩa.** Dashboard 1 = vùng khách hàng. Dashboard 2 = vùng kho.
   65,7% số dòng lệch nhau. Không được gộp thành một dim.

---

## Bắt đầu

1. `RUNBOOK.md` Bước 1–2 — chạy SQL, kiểm 20/20
2. `RUNBOOK.md` Bước 3 — **Gate 0**: Power BI Desktop có đọc được Supabase không?
   *(2 tiếng. Đây là chỗ dễ sập nhất. Làm trước khi dựng bất cứ thứ gì.)*
3. `SETUP.md` — cài `powerbi-authoring` plugin, chạy Phase 4
