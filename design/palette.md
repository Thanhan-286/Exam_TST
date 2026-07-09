# `palette.md` — Design tokens (RetailIQ Green, Power BI-legal)

**Font:** `Segoe UI` (Power BI–supported). Fallback: Tahoma, Verdana.
**Không dùng** Plus Jakarta Sans / Inter / gradient / bo góc ngoài theme.

---

## 1. dataColors (8) — dùng cho series phân loại

| Token | Hex | Dùng cho |
|---|---|---|
| `accent-1` | `#5F7D1F` | Xanh đậm — series chính / hạng A |
| `accent-2` | `#7FAE3E` | Xanh chủ đạo |
| `accent-3` | `#A9CF6B` | Xanh nhạt / hạng B |
| `accent-4` | `#CDEA52` | Lime nhấn (highlight, KPI card nổi) |
| `accent-5` | `#D7ECB0` | Xanh rất nhạt / nền |
| `accent-6` | `#8BB02F` | Xanh phụ |
| `accent-7` | `#E6B45A` | Hổ phách — nhấn / hạng C |
| `accent-8` | `#B6BFB0` | Xám trung tính |

## 2. Thang diverging — dùng cho GM% (mốc giữa 17,18%)

| Token | Hex | Nghĩa |
|---|---|---|
| `div-low` | `#D96A6A` | GM% thấp (≤ ~13%) — Lốp 11,76% |
| `div-mid` | `#C9D98A` | Quanh mốc 17,18% |
| `div-high` | `#5F7D1F` | GM% cao (≥ ~20%) — Hóa chất 21,6% |

## 3. Thang alert

| Token | Hex | Dùng cho |
|---|---|---|
| `alert-high` | `#D96A6A` | Tồn âm, dedupe sai, lỗi Hard |
| `alert-mid` | `#E6B45A` | Cảnh báo Soft, in-progress |
| `alert-low` | `#8A938B` | Ghi chú, mức thấp |
| `good` | `#3F9A5A` | Đạt, resolved, matched |

## 4. Hai họ màu tách biệt (bắt buộc §6.2) — KHÔNG trộn

| Token | Hex | Chỉ số |
|---|---|---|
| `dq-family` | `#7FAE3E` (xanh) | **DQ Score** — lỗi dữ liệu (đội nhập liệu) |
| `pv-family` | `#7A5FAE` (tím) | **PV Score** — vi phạm quy trình (đội bán hàng) |

## 5. Nền & chữ (neutral)

| Token | Hex |
|---|---|
| `page-bg` | `#EAF0EA` |
| `desk-bg` | `#DDE6DD` |
| `card-bg` | `#FFFFFF` |
| `card-tint` | `#EEF7DC` (KPI nổi bật) |
| `border` | `#E7ECE3` |
| `ink` | `#1B201B` |
| `ink-2` | `#4A544A` |
| `muted` | `#8A938B` |

## 6. Type scale (Segoe UI)

| Token | px / weight | Dùng |
|---|---|---|
| `type-kpi` | 26 / 700 | Số KPI lớn |
| `type-h` | 14 / 700 | Tiêu đề visual |
| `type-title` | 18 / 700 | Tiêu đề trang |
| `type-body` | 12 / 400–600 | Nội dung, bảng |
| `type-label` | 10–11 / 600 | Nhãn trục, header bảng |

## 7. Hình học

- Border radius card: **10px** (không tùy biến ngoài mức này).
- Border 1px `border`.
- Shadow: rất nhẹ hoặc không (Power BI). Không gradient.
- Canvas: DB1 1280×720 · DB2 1280×720 · DB3 1280×1600 (cuộn). Margin 24px.
