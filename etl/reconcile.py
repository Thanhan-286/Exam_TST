#!/usr/bin/env python3
"""
etl/reconcile.py — Bảng số vàng. 14 assert. Fail một cái là dừng.

Đây là hợp đồng giữa tầng ETL và tầng Power BI. Mọi thay đổi SQL phải
chạy lại file này. Nếu Claude Code sửa mart và assert này vẫn xanh,
số liệu trên dashboard đúng.

Assert #14 là quan trọng nhất: nó chứng minh cái BẪY tồn tại thật.
Nếu dedupe theo (order_no, line_no) thì mất 293.054.650 VNĐ (−5,63%).

Chạy:  python etl/reconcile.py
"""
from __future__ import annotations

import os
import sys
from decimal import Decimal

import psycopg

FAILS: list[str] = []
PASSES = 0


def check(no: int, name: str, got, want, tol=Decimal("0.01")) -> None:
    global PASSES
    if isinstance(want, (int, float, Decimal)) and isinstance(got, (int, float, Decimal)):
        ok = abs(Decimal(str(got)) - Decimal(str(want))) <= Decimal(str(tol))
    else:
        ok = got == want

    mark = "✓" if ok else "✗"
    g = f"{got:,}".replace(",", ".") if isinstance(got, (int, Decimal)) else str(got)
    w = f"{want:,}".replace(",", ".") if isinstance(want, (int, Decimal)) else str(want)
    print(f"  {mark} #{no:<2} {name:<42} {g:>20}" + ("" if ok else f"   ≠ {w}"))
    if ok:
        PASSES += 1
    else:
        FAILS.append(f"#{no} {name}: got {g}, want {w}")


# ── Các query. Mỗi query trả về đúng 1 giá trị. ────────────────────────
Q = {
    1: ("Rows raw.fact_sales_orders", 452,
        "select count(*) from raw.fact_sales_orders"),

    2: ("Rows raw.fact_inventory_eom", 865,
        "select count(*) from raw.fact_inventory_eom"),

    3: ("Rows mart.fact_sales (đã làm sạch)", 450,
        "select count(*) from mart.fact_sales"),

    4: ("Revenue Net", Decimal("5208670650"),
        """select sum(line_revenue) from mart.fact_sales
           where doc_status <> 'Cancelled'"""),

    5: ("Gross Margin", Decimal("888400150"),
        """select sum(f.line_revenue - f.qty_delivered * p.standard_cost)
           from mart.fact_sales f join raw.dim_product p using (item_code)
           where f.doc_status <> 'Cancelled'"""),

    6: ("Gross Margin % (mẫu số đúng)", Decimal("17.18"),
        """select round(100 * sum(f.line_revenue - f.qty_delivered*p.standard_cost)
                            / sum(f.line_revenue), 2)
           from mart.fact_sales f join raw.dim_product p using (item_code)
           where f.doc_status <> 'Cancelled'"""),

    7: ("Fill Rate %", Decimal("87.21"),
        """select round(100 * sum(qty_delivered) / sum(qty_order), 2)
           from mart.fact_sales
           where doc_status in ('Completed','Open')"""),

    8: ("On-time Delivery % (n=330)", Decimal("37.27"),
        """select round(100.0 * count(*) filter (where actual_delivery_date <= delivery_due_date)
                        / count(*), 2)
           from mart.fact_sales where actual_delivery_date is not null"""),

    9: ("Inventory Value EOM 30/06 (loại VT999)", Decimal("6391770000"),
        """select sum(inventory_value) from mart.fact_inventory
           where month_end = (select max(month_end) from mart.fact_inventory)"""),

    10: ("Median inventory value / item", Decimal("127610000"),
         "select distinct median_inv_value from mart.item_moc"),

    11: ("Slow & Heavy — số item", 9,
         "select count(*) from mart.item_moc where is_slow_heavy"),

    12: ("Slow & Heavy — giá trị mắc kẹt", Decimal("2402800000"),
         "select sum(inv_value_eom) from mart.item_moc where is_slow_heavy"),

    13: ("LastReceiptDate min → max", "2025-06-08 → 2026-06-25",
         """select min(last_receipt_date)::text || ' → ' || max(last_receipt_date)::text
            from stg.fact_inventory"""),

    14: ("⚠️ BẪY: dedupe order_no+line_no → Revenue", Decimal("4915616000"),
         """with bad as (
              select distinct on (order_no, line_no) *
              from stg.fact_sales
              where not flag_sentinel
              order by order_no, line_no, src_row_index
            )
            select sum(qty_delivered * unit_price * (1-discount_pct))
            from bad where doc_status <> 'Cancelled'"""),

    15: ("DQ Score SO % (10 dòng bẩn / 452)", Decimal("97.79"),
         """select round(100 * (1 - count(*) filter (
                where flag_dup_row or flag_orphan_fk or flag_zero_price
                   or flag_high_discount or flag_sentinel)::numeric / count(*)), 2)
            from stg.fact_sales"""),

    16: ("DQ Score INV % (15 dòng bẩn / 865)", Decimal("98.27"),
         """select round(100 * (1 - count(*) filter (
                where flag_negative_stock or flag_orphan_fk)::numeric / count(*)), 2)
            from stg.fact_inventory"""),

    17: ("PV Score % (63 dòng / 452)", Decimal("13.94"),
         """select round(100.0 * count(*) filter (where flag_process_violation) / count(*), 2)
            from stg.fact_sales"""),

    18: ("Reconciliation tồn kho (khớp / tổng)", "864/865",
         """select count(*) filter (
                  where i.inventory_value = i.on_hand_qty * p.standard_cost)::text
                || '/' || count(*)::text
            from stg.fact_inventory i
            left join raw.dim_product p using (item_code)"""),

    19: ("Tồn âm tại 30/06/2026", 4,
         """select count(*) from mart.fact_inventory
            where flag_negative_stock
              and month_end = (select max(month_end) from mart.fact_inventory)"""),

    20: ("Discontinued còn tồn (VNĐ)", Decimal("580050000"),
         """select sum(i.inventory_value) from mart.fact_inventory i
            join raw.dim_product p using (item_code)
            where p.item_status = 'Discontinued'
              and i.month_end = (select max(month_end) from mart.fact_inventory)"""),
}


def main() -> int:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("Thiếu DATABASE_URL", file=sys.stderr)
        return 1

    print("\nBẢNG SỐ VÀNG — mọi con số dưới đây phải khớp analysis.md\n")
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        for no in sorted(Q):
            name, want, sql = Q[no]
            cur.execute(sql)
            check(no, name, cur.fetchone()[0], want)

    print(f"\n{PASSES}/{len(Q)} pass")
    if FAILS:
        print("\nFAIL:")
        for f in FAILS:
            print("  •", f)
        return 1
    print("✓ Tất cả khớp. mart schema sẵn sàng cho Power BI.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
