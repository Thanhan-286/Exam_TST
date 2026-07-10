// export_fixtures.mjs — dump mart.* → src/fixtures/*.json cho golden tests.
// Chạy lại khi SQL đổi:  npm run fixtures
// ⚠️ Fixtures phải được export khi database chứa ĐÚNG seed gốc (batch #1),
//    vì golden tests so với bảng số vàng của Data_set.xlsx.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// numeric → number, int8 → number, date → 'YYYY-MM-DD' (khớp PostgREST)
pg.types.setTypeParser(1700, parseFloat);
pg.types.setTypeParser(20, (v) => parseInt(v, 10));
pg.types.setTypeParser(1082, (v) => v);

function databaseUrl() {
  for (const line of readFileSync(resolve(root, '../.env'), 'utf8').split('\n')) {
    const m = line.replace(/\r$/, '').match(/^DATABASE_URL=(.*)$/);
    if (m) return m[1];
  }
  throw new Error('Thiếu DATABASE_URL trong ../.env');
}

const TABLES = {
  fact_sales: 'sales_sk',
  fact_inventory: 'month_end, item_code, warehouse_code',
  item_moc: 'item_code',
  plan_monthly: 'month_start, market_region, category_code',
  dim_product: 'item_code',
  dim_customer: 'customer_code',
  dim_warehouse: 'warehouse_code',
  dim_month: 'month_start',
  dq_fact_sales: 'sales_sk',
  dq_fact_inventory: 'month_end, item_code, warehouse_code',
  dq_inventory_recon: 'month_end, item_code, warehouse_code',
  audit_waterfall: 'step_order',
  audit_error_layer: 'layer_order',
  audit_issues: 'issue_no',
  audit_rules: 'rule_code',
  cleaning_scenarios: 'scenario_order',
};

const client = new pg.Client({
  connectionString: databaseUrl(),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const outDir = resolve(root, 'src/fixtures');
mkdirSync(outDir, { recursive: true });

for (const [table, order] of Object.entries(TABLES)) {
  const { rows } = await client.query(`select * from mart.${table} order by ${order}`);
  writeFileSync(resolve(outDir, `${table}.json`), JSON.stringify(rows));
  console.log(`✔ mart.${table} → ${rows.length} dòng`);
}

await client.end();
console.log(`\nFixtures ghi vào ${outDir}`);
