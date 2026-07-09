# Setup VS Code + Claude Code

## 1. Yêu cầu

- **Node.js 18+** — bắt buộc, để cài Power BI Modeling MCP server
- **GitHub Copilot CLI** — plugin `powerbi-authoring` phân phối qua marketplace này,
  kể cả khi bạn dùng Claude Code
- **Power BI Desktop** bản 03/2026 trở lên (PBIR là default từ bản này)
- **Claude Code** trong VS Code

Kiểm tra:
```bash
node -v          # >= v18
copilot --version
```

## 2. Cài Agent Skills for Power BI

```bash
copilot plugin marketplace add microsoft/skills-for-fabric
copilot plugin install powerbi-authoring@fabric-collection
```

Plugin tự đăng ký **Power BI Modeling MCP server** và cài compatibility shim cho Claude Code.

Kiểm tra trong Claude Code:
```
/skills list
```
Phải thấy: `semantic-model-authoring` · `powerbi-report-authoring` · `powerbi-report-design` · `powerbi-report-management`

## 3. Biến môi trường

```bash
cp .env.example .env
# điền Session Pooler connection string + mật khẩu pbi_reader
```

## 4. Kiểm tra dữ liệu trước khi làm gì

```bash
psql "$DATABASE_URL" -f db/migrations/005_reconcile.sql
```
**20/20 phải xanh.** Nếu chưa chạy migration, xem `RUNBOOK.md`.

## 5. Thứ tự làm việc

| Phase | Việc | Skill | Gate |
|---|---|---|---|
| 4 | Semantic model (TMDL) | `semantic-model-authoring` + Modeling MCP | `docs/model-spec.md` §6 |
| 5a | Dashboard 3 | `powerbi-report-authoring` | `validate-report` pass |
| 5b | Dashboard 2 | `powerbi-report-authoring` | so với `design/db2.png` |
| 5c | Dashboard 1 | `powerbi-report-authoring` | so với `design/db1.png` |
| 5d | Critique | `powerbi-report-design` **critique-only** | duyệt từng phát hiện |
| 6 | Đóng gói | — | README + commit history |

Dựng **Dashboard 3 trước**. Ít visual nhất, nhiều text nhất, dễ verify nhất.
Dashboard 1 dựng cuối — nó được xem nhiều nhất nên cần vòng lặp thẩm mỹ nhiều nhất.

## 6. Prompt cho Phase 4 (semantic model)

Dán vào Claude Code:

> Đọc `CLAUDE.md` và `docs/model-spec.md`.
>
> Dùng `/semantic-model-authoring` để tạo PBIP project tại `pbip/` với semantic model
> Import mode, nguồn PostgreSQL schema `mart` (connection string trong `.env`).
>
> Tạo đúng 13 bảng, 15 quan hệ, và toàn bộ measure theo `docs/model-spec.md` §2–§4.
> **Chép DAX nguyên văn** — 5 measure có bẫy đã ghi rõ lý do trong comment,
> đừng "tối ưu" chúng.
>
> Áp format string và ẩn cột theo §5.
>
> Sau khi xong: mở Power BI Desktop, kéo 12 measure ở §6 vào một table visual
> không slicer, chụp màn hình, đối chiếu. Một dòng sai là dừng và báo.
>
> **Không** thêm bước `Table.Distinct` hay `Remove Duplicates` ở bất kỳ query M nào.

## 7. Prompt cho Phase 5a (Dashboard 3)

> Đọc `docs/analysis.md` §6.11, `design/visual-map.md` §3, và `design/spec.md`.
>
> Dùng `/powerbi-report-authoring` tạo page "Data Quality" trong `pbip/Report.Report`.
> Canvas **1280 × 1600** (Page Size = Custom — trang cuộn, lý do ở visual-map §0.5).
> Bind vào semantic model hiện có. Tọa độ lấy từ `design/spec.md`.
>
> Sau khi viết PBIR: chạy `validate-report`, reload Desktop qua bridge, chụp màn hình,
> so với `design/db3.png`. Nếu lệch, sửa và lặp — **tối đa 3 vòng**, sau đó dừng và báo.
>
> **Không** sửa file TMDL. **Không** sửa measure. Nếu thiếu measure, dừng và báo.
