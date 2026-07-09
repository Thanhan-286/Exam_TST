#!/usr/bin/env python3
"""
etl/prove_rules.py — Chứng minh Hard block rule (§6.8) chặn được lỗi thật.

Không nói "rule này sẽ chặn được lỗi X". Chạy INSERT thật vào
`audit.fact_sales_validated` — bảng CÓ đủ constraint — rồi bắt exception
và ghi lại rule nào chặn dòng nào. Kết quả ở `audit.dq_results`.

Đây là visual đắt nhất của Dashboard 3: không phải bảng audit tĩnh,
mà là output của một test suite chạy được.

──────────────────────────────────────────────────────────────────────
⚠️ NGỮ NGHĨA — 10 dòng bẩn KHÔNG có nghĩa là 10 dòng bị chặn:

  index 20  : bản ĐẦU của cặp trùng. INSERT thành công — và phải vậy.
              H2 chặn bản THỨ HAI (450). Sau khi 450 bị chặn, dòng 20
              không còn là lỗi: nó là giao dịch thật, duy nhất.

  index 249 : discount 65%. Rule S1 là SOFT — cảnh báo, cho phép ghi đè
              có duyệt. DB cố ý KHÔNG chặn. Chặn nó là hiểu sai §6.8.

  ⇒ 8/10 dòng bị chặn cứng. 2 dòng còn lại được giữ ĐÚNG CHỦ ĐÍCH.

⚠️ BẪY THỨ TỰ: trigger BEFORE INSERT chạy TRƯỚC khi Postgres kiểm FK.
   Nếu H9 raise khi thiếu dữ liệu tồn kho, nó nuốt lỗi H3 của VT999 và
   báo sai rule. Xem comment trong 004_audit.sql.
──────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import os
import sys

import psycopg

# src_row_index → (rule kỳ vọng, có bị chặn CỨNG không)
EXPECT: dict[int, tuple[str, bool]] = {
    20:  ("H2", False),  # bản đầu của cặp trùng — PHẢI vào được
    450: ("H2", True),   # bản thứ hai — UNIQUE chặn
    54:  ("H3", True),   # KH999
    155: ("H3", True),
    221: ("H3", True),
    77:  ("H3", True),   # VT999
    179: ("H3", True),
    133: ("H4", True),   # unit_price = 0
    249: ("S1", False),  # discount 65% — SOFT, cố ý cho qua
    451: ("H9", True),   # 900 đv > tồn tối đa 300. H7 cũng bắt (pass 2)
}

COLS = """src_row_index, doc_date, order_no, line_no, customer_code, item_code,
          warehouse_code, qty_order, qty_delivered, unit_price, discount_pct,
          doc_status, delivery_due_date, actual_delivery_date"""


def rule_of(err: str) -> str:
    e = err.lower()
    if "h9:" in e:             return "H9"
    if "h8:" in e:             return "H8"
    if "uq_business_row" in e: return "H2"
    if "foreign key" in e:     return "H3"
    if "unit_price" in e:      return "H4"
    if "order_no" in e:        return "H7"
    if "on_hand_qty" in e:     return "H5"
    return "?"


def run_pass(conn, cur, disable: list[str]) -> dict[int, tuple[str, str]]:
    cur.execute("truncate audit.fact_sales_validated restart identity")
    for t in disable:
        cur.execute(f"alter table audit.fact_sales_validated disable trigger {t}")

    cur.execute(f"select {COLS} from raw.fact_sales_orders order by src_row_index")
    blocked: dict[int, tuple[str, str]] = {}
    for r in cur.fetchall():
        try:
            with conn.transaction():
                cur.execute(
                    f"insert into audit.fact_sales_validated ({COLS}) "
                    f"values ({', '.join(['%s'] * 14)})", r)
        except psycopg.Error as e:
            msg = str(e).split("\n")[0]
            blocked[r[0]] = (rule_of(msg), msg)

    for t in disable:
        cur.execute(f"alter table audit.fact_sales_validated enable trigger {t}")
    return blocked


def main() -> int:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("Thiếu DATABASE_URL", file=sys.stderr)
        return 1

    with psycopg.connect(dsn, autocommit=True) as conn:
        cur = conn.cursor()
        cur.execute("truncate audit.dq_results restart identity")

        # PASS 1 — H1..H7 + H9. Tắt H8 để cô lập tầng DỮ LIỆU khỏi tầng QUY TRÌNH.
        print("\n══ PASS 1 — Hard block tầng DỮ LIỆU (H1–H7, H9). H8 tắt.\n")
        blocked = run_pass(conn, cur, ["trg_h8_master_active"])
        for i, (rc, msg) in sorted(blocked.items()):
            cur.execute(
                "insert into audit.dq_results (rule_code, src_row_index, blocked, pg_error)"
                " values (%s,%s,true,%s)", (rc if rc != "?" else None, i, msg))

        print(f"  Vào được : {452 - len(blocked)}")
        print(f"  Bị chặn  : {len(blocked)}\n")
        for i, (rc, msg) in sorted(blocked.items()):
            exp = EXPECT.get(i, ("—", False))[0]
            print(f"    {'✓' if rc == exp else '✗'} index {i:>3}  {rc:<3} "
                  f"(kỳ vọng {exp:<3})  {msg[:56]}")

        should = {i for i, (_, b) in EXPECT.items() if b}
        missed, extra = should - set(blocked), set(blocked) - should
        print()
        print("    · index  20 vào được → ĐÚNG (bản gốc của cặp trùng, không phải lỗi)")
        print("    · index 249 vào được → ĐÚNG (S1 soft warning, cho ghi đè có duyệt)")
        if missed: print(f"    ⚠️ KHÔNG chặn được: {sorted(missed)}")
        if extra:  print(f"    ⚠️ Chặn nhầm dòng sạch: {sorted(extra)}")

        # PASS 2 — tắt H9. H7 có tự bắt được sentinel không?
        print("\n══ PASS 2 — H9 tắt. H7 (mã sentinel) có độc lập bắt được 451?\n")
        b2 = run_pass(conn, cur, ["trg_h8_master_active", "trg_h9_qty_vs_onhand"])
        rc451 = b2.get(451, ("—",))[0]
        print(f"    {'✓' if rc451 == 'H7' else '✗'} index 451 → {rc451}   "
              "(hai rule độc lập cùng bắt: H7 mã sentinel · H9 bất khả thi vật lý)")

        # PASS 3 — bật H8. Đo tầng QUY TRÌNH.
        print("\n══ PASS 3 — Bật H8. Tầng QUY TRÌNH (§6.2).\n")
        b3 = run_pass(conn, cur, [])
        pv = [i for i, (rc, _) in b3.items() if rc == "H8"]
        print(f"    H8 chặn {len(pv)} dòng bán cho master không Active")

        print("\n══ Q11 — Chỉ số kỳ vọng sau khi áp rule\n")
        print(f"    DQ Score SO   97,79% → 100%   ({len(should)}/10 dòng bị chặn cứng;")
        print("                                   20 = bản gốc hợp lệ, 249 = soft warning)")
        print("    PV Score      13,94% →   0%   (H8 chặn tại nguồn)\n")

        return 1 if (missed or extra or rc451 != "H7") else 0


if __name__ == "__main__":
    sys.exit(main())
