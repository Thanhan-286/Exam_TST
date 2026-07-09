#!/usr/bin/env bash
# Chạy toàn bộ pipeline từ đầu. Idempotent — chạy lại bao nhiêu lần cũng được.
# Cần: psql + Python 3 (pandas, openpyxl, psycopg[binary])
# Không có psql? Xem RUNBOOK.md — dán SQL vào Supabase SQL Editor.
set -euo pipefail
: "${DATABASE_URL:?Thiếu DATABASE_URL — xem .env.example}"

echo "── 001 raw"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f db/migrations/001_raw.sql

echo "── nạp dữ liệu"
if python3 -c "import pandas, psycopg" 2>/dev/null; then
  python3 etl/load.py --xlsx data/Data_set.xlsx
else
  echo "   (không có pandas/psycopg → dùng 001b_seed.sql)"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f db/migrations/001b_seed.sql
fi

for f in 002_stg 003_mart 004_audit 006_mart_audit; do
  echo "── ${f}"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "db/migrations/${f}.sql"
done

echo
echo "══ BẢNG SỐ VÀNG — 20/20 phải xanh"
psql "$DATABASE_URL" -f db/migrations/005_reconcile.sql

if python3 -c "import psycopg" 2>/dev/null; then
  echo
  echo "══ CHỨNG MINH RULE"
  python3 etl/prove_rules.py
fi
