# CLAUDE.md — Ràng buộc không được vi phạm

Dự án: dựng 3 dashboard Power BI (PBIP) trên dữ liệu phân phối phụ tùng ô tô,
nguồn Supabase (PostgreSQL), 01–06/2026.

Đọc `docs/analysis.md` để hiểu nghiệp vụ. Đọc `ERRATA.md` **trước khi viết DAX**.

---

## 0. Trước khi làm bất cứ điều gì

Chạy `psql "$DATABASE_URL" -f db/migrations/005_reconcile.sql`.
**20/20 phải xanh.** Nếu không, dừng và báo. Đừng dựng model trên số sai.

---

## 1. Chín điều tuyệt đối không làm

1. **KHÔNG dedupe `fact_sales` theo `(order_no, line_no)`.**
   `order_no` chưa từng là khóa — 97,6% đơn nhiều dòng có >1 khách hàng.
   Chỉ xóa `src_row_index = 450`. Dedupe sai làm mất **293.054.650 VNĐ (−5,63%)**.
   Assert #16 của `005_reconcile.sql` bắt được lỗi này.

2. **Mẫu số `Gross Margin %` = doanh thu của các dòng CÓ `standard_cost`** (5.171.840.150),
   không phải tổng Revenue Net (5.208.670.650).
   `BLANK()` trong phép trừ hành xử như `0` ⇒ DAX ngây thơ cho ra 17,76% thay vì 17,18%.
   Phải lọc `NOT ISBLANK(standard_cost)` ở **cả tử lẫn mẫu**.

3. **`Fill Rate` lọc `doc_status IN {"Completed","Open"}`.** Không phải chỉ `"Completed"`.

4. **`MOC` dùng filter thứ BA: `doc_status IN {"Completed","Return"}`.**
   Khác Revenue Net (`<> "Cancelled"`), khác Fill Rate.
   Dùng nhầm ra **6 item** Slow&Heavy thay vì **9**. Xem `ERRATA.md` E2.

5. **Mẫu số global của `Achievement Index` = doanh thu TRONG PHẠM VI PLAN**
   (`in_plan_scope = TRUE`, tức loại `KH999` và `VT999`) = **5.134.128.150 / 84.602.000.000 = 6,07%**.
   Dùng tổng Revenue Net cho ra 6,16% và mọi Index lệch.

6. **Dashboard 1 dùng `dim_market_region`. Dashboard 2 dùng `dim_warehouse[warehouse_region]`.**
   KHÔNG tạo dimension Region dùng chung. KHÔNG nối quan hệ giữa hai cái.
   65,7% số dòng có vùng khách ≠ vùng kho.

7. **`Achievement Index` chỉ hiển thị ở cấp Region / Category / Month.**
   KHÔNG dựng heatmap Region × Category ở trang chính (~3,7 đơn/ô, Index dao động −0,7 → 848,3).

8. **Tồn âm KHÔNG set = 0.** Giữ nguyên. Đó là phát hiện, không phải lỗi cần vá.

9. **`mart.fact_sales` (450 dòng) và `mart.dq_fact_sales` (452 dòng) KHÔNG được nối quan hệ với nhau.**
   Bảng thứ hai chỉ dùng cho Dashboard 3. Nối bừa ⇒ slicer của Dashboard 1 lọc luôn DQ Score.

---

## 2. Ranh giới trách nhiệm

| Tầng | Ai làm | Không được đụng |
|---|---|---|
| SQL (`db/migrations/`) | Đã xong, đã test | Không sửa trừ khi assert fail |
| Semantic model (`pbip/Model.SemanticModel/`) | `semantic-model-authoring` skill + Modeling MCP | — |
| Report (`pbip/Report.Report/`) | `powerbi-report-authoring` skill | Không sửa TMDL từ đây |
| Thiết kế (`design/`) | Claude Design + con người | Agent không sửa |

Khi dựng report: **không sửa file TMDL, không sửa measure.** Nếu thiếu measure, dừng và báo.

---

## 3. Quy trình bắt buộc

- Mọi thay đổi SQL → chạy lại `005_reconcile.sql`. 20/20 hoặc rollback.
- Mọi thay đổi PBIR → chạy `validate-report`, rồi reload Desktop qua bridge, chụp màn hình.
- So sánh với `design/db{1,2,3}.png`. Lặp **tối đa 3 vòng**, sau đó dừng và hỏi.
- Tọa độ lấy từ `design/spec.md`. Được dịch **±8px** tránh chồng lấn.
  KHÔNG đổi `w`/`h` quá ±16px. KHÔNG đổi hàng. KHÔNG lấn 60px đáy trang.

## 4. Mỗi trang phải có textbox chú thích. Không được bỏ.

Nội dung nguyên văn ở `design/visual-map.md` §1.2, §2.2.
Không rút gọn, không diễn đạt lại. Đó là phần chứng minh người làm hiểu giới hạn của dữ liệu.

## 5. Bảo mật

- Không hardcode credential. Đọc từ `.env` (đã có trong `.gitignore`).
- Power BI kết nối bằng role `pbi_reader`, chỉ `SELECT` trên schema `mart`.
- Không commit `.pbi/localSettings.json`, `cache.abf`.

## 6. Ngôn ngữ

Comment và tài liệu bằng **tiếng Việt**, thuật ngữ kỹ thuật giữ nguyên tiếng Anh.
Tên bảng/cột/measure bằng tiếng Anh.
