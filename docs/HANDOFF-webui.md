# HANDOFF — Xây Web UI React cho BI Case Study

**Cho:** agent tiếp nhận công việc dựng `webui/`.
**Ngày:** 10/07/2026. **Trạng thái:** Phase 0 + 1 XONG. Đang chờ user check UI, rồi làm tiếp Phase 2→7.

---

## 0. Đọc gì trước (theo đúng thứ tự)

1. `CLAUDE.md` — 9 ràng buộc BẤT BIẾN về dữ liệu/logic. **Không được vi phạm.**
2. `ERRATA.md` — 7 sai lệch đã kiểm chứng. E2 (3 filter doc_status), E7 (3 con số docs sai, webui dùng giá trị tính lại).
3. `docs/dataflow.md` — hợp đồng đọc `mart.*` / ghi `raw.*`. Backend ĐÃ hoàn thiện.
4. `docs/web-spec.md` — đặc tả web (một số quyết định cũ, đọc để hiểu bối cảnh).
5. `docs/analysis.md` §4/§5/§6 — nội dung + layout 3 dashboard, footnote nguyên văn.
6. `frontend/UI_demo/Inventory Dashboard.dc.html` — **template UI gốc** (764 dòng). Số liệu là DUMMY (Stuttgart DC, $18.4M...) nhưng component/CSS/SVG/animation là thứ cần port sang React.
7. `design/visual-map.md` + `design/palette.md` — layout px + token màu (bản Power BI, tham khảo bố cục).

## 1. Quyết định đã CHỐT với user (không đổi nếu không hỏi lại)

| Chủ đề | Chốt |
|---|---|
| Nguồn dữ liệu | Supabase **live** qua `@supabase/supabase-js` (không static JSON) |
| Chart | **SVG tự vẽ** theo phong cách UI_demo (KHÔNG dùng Recharts — user thích SVG của demo hơn) |
| Tương tác | Slicer **hoạt động thật** — measure tính lại client-side |
| Upload | Parse Excel trong browser (SheetJS), ghi thẳng `raw.*` bằng anon key. **Demo — không giấu key.** Không lưu file, chỉ đưa data vào DB |
| Vị trí | `bi-case-study/webui/`, deploy **Vercel**, thay thế deliverable Power BI |
| Ngôn ngữ UI | Tiếng Việt; tiêu đề dashboard giữ tiếng Anh như demo |
| Layout dashboard | **Compact first viewport**: user muốn ít scroll nhất; ưu tiên đưa slicer + KPI + chart chính vào một khuôn màn hình desktop |

**Lưu ý phạm vi:** đề thi (`data/Data_Analyst_Interview.xlsx`, sheet `00_DeBai`) chỉ nhận Excel/PBIX. Web UI là **portfolio engineering** vượt yêu cầu — user biết điều này.

### Quyết định UI mới — Compact Dashboard Layout (10/07/2026)

User ưu tiên dashboard ít phải scroll; nếu có thể, câu chuyện chính của mỗi dashboard phải nằm trong first viewport trên desktop.

- Slicer + KPI phải gọn, không chiếm quá nhiều chiều dọc.
- Chart chính phải xuất hiện ngay trong first viewport.
- Không dựng các section dọc quá dài nếu có thể sắp bằng grid 2–3 cột.
- Bảng chi tiết / heatmap / checklist dùng compact layout, tabs / segmented panel, hoặc scroll nội bộ.
- Dashboard 1: trend Revenue + Achievement Index là chart chính; Top/Bottom table nên compact.
- Dashboard 2: QuadrantScatter là visual trung tâm; bar kho/nhóm đặt cạnh scatter nếu đủ rộng; heatmap/bảng phụ nên compact hoặc scroll nội bộ.
- Dashboard 3: ưu tiên Waterfall + Error Matrix + Audit/PV trong layout cô đọng; checklist 16 rule không được kéo trang quá dài.
- Icon UI chỉ dùng **Ionicons** (`ion-icon`), không dùng emoji/ký hiệu tự nghĩ làm icon.

## 2. Backend — ĐÃ XONG, đừng làm lại

- Migration `db/migrations/007_dataflow.sql` đã chạy lên Supabase. Fix 7 điểm gãy (orphan tổng quát, left join, dim_month 3 nguồn, sold_6m cửa sổ 6 tháng, waterfall/error_layer động, batch tracking, invariants).
- Chạy SQL bằng: `node scripts/run_sql.mjs <file.sql>` hoặc `node scripts/run_sql.mjs --query "..."` (máy KHÔNG có psql; runner đọc `DATABASE_URL` từ `.env`, strip CRLF).
- Verify bất cứ lúc nào: `node scripts/run_sql.mjs db/migrations/005_reconcile.sql` → 20/20; `--query "select * from mart.invariant_checks"` → 11/11.
- `.env` (CRLF!) có: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (dùng ở browser), `SUPABASE_SECRET_KEY`, `DATABASE_URL`.
- **Đã test**: upload batch qua REST anon → transform tự chảy → rollback → về golden. Có test batch #2 đã rolled_back trong `raw.load_batches` (vô hại).

## 3. webui/ — ĐÃ XONG (Phase 0 + 1)

```
webui/
├─ package.json vite.config.ts tsconfig.json index.html vercel.json
├─ scripts/export_fixtures.mjs   # dump mart.* → src/fixtures/ (npm run fixtures)
└─ src/
   ├─ main.tsx  App.tsx          # App.tsx = shell + 4 trang STUB (KPI thật, chưa có chart)
   ├─ vite-env.d.ts
   ├─ theme/tokens.ts global.css # màu port từ demo; DQ_FAMILY xanh / PV_FAMILY tím
   ├─ state/DataContext.tsx      # fetch 1 lần khi load, có reload() cho sau upload
   ├─ lib/
   │   ├─ types.ts               # kiểu khớp mọi view mart.*
   │   ├─ supabase.ts            # 2 client: mart (đọc) / raw (ghi)
   │   ├─ data.ts                # loadData() fetch ~16 view, có phân trang 1000
   │   ├─ model.ts               # buildModel() enrich sales+dim, globalPlanRatio, filterSales/filterPlan
   │   ├─ measures.ts            # ~25 measure DAX→TS
   │   ├─ stats.ts               # chi-square + p-value
   │   ├─ format.ts              # fmtVND/fmtShort/fmtPct/fmtNum/fmtMonth (kiểu VN)
   │   └─ golden.test.ts         # 42 test — TẤT CẢ XANH
   └─ fixtures/*.json            # 16 file, export từ mart (dữ liệu gốc)
```

**Verify webui:** `cd webui && npm install && npm test` → 42 passed. `npm run dev` → localhost:5173. `npm run build` → sạch.

**Đã cài thêm:** `@types/node` (cho vite.config).

### Điểm CỐT TỬ trong measures.ts (đừng phá)
- 3 filter `doc_status`: Revenue `<>Cancelled` · Fill `IN(Completed,Open)` · MOC `IN(Completed,Return)` (cái này đã tính sẵn ở view `item_moc`).
- GM% mẫu số = `revenueWithCost` (dòng có standard_cost), KHÔNG phải revenueNet → 17,18% không phải 17,76%.
- `achievementIndex(rows, plan, globalRatio)`: Dashboard 1 dùng date range nên plan được prorate theo ngày. Global ratio giữ đúng tinh thần REMOVEFILTERS cho Region/Channel nhưng tôn trọng date range đang chọn.
- `latestEom()` loại orphan tường minh. Tồn âm EOM mới nhất = **4** (không phải 14 = cả 6 tháng).

## 4. VIỆC TIẾP THEO — Phase 2→7

Dùng TodoWrite. Sau MỖI phase: chạy `npm test` (phải xanh) + báo user check + xin screenshot. KHÔNG nhảy phase khi test đỏ.

### Phase 2 — Thư viện component (`src/components/`)
Port từ UI_demo sang React (giữ animation lux-*, hover tooltip, style-hover→onMouseEnter):
`KpiCard` `BarList` `LineChart`(SVG smoothPath) `Donut` `Gauge` `StackedBar` `DataTable` `Badge` `Slicer`(multi-select dropdown) `Footnote` `Card`.
Viết MỚI cùng phong cách: **`QuadrantScatter`** (X=MOC log/linear mốc 12, Y=giá trị tồn mốc 127,61tr, bubble=on_hand, màu=ABC, label 9 item Slow&Heavy) — "trái tim" DB2; **`Waterfall`** (5 bước, giảm màu alert-high) — DB3.
Nghiệm thu: trang /dev render đủ component với data mẫu.

### Phase 3 — Dashboard 1 Executive Sales
4 KPI chính: Revenue Net, Gross Margin, Fill Rate, % đạt kế hoạch. Filter `Từ ngày`/`Đến ngày` lọc sales theo `doc_date`; plan tháng được prorate theo số ngày giao với date range. Chart: cột Revenue theo ngày nếu range <=45 ngày, theo tháng nếu dài hơn; line Achievement Index (mốc 100); bar ngang vùng KHÁCH (nhãn Index); bar nhóm hàng (màu GM% diverging); bảng Top/Bottom theo **Gross Profit** (toggle, tô nền cam item Slow&Heavy). Region lọc plan, Channel KHÔNG lọc plan.
Nghiệm thu: không slicer → đúng 12 số vàng trên màn; slicer T5 → Revenue 1.512,3tr.

### Phase 4 — Dashboard 2 Inventory
5 KPI (6.391,8tr · 2.402,8tr/37,6% · 580,1tr/9,1% · 4 âm · 40/144). QuadrantScatter (9 item góc trên-phải). Bar theo kho (nhãn tồn/DT: MB 1,21·MN 1,04·MT 1,53) + bar nhóm + heatmap kho×nhóm. Bảng tồn âm (4 dòng) + bảng Discontinued (3 item, cột "CK tối đa không lỗ" 15,3/21,9/19,9%). Slicer Kho/Nhóm/ABC/Status. **Region trang này = VÙNG KHO** (`warehouse_region`). Footnote §5.7.
Nghiệm thu: đúng 9 item Slow&Heavy, VT033 nằm NGOÀI.

### Phase 5 — Dashboard 3 Data Quality
4 KPI: DQ 97,79%/98,27% (xanh `DQ_FAMILY`) · PV 13,94% (tím `PV_FAMILY`) · bias +2,03%.../−5,63% (từ `cleaning_scenarios`). Waterfall động (`audit_waterfall`). Ma trận 3 tầng lỗi (`audit_error_layer`). Bảng audit 11 vấn đề (đánh dấu dòng `in_hint=false`). DQ theo tháng/kho (ghi "chênh lệch là NHIỄU"). PV theo nhân viên (`pvBySalesperson`) + **textbox χ²=4,716; p=0,194** (`chiSquareIndependence`, hiện ngay dưới bar). Checklist 16 rule (`audit_rules`, 9 hard/4 soft/3 doc). Mục "trang này KHÔNG trả lời được" §6.10.
Nghiệm thu: hai họ màu tách bạch; KHÔNG có measure "DQ theo nhân viên".

### Phase 6 — Upload thật
Nâng modal demo: đọc **7 sheet** theo mapping `docs/dataflow.md §4` (GIỮ NGUYÊN `last_receipt_serial`, KHÔNG convert!). Mỗi upload là **full snapshot**: batch `loaded` mới nhất là snapshot active, stg/mart chỉ đọc batch đó. Flow: SHA-256 file → INSERT `raw.load_batches` (409 unique = file trùng, báo dừng) → lấy batch_id → bulk INSERT từng bảng raw kèm batch_id → SELECT `mart.invariant_checks` hiện 11 dòng xanh/đỏ → nút rollback gọi `raw.rpc('rollback_batch',{p_batch_id})`. Sau upload gọi `reload()` của DataContext. Hiện `mart.load_batches` (lịch sử).
`src_row_index`: UI tự đánh 0-based theo thứ tự dòng trong sheet.
Nghiệm thu: upload file add row → số tăng; upload snapshot đã xóa row → số giảm theo file mới; rollback batch mới → quay về batch loaded trước đó.

### Phase 7 — Polish + Deploy
Loading/error/empty state. README webui. `npm run build` sạch. Hướng dẫn user deploy Vercel: import repo, set `VITE_SUPABASE_URL` + `VITE_SUPABASE_KEY` (giá trị = `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` trong .env), build command `npm run build`, output `dist`. `vercel.json` đã có rewrite SPA.

## 5. Cạm bẫy đã gặp (đừng lặp lại)

- `.env` là **CRLF** — mọi chỗ đọc phải `.replace(/\r$/,'')`.
- Máy KHÔNG có `psql`, KHÔNG có `python3` global (dùng `.venv` của user: `Test_TST_Dashboard/.venv/bin/python`, đã cài openpyxl).
- Bảng `raw.*` bật RLS — 007 đã thêm policy `demo_read`/`demo_write` cho anon. Nếu insert 401 RLS → kiểm policy.
- Golden test dùng giá trị TÍNH LẠI theo ERRATA E7 (Return 2,03%, audit 4 dòng, region ~2/3), KHÔNG dùng con số docs cũ.
- Fixtures phải export khi DB ở trạng thái seed gốc (chỉ batch #1 loaded). Nếu ai upload batch mới chưa rollback → snapshot active đổi, `npm run fixtures` sẽ lệch, test đỏ. Rollback trước khi export.
- PostgREST giới hạn 1000 dòng/request — `data.ts` đã phân trang, giữ nguyên.

## 6. Lệnh nhanh

```bash
cd bi-case-study
node scripts/run_sql.mjs db/migrations/005_reconcile.sql        # golden 20/20
node scripts/run_sql.mjs --query "select * from mart.invariant_checks order by no"
cd webui
npm install && npm test            # 42 golden tests
npm run dev                        # localhost:5173
npm run fixtures                   # refresh fixtures (chỉ khi DB = seed gốc)
npm run build                      # production
```
