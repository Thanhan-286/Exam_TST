// run_sql.mjs — chạy file SQL lên Supabase qua DATABASE_URL (máy không có psql)
// Cách dùng:  node scripts/run_sql.mjs db/migrations/007_dataflow.sql
//             node scripts/run_sql.mjs db/migrations/005_reconcile.sql   (in bảng kết quả)
//             node scripts/run_sql.mjs --query "select * from mart.invariant_checks"
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// .env có line ending CRLF — strip \r khi parse
function loadEnv() {
  const out = {};
  for (const line of readFileSync(resolve(root, '.env'), 'utf8').split('\n')) {
    const m = line.replace(/\r$/, '').match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = loadEnv();
if (!env.DATABASE_URL) {
  console.error('Thiếu DATABASE_URL trong .env');
  process.exit(1);
}

const args = process.argv.slice(2);
let sql, label;
if (args[0] === '--query') {
  sql = args[1];
  label = '(query)';
} else {
  const file = resolve(root, args[0]);
  sql = readFileSync(file, 'utf8');
  label = args[0];
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const t0 = Date.now();
  const res = await client.query(sql);
  const results = Array.isArray(res) ? res : [res];
  console.log(`✔ ${label} — ${results.length} statement group(s), ${Date.now() - t0}ms`);
  for (const r of results) {
    if (r.rows && r.rows.length > 0) console.table(r.rows);
  }
} catch (e) {
  console.error(`✘ ${label} LỖI: ${e.message}`);
  if (e.position) {
    const upto = sql.slice(0, Number(e.position));
    console.error(`  tại dòng ~${upto.split('\n').length}`);
  }
  process.exitCode = 1;
} finally {
  await client.end();
}
