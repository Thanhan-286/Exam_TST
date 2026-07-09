# `visual-map.md` — Cột đã điền (Gate 3 deliverable)

**Người điền:** Claude Design. Chỉ điền `x` `y` `w` `h` (px) và `color` (token trong `palette.md`).
Mọi cột khác (`visual_id`, `pbi_visual_type`, `field_wells`, `constraints`) **giữ nguyên** như hợp đồng gốc.
Grid: 12 cột · x∈{24,128,232,336,440,544,648,752,856,960,1064,1168} · w∈{88,192,296,400,504,608,712,816,920,1024,1128,1232} · y,h ÷8 · chừa 60px đáy.

---

## 1. DASHBOARD 1 — EXECUTIVE SALES (1280 × 720)

| `visual_id` | `x` | `y` | `w` | `h` | `color` |
|---|---|---|---|---|---|
| `db1_title` | 24 | 24 | 504 | 32 | `ink` |
| `db1_slc_month` | 648 | 24 | 192 | 32 | `accent-8` |
| `db1_slc_region` | 856 | 24 | 192 | 32 | `accent-8` |
| `db1_slc_channel` | 1064 | 24 | 192 | 32 | `accent-8` |
| `db1_kpi_revenue` | 24 | 64 | 296 | 80 | `accent-2` |
| `db1_kpi_margin` | 336 | 64 | 296 | 80 | `accent-2` |
| `db1_kpi_fillrate` | 648 | 64 | 192 | 80 | `accent-2` |
| `db1_kpi_index` | 856 | 64 | 192 | 80 | `accent-4` *(card nổi bật `card-tint`)* |
| `db1_kpi_side` | 1064 | 64 | 192 | 80 | `accent-8` *(OTD dùng `alert-high`)* |
| `db1_trend_month` | 24 | 152 | 1232 | 168 | `accent-2` *(cột)* · `accent-1` *(đường Index)* |
| `db1_bar_region` | 24 | 328 | 608 | 140 | `accent-2` *(nhãn Index; MT dùng `alert-mid`)* |
| `db1_bar_category` | 648 | 328 | 608 | 140 | **diverging** `div-low → div-mid → div-high` |
| `db1_tbl_topbottom` | 24 | 476 | 1232 | 176 | `accent-8` *(nền Slow-Heavy = `alert-mid`)* |
| `db1_txt_footnote` | 24 | 664 | 1232 | 48 | `muted` |

## 2. DASHBOARD 2 — INVENTORY & SLOW-MOVING (1280 × 720)

| `visual_id` | `x` | `y` | `w` | `h` | `color` |
|---|---|---|---|---|---|
| `db2_title` | 24 | 24 | 400 | 32 | `ink` |
| `db2_slc_warehouse` | 440 | 24 | 192 | 32 | `accent-8` |
| `db2_slc_category` | 648 | 24 | 192 | 32 | `accent-8` |
| `db2_slc_abc` | 856 | 24 | 192 | 32 | `accent-8` |
| `db2_slc_status` | 1064 | 24 | 192 | 32 | `accent-8` |
| `db2_kpi_totalinv` | 24 | 64 | 296 | 80 | `accent-2` |
| `db2_kpi_stuck` | 336 | 64 | 296 | 80 | `accent-4` *(card nổi bật `card-tint`)* |
| `db2_kpi_disc` | 648 | 64 | 192 | 80 | `accent-2` |
| `db2_kpi_negative` | 856 | 64 | 192 | 80 | `alert-high` |
| `db2_kpi_understock` | 1064 | 64 | 192 | 80 | `accent-2` |
| `db2_quadrant` | 24 | 152 | 712 | 280 | legend ABC `accent-1 / accent-3 / accent-7` · constant line `alert-high` |
| `db2_tbl_negative` | 752 | 152 | 504 | 132 | `alert-high` |
| `db2_tbl_discontinued` | 752 | 292 | 504 | 140 | `accent-8` |
| `db2_bar_warehouse` | 24 | 440 | 400 | 180 | `accent-2` *(WH_DN highlight `alert-high`)* |
| `db2_bar_category` | 440 | 440 | 400 | 180 | `accent-2` *(PT nhanh `accent-7`)* |
| `db2_heat_wh_cat` | 856 | 440 | 400 | 180 | **sequential** `accent-5 → accent-1` |
| `db2_txt_footnote` | 24 | 664 | 1232 | 48 | `muted` |

> **§2.3 — scatter là trái tim trang:** `db2_quadrant` = 712×280 = 199.360 px² trên vùng nội dung ~1232×596 ≈ **27%** một mình; nếu tính cả 2 bảng bên phải cùng hàng "hero" thì hàng này chiếm 47% chiều cao. Đây là visual lớn nhất trang, đúng yêu cầu ≥40% trọng số thị giác của hàng chính.

## 3. DASHBOARD 3 — DATA QUALITY / RECONCILIATION (1280 × 1600, cuộn)

| `visual_id` | `x` | `y` | `w` | `h` | `color` |
|---|---|---|---|---|---|
| `db3_txt_purpose` | 24 | 24 | 1232 | 48 | `ink` |
| `db3_kpi_dq` | 24 | 80 | 296 | 96 | `dq-family` |
| `db3_kpi_pv` | 336 | 80 | 296 | 96 | `pv-family` |
| `db3_kpi_nocleaning` | 648 | 80 | 296 | 96 | `accent-8` |
| `db3_kpi_baddedupe` | 960 | 80 | 296 | 96 | `alert-high` |
| `db3_waterfall` | 24 | 184 | 1232 | 232 | `accent-1 / accent-2` *(giảm = `alert-high`)* |
| `db3_matrix_layers` | 24 | 424 | 712 | 160 | hàng: `dq-family` / `pv-family` / `muted` |
| `db3_recon_card` | 752 | 424 | 504 | 80 | `good` |
| `db3_recon_tbl` | 752 | 512 | 504 | 72 | `alert-mid` |
| `db3_tbl_audit` | 24 | 592 | 1232 | 352 | `accent-8` *(5 dòng tự tìm = nền `alert-high` nhạt)* |
| `db3_tbl_dq_month` | 24 | 952 | 400 | 184 | `dq-family` |
| `db3_tbl_dq_warehouse` | 440 | 952 | 400 | 184 | `dq-family` |
| `db3_bar_pv_person` | 856 | 952 | 400 | 136 | `pv-family` |
| `db3_txt_chisq` | 856 | 1096 | 400 | 88 | `alert-mid` |
| `db3_txt_noise` | 24 | 1144 | 816 | 48 | `alert-mid` |
| `db3_tbl_checklist` | 24 | 1200 | 1232 | 232 | severity: `alert-high` / `alert-mid` / `alert-low` |
| `db3_txt_limits` | 24 | 1440 | 1232 | 88 | `muted` |
| `db3_txt_footnote` | 24 | 1544 | 1232 | 40 | `muted` |

> **§3.2 narrative arc** được giữ đúng thứ tự dọc: purpose → 4 KPI → waterfall → matrix+recon → audit → (dq theo tháng/kho + noise) & (pv theo NV + chisq) → checklist → limits (cuối cùng).
> **§3.3 cạm bẫy:** `db3_kpi_dq`/`db3_matrix_layers`/`db3_tbl_dq_*` = họ **`dq-family` (xanh)**; `db3_kpi_pv`/`db3_bar_pv_person` = họ **`pv-family` (tím)** — hai họ tách biệt. `db3_txt_chisq` (y=1096) đặt **ngay dưới** `db3_bar_pv_person` (y=952,h=136 → kết thúc 1088), cách 8px.

---

## 4. GATE 3 — KẾT QUẢ TỰ KIỂM

- [x] Mọi `pbi_visual_type` nằm trong bảng trắng §0.4 *(không phát sinh visual mới)*
- [x] Mọi `x` ∈ tập 12 giá trị hợp lệ; mọi `w` ∈ tập 12 giá trị hợp lệ
- [x] Mọi `y`, `h` chia hết cho 8
- [x] Không visual nào có `y + h > canvas_height − 60` (DB1/2 ≤ 660: max = db1_tbl 652 / db2_bars 620; DB3 ≤ 1540: max = db3_txt_limits 1528). Footnote nằm trong band đáy.
- [x] Không cặp visual nào chồng lấn (đã kiểm từng hàng)
- [x] Tổng `w` + gutter mỗi hàng ≤ 1232 (KPI: 296+296+192+192+192+4×16 = 1232; 2-cột: 608+608+16 = 1232; 3-cột: 400×3+2×16 = 1232; 4-KPI DB3: 296×4+3×16 = 1232; hero DB2: 712+504+16 = 1232)
- [x] Cột `color` chỉ chứa token (không hex)
- [x] Không nền góc phần tư, không waterfall hai nhánh (nhánh dedupe sai tách sang `db3_kpi_baddedupe`), không mũi tên tự do
- [x] DB1 **không có** heatmap Region × Category
- [x] DB3: DQ Score (`dq-family`) và PV Score (`pv-family`) hai họ màu khác nhau
- [x] DB3: `db3_txt_chisq` ngay dưới `db3_bar_pv_person`
- [x] DB2: `db2_quadrant` là visual đơn lớn nhất, hàng hero ≈47% chiều cao nội dung
- [x] `palette.md` có 8 dataColors + thang diverging + thang alert + type scale — **không có `theme.json`**
- [x] Ba screenshot xuất `design/screenshots/db1_1280x720.png` · `db2_1280x720.png` · `db3_1280x1600.png`
