# Cách chạy — không cần cài gì

Toàn bộ pipeline chạy được **chỉ bằng trình duyệt**, qua Supabase SQL Editor.

## Trước khi bắt đầu

1. Tạo Supabase project. Ghi lại **region** (vd. `ap-southeast-1`).
2. Vào **Project Settings → Database → Reset database password**. Lưu vào trình quản lý mật khẩu, **đừng dán vào chat với ai**.

## Bước 1 — Chạy 5 file SQL, đúng thứ tự

Supabase Dashboard → **SQL Editor** → New query → dán nội dung file → **Run**.

| # | File | Kích thước | Làm gì |
|---|---|---|---|
| 1 | `001_raw.sql` | 3 KB | Tạo schema `raw`, 7 bảng, **không constraint** |
| 2 | `001b_seed.sql` | 139 KB | Nạp 1.512 dòng dữ liệu **nguyên xi** từ `Data_set.xlsx` |
| 3 | `002_stg.sql` | 6 KB | Cast date, sinh surrogate key, gắn 9 cờ |
| 4 | `003_mart.sql` | 7 KB | View Power BI đọc + role `pbi_reader` |
| 5 | `004_audit.sql` | 8 KB | 16 rule + bảng có constraint + 2 trigger |

> ⚠️ `001b_seed.sql` dài 139 KB. Trình soạn thảo của Supabase xử lý được, nhưng nếu trình duyệt treo, chia file làm đôi theo ranh giới `truncate raw.<bảng>;` — mỗi khối `insert` độc lập.

**Sau bước 5**, đổi mật khẩu `pbi_reader` (mặc định là `CHANGE_ME`):

```sql
alter role pbi_reader with password 'mật-khẩu-mạnh-của-bạn';
```

Power BI dùng role này. **Không** dùng role `postgres` — nó có quyền ghi lên mọi thứ.

## Bước 2 — Kiểm tra: 20/20 phải xanh

Dán `005_reconcile.sql` → Run. Kết quả 20 dòng, cột `ok` phải là `✓` hết.

| # | Chỉ số | Giá trị bắt buộc |
|---|---|---|
| 4 | Revenue Net | 5.208.670.650 |
| 6 | Gross Margin % | 17,18% |
| 7 | Fill Rate | 87,21% |
| 13 | Slow & Heavy | 9 item |
| **16** | **Bẫy dedupe** | **4.915.616.000** |

**Nếu #16 không ra 4.915.616.000**, nghĩa là `mart.fact_sales` đã bị dedupe sai ở đâu đó. Dừng lại, đừng dựng dashboard trên số đó.

Một `✗` nào cũng là dừng. Đừng "để đó tính sau".

## Bước 3 — Gate 0: Power BI có kết nối được không?

Đây là chỗ dễ sập nhất trong cả dự án. Làm **trước** khi dựng gì.

1. Supabase → **Connect** → chọn **Session pooler**
   Host `aws-0-<region>.pooler.supabase.com` · Port `5432` · User `postgres.<project-ref>`
   *(Đừng dùng Direct connection — nó chỉ chạy trên IPv6 trừ khi mua IPv4 add-on.)*
2. Supabase → Database → Configuration → **SSL** → tải file `.crt`
3. Windows: `Win+R` → `mmc` → File → Add/Remove Snap-in → **Certificates** → **Computer account** → Trusted Root Certification Authorities → All Tasks → Import → chọn file `.crt`
4. Power BI Desktop → Get Data → **PostgreSQL database**
   Server: `aws-0-<region>.pooler.supabase.com:5432` · Database: `postgres`
   Advanced options → SSL Mode: `Require`
   Đăng nhập bằng `pbi_reader`
5. Chọn **Import**, không phải DirectQuery
6. Load các view trong schema `mart`

**✅ Gate 0 pass** khi bạn thấy `mart.fact_sales` với 450 dòng trong Power BI Desktop.

**✗ Nếu fail:** thử `SSL Mode = Prefer`. Vẫn fail → xem `implementation-plan.md` §7 (Kế hoạch B). Đừng đốt thêm thời gian.

> **Nếu bài nộp yêu cầu publish lên Power BI Service và auto-refresh:** Gate 0 chưa đủ. Power BI Service kết nối từ hạ tầng cloud của Microsoft, và hạ tầng đó **không tin chuỗi SSL certificate của Supabase** — kể cả có IPv4 add-on. Phải test publish + scheduled refresh trước, hoặc chuyển sang Kế hoạch B ngay.

## Bước 4 (tuỳ chọn) — Chứng minh rule chặn được lỗi

Chỉ bước này cần Python. Bỏ qua được, nhưng nó là visual đắt nhất của Dashboard 3.

```bash
pip install "psycopg[binary]" pandas openpyxl
export DATABASE_URL='postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres'
python etl/prove_rules.py
```

Nó nạp 452 dòng vào `audit.fact_sales_validated` (bảng **có** đủ constraint), bắt exception, và ghi vào `audit.dq_results` rule nào chặn dòng nào. Kết quả:

```
8/10 dòng bẩn bị chặn cứng
  index 450  H2  duplicate key violates unique constraint
  index 451  H9  qty_delivered=900 vượt tồn tối đa 300 của (VT005, WH_HCM)
  index  54  H3  violates foreign key constraint  ...

index  20 vào được → ĐÚNG (bản gốc của cặp trùng, không phải lỗi)
index 249 vào được → ĐÚNG (S1 là soft warning, cho ghi đè có duyệt)

H8 chặn 63 dòng bán cho master không Active  →  PV Score 13,94% → 0%
```

Đó là trả lời cho Q11 (§6.8): không phải *"rule này sẽ chặn được lỗi"* mà là *"đây là 8 lần INSERT thất bại, có log"*.

---

## Ba file Python — khi nào cần

| File | Cần không? | Thay bằng |
|---|---|---|
| `load.py` | Không | `001b_seed.sql` |
| `reconcile.py` | Không | `005_reconcile.sql` |
| `prove_rules.py` | **Có, nếu muốn Dashboard 3 đầy đủ** | Không có bản SQL — nó cần bắt exception, mà SQL không làm được |

`run_all.sh` chỉ dành cho ai có sẵn `psql` + Python.

---

## Đọc trước khi viết DAX

`ERRATA.md` — 6 sai lệch giữa `analysis.md` và dữ liệu thật. Ba cái sẽ khiến DAX sai:

- **E2**: `MOC` dùng filter `DocStatus IN ('Completed','Return')` — khác Revenue Net, khác Fill Rate. Dùng nhầm ra 6 item thay vì 9.
- **E4**: `Gross Margin %` phải lọc `NOT ISBLANK(StandardCost)` ở **cả tử lẫn mẫu**. `BLANK()` trong phép trừ hành xử như `0` ⇒ rơi thẳng vào bẫy 17,76%.
- **E3**: `Avg Days Late` trong `analysis.md` (2,0 ngày) thật ra là độ trễ trung bình trên **cả 330 đơn đã giao**. Trên 207 đơn thực sự trễ là **3,4 ngày**.
