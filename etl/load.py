#!/usr/bin/env python3
"""
etl/load.py — Data_set.xlsx  →  schema `raw` của Postgres/Supabase

NGUYÊN TẮC: nạp NGUYÊN XI. Không sửa, không lọc, không cast ngày.
452 dòng vào là 452 dòng nằm. Mọi việc làm sạch ở tầng stg/mart.

Vì sao KHÔNG dùng Supabase CSV import UI:
  • last_receipt_serial là số nguyên → UI sẽ đoán thành date và cast sai
  • qty_order âm ở 22 dòng Return → UI có thể ép unsigned
  • note null 442/452 → UI có thể đọc thành chuỗi rỗng
  • dòng trùng (index 450) cần được GIỮ, UI hay tự dedupe

Chạy:
    export DATABASE_URL=postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres
    python etl/load.py --xlsx data/Data_set.xlsx
"""
from __future__ import annotations

import argparse
import io
import os
import sys

import pandas as pd
import psycopg

# sheet Excel → (bảng raw, ánh xạ cột)
SHEETS = {
    "fact_sales_orders": (
        "raw.fact_sales_orders",
        {
            "DocDate": "doc_date", "OrderNo": "order_no", "LineNo": "line_no",
            "CustomerCode": "customer_code", "ItemCode": "item_code",
            "WarehouseCode": "warehouse_code", "QtyOrder": "qty_order",
            "QtyDelivered": "qty_delivered", "UnitPrice": "unit_price",
            "DiscountPct": "discount_pct", "DocStatus": "doc_status",
            "DeliveryDueDate": "delivery_due_date",
            "ActualDeliveryDate": "actual_delivery_date",
            "Salesperson": "salesperson", "Note": "note",
        },
    ),
    "fact_inventory_EOM": (
        "raw.fact_inventory_eom",
        {
            "MonthEnd": "month_end", "ItemCode": "item_code",
            "WarehouseCode": "warehouse_code", "OnHandQty": "on_hand_qty",
            "InventoryValue": "inventory_value", "SafetyStock": "safety_stock",
            "LastReceiptDate": "last_receipt_serial",   # <-- serial, KHÔNG cast
            "StockStatusNote": "stock_status_note",
        },
    ),
    "dim_product": (
        "raw.dim_product",
        {
            "ItemCode": "item_code", "ItemName": "item_name",
            "CategoryCode": "category_code", "CategoryName": "category_name",
            "StandardCost": "standard_cost", "ListPrice": "list_price",
            "ItemStatus": "item_status", "ABC_Class": "abc_class",
            "LaunchDate": "launch_date",
        },
    ),
    "dim_customer": (
        "raw.dim_customer",
        {
            "CustomerCode": "customer_code", "CustomerName": "customer_name",
            "Region": "region", "Channel": "channel",
            "Salesperson": "salesperson", "CustomerStatus": "customer_status",
        },
    ),
    "dim_warehouse": (
        "raw.dim_warehouse",
        {
            "WarehouseCode": "warehouse_code", "WarehouseName": "warehouse_name",
            "Region": "region", "WarehouseStatus": "warehouse_status",
        },
    ),
    "plan_monthly_sales": (
        "raw.plan_monthly_sales",
        {
            "MonthStart": "month_start", "Region": "region",
            "CategoryCode": "category_code", "CategoryName": "category_name",
            "TargetRevenue": "target_revenue",
        },
    ),
    "data_quality_hint": (
        "raw.data_quality_hint",
        {"RuleCode": "rule_code", "RuleName": "rule_name",
         "Mô tả gợi ý kiểm tra": "description"},
    ),
}

# fact_sales_orders cần src_row_index để §6.3 tham chiếu được index 20/450/451
NEEDS_ROW_INDEX = {"fact_sales_orders"}


def copy_df(cur, table: str, df: pd.DataFrame) -> int:
    cols = list(df.columns)
    buf = io.StringIO()
    df.to_csv(buf, index=False, header=False, na_rep="\\N")
    buf.seek(0)
    sql = f"COPY {table} ({', '.join(cols)}) FROM STDIN WITH (FORMAT csv, NULL '\\N')"
    with cur.copy(sql) as cp:
        cp.write(buf.read())
    return len(df)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", default="data/Data_set.xlsx")
    ap.add_argument("--dsn", default=os.environ.get("DATABASE_URL"))
    args = ap.parse_args()

    if not args.dsn:
        print("Thiếu DATABASE_URL", file=sys.stderr)
        return 1

    xl = pd.ExcelFile(args.xlsx)
    with psycopg.connect(args.dsn) as conn, conn.cursor() as cur:
        for sheet, (table, mapping) in SHEETS.items():
            df = xl.parse(sheet)

            missing = set(mapping) - set(df.columns)
            if missing:
                print(f"✗ {sheet}: thiếu cột {missing}", file=sys.stderr)
                return 1

            if sheet in NEEDS_ROW_INDEX:
                df = df.reset_index().rename(columns={"index": "src_row_index"})
                out = df[["src_row_index"] + list(mapping)].rename(columns=mapping)
            else:
                out = df[list(mapping)].rename(columns=mapping)

            # ngày → ISO; KHÔNG đụng vào last_receipt_serial
            for c in out.columns:
                if pd.api.types.is_datetime64_any_dtype(out[c]):
                    out[c] = out[c].dt.strftime("%Y-%m-%d")

            cur.execute(f"TRUNCATE {table}")
            n = copy_df(cur, table, out)
            print(f"  {table:32} {n:>5} dòng")
        conn.commit()

    print("✓ Nạp xong. Chạy tiếp: python etl/reconcile.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
