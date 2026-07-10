// =====================================================================
// GOLDEN TESTS — thay Gate 4 của Power BI (docs/web-spec: một test đỏ là
// DỪNG, không dựng UI trên số sai).
//
// Fixtures = export nguyên trạng từ mart.* khi database chứa seed gốc.
// Kỳ vọng = bảng số vàng README.md + analysis.md + ERRATA.md.
// =====================================================================
import { describe, it, expect } from 'vitest';
import type { DataBundle } from './types';
import { buildModel, filterSales, filterPlan } from './model';
import * as M from './measures';
import { chiSquareIndependence } from './stats';

import fact_sales from '../fixtures/fact_sales.json';
import fact_inventory from '../fixtures/fact_inventory.json';
import item_moc from '../fixtures/item_moc.json';
import plan_monthly from '../fixtures/plan_monthly.json';
import dim_product from '../fixtures/dim_product.json';
import dim_customer from '../fixtures/dim_customer.json';
import dim_warehouse from '../fixtures/dim_warehouse.json';
import dim_month from '../fixtures/dim_month.json';
import dq_fact_sales from '../fixtures/dq_fact_sales.json';
import dq_fact_inventory from '../fixtures/dq_fact_inventory.json';
import dq_inventory_recon from '../fixtures/dq_inventory_recon.json';
import audit_waterfall from '../fixtures/audit_waterfall.json';
import audit_error_layer from '../fixtures/audit_error_layer.json';
import audit_issues from '../fixtures/audit_issues.json';
import audit_rules from '../fixtures/audit_rules.json';
import cleaning_scenarios from '../fixtures/cleaning_scenarios.json';

const bundle = {
  sales: fact_sales,
  inventory: fact_inventory,
  itemMoc: item_moc,
  plan: plan_monthly,
  products: dim_product,
  customers: dim_customer,
  warehouses: dim_warehouse,
  months: dim_month,
  dqSales: dq_fact_sales,
  dqInventory: dq_fact_inventory,
  recon: dq_inventory_recon,
  waterfall: audit_waterfall,
  errorLayers: audit_error_layer,
  auditIssues: audit_issues,
  auditRules: audit_rules,
  cleaningScenarios: cleaning_scenarios,
} as unknown as DataBundle;

const model = buildModel(bundle);
const S = model.sales;
const round2 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);
const pct2 = (x: number | null) => (x == null ? null : Math.round(x * 10000) / 100);

describe('Cấu trúc dữ liệu', () => {
  it('mart.fact_sales = 450 dòng (đã xóa trùng + sentinel, GIỮ 48 dòng cùng OrderNo)', () => {
    expect(S.length).toBe(450);
  });
  it('dq_fact_sales = 452 dòng nguyên trạng', () => {
    expect(bundle.dqSales.length).toBe(452);
  });
  it('snapshot EOM mới nhất = 144 dòng non-orphan', () => {
    expect(M.latestEom(bundle.inventory).length).toBe(144);
  });
  it('item_moc = 36 item', () => {
    expect(bundle.itemMoc.length).toBe(36);
  });
});

describe('Dashboard 1 — số vàng', () => {
  it('Revenue Net = 5.208.670.650', () => {
    expect(Math.round(M.revenueNet(S))).toBe(5_208_670_650);
  });
  it('Revenue With Cost (mẫu số GM%) = 5.171.840.150 — KHÁC Revenue Net', () => {
    expect(Math.round(M.revenueWithCost(S))).toBe(5_171_840_150);
  });
  it('COGS = 4.283.440.000', () => {
    expect(Math.round(M.cogs(S))).toBe(4_283_440_000);
  });
  it('Gross Margin = 888.400.150', () => {
    expect(Math.round(M.grossMargin(S))).toBe(888_400_150);
  });
  it('Gross Margin % = 17,18% (KHÔNG phải 17,76% hay 17,06%)', () => {
    expect(pct2(M.grossMarginPct(S))).toBe(17.18);
  });
  it('Fill Rate = 87,21% [Completed + Open]', () => {
    expect(pct2(M.fillRate(S))).toBe(87.21);
  });
  it('OTD = 37,27% trên n = 330 dòng đã giao', () => {
    const otd = M.onTimeDelivery(S);
    expect(otd.n).toBe(330);
    expect(pct2(otd.pct)).toBe(37.27);
  });
  it('Avg Days Late = 3,37 ngày (n = 207 đơn trễ) — ERRATA E3', () => {
    const r = M.avgDaysLate(S);
    expect(r.n).toBe(207);
    expect(round2(r.days)).toBe(3.37);
  });
  it('Avg Delivery Delay = 2,02 ngày (n = 330) — chỉ số KHÁC', () => {
    expect(round2(M.avgDeliveryDelay(S).days)).toBe(2.02);
  });
  it('Return Value = −107.785.450 · Return Rate = 2,03% (ERRATA E7)', () => {
    expect(Math.round(M.returnValue(S))).toBe(-107_785_450);
    // Docs ghi 2,24% nhưng đó là tính trên Completed TRƯỚC làm sạch
    // (4.674,9tr + trùng 11,9tr + sentinel 135tr = 4.821,9tr → 2,235%).
    // Công thức model-spec (mẫu số Completed+Open đã sạch) cho 2,03%.
    expect(pct2(M.returnRate(S))).toBe(2.03);
  });
  it('Target = 84.602.000.000 · Revenue In Plan Scope = 5.134.128.150 · %Plan = 6,07%', () => {
    expect(M.target(bundle.plan)).toBe(84_602_000_000);
    expect(Math.round(M.revenueInPlanScope(S))).toBe(5_134_128_150);
    expect(pct2(M.pctOfPlan(S, bundle.plan))).toBe(6.07);
  });
  it('Achievement Index toàn cục = 100,0', () => {
    const idx = M.achievementIndex(S, bundle.plan, model.globalPlanRatio);
    expect(round2(idx)).toBe(100);
  });
});

describe('Dashboard 1 — Achievement Index theo lát cắt (slicer mô phỏng)', () => {
  const idxRegion = (region: string) =>
    M.achievementIndex(
      filterSales(S, { regions: new Set([region]) }),
      filterPlan(bundle.plan, { regions: new Set([region]) }),
      model.globalPlanRatio
    );
  const idxMonth = (month: string) =>
    M.achievementIndex(
      filterSales(S, { months: new Set([month]) }),
      filterPlan(bundle.plan, { months: new Set([month]) }),
      model.globalPlanRatio
    );

  it('Miền Bắc 124,9 · Miền Nam 99,5 · Miền Trung 78,6', () => {
    expect(Math.round(idxRegion('Miền Bắc')! * 10) / 10).toBe(124.9);
    expect(Math.round(idxRegion('Miền Nam')! * 10) / 10).toBe(99.5);
    expect(Math.round(idxRegion('Miền Trung')! * 10) / 10).toBe(78.6);
  });
  it('T2 = 60,9 (đáy) · T5 = 189,8 (đỉnh)', () => {
    expect(Math.round(idxMonth('2026-02-01')! * 10) / 10).toBe(60.9);
    expect(Math.round(idxMonth('2026-05-01')! * 10) / 10).toBe(189.8);
  });
  it('Slicer T5: Revenue Net = 1.512.309.680', () => {
    expect(
      Math.round(M.revenueNet(filterSales(S, { months: new Set(['2026-05-01']) })))
    ).toBe(1_512_309_680);
  });
  it('Achievement Index theo nhóm hàng: Ắc quy 121,3 · Phụ tùng nhanh 67,0', () => {
    const idxCat = (cat: string) =>
      M.achievementIndex(
        S.filter((s) => s.category_name === cat),
        bundle.plan.filter((p) => p.category_name === cat),
        model.globalPlanRatio
      );
    expect(Math.round(idxCat('Ắc quy')! * 10) / 10).toBe(121.3);
    expect(Math.round(idxCat('Phụ tùng nhanh')! * 10) / 10).toBe(67);
  });
});

describe('Dashboard 2 — số vàng', () => {
  it('Inventory Value EOM = 6.391.770.000 (loại orphan tường minh)', () => {
    expect(Math.round(M.inventoryValueEOM(bundle.inventory))).toBe(6_391_770_000);
  });
  it('OnHand Qty EOM = 10.175', () => {
    expect(M.onHandQtyEOM(bundle.inventory)).toBe(10_175);
  });
  it('Slow & Heavy = 9 item · 2.402.800.000 · 37,6%', () => {
    expect(M.slowHeavyItems(bundle.itemMoc).length).toBe(9);
    expect(Math.round(M.slowHeavyValue(bundle.itemMoc))).toBe(2_402_800_000);
    expect(Math.round(M.slowHeavyPct(bundle.itemMoc)! * 1000) / 10).toBe(37.6);
  });
  it('VT033 (MOC cao nhất) KHÔNG thuộc Slow & Heavy — điều kiện kép', () => {
    const vt033 = bundle.itemMoc.find((m) => m.item_code === 'VT033')!;
    expect(vt033.is_slow_heavy).toBe(false);
    expect(vt033.moc).toBeGreaterThan(60);
  });
  it('Discontinued còn tồn = 580.050.000 = 9,1%', () => {
    expect(Math.round(M.discontinuedValue(bundle.itemMoc))).toBe(580_050_000);
    expect(Math.round(M.discontinuedPct(bundle.itemMoc)! * 1000) / 10).toBe(9.1);
  });
  it('Tồn âm tại EOM mới nhất = 4 dòng (không phải 14 = cả 6 tháng)', () => {
    expect(M.negativeStockRows(bundle.inventory).length).toBe(4);
  });
  it('Dưới safety stock = 40/144 dòng', () => {
    expect(M.belowSafetyRows(bundle.inventory).length).toBe(40);
  });
  it('CK tối đa không lỗ: VT021 15,3% · VT007 21,9% · VT035 19,9%', () => {
    const p = (code: string) =>
      pct2(M.maxDiscountBeforeLoss(model.productByCode.get(code)!));
    expect(Math.round(p('VT021')! * 10) / 10).toBe(15.3);
    expect(Math.round(p('VT007')! * 10) / 10).toBe(21.9);
    expect(Math.round(p('VT035')! * 10) / 10).toBe(19.9);
  });
  it('Tỷ lệ tồn/DT theo vùng kho: MB 1,21 · MN 1,04 · MT 1,53', () => {
    const ratios = Object.fromEntries(
      M.invToRevenueByRegion(model).map((r) => [r.region, round2(r.ratio)])
    );
    expect(ratios['Miền Bắc']).toBe(1.21);
    expect(ratios['Miền Nam']).toBe(1.04);
    expect(ratios['Miền Trung']).toBe(1.53);
  });
});

describe('Dashboard 3 — số vàng', () => {
  it('DQ Score SO = 97,79% (10 dòng bẩn / 452)', () => {
    expect(pct2(M.dqScoreSales(bundle.dqSales))).toBe(97.79);
  });
  it('DQ Score INV = 98,27% (15 dòng / 865)', () => {
    expect(bundle.dqInventory.length).toBe(865);
    expect(pct2(M.dqScoreInventory(bundle.dqInventory))).toBe(98.27);
  });
  it('PV Score = 13,94% (63 dòng / 452) — TÁCH KHỎI DQ', () => {
    expect(pct2(M.pvScore(bundle.dqSales))).toBe(13.94);
  });
  it('Reconciliation tồn kho = 864/865', () => {
    const r = M.reconMatch(bundle.recon);
    expect(r.matched).toBe(864);
    expect(r.total).toBe(865);
  });
  it('Waterfall động: A=5.463.412.100 → E=5.208.670.650, các bước khớp tổng', () => {
    const steps = bundle.waterfall.filter((w) => !w.is_total);
    const total = bundle.waterfall.find((w) => w.is_total)!;
    expect(Math.round(steps.reduce((a, s) => a + s.amount, 0))).toBe(
      Math.round(total.amount)
    );
    expect(Math.round(total.amount)).toBe(5_208_670_650);
  });
  it('3 kịch bản làm sạch: 0% · +2,82% · −5,63%', () => {
    const bias = bundle.cleaningScenarios.map((c) => c.bias_pct);
    expect(bias).toEqual([0, 2.82, -5.63]);
  });
  it('PV theo nhân viên: Dũng 19,3% cao nhất · Chi 9,6% thấp nhất', () => {
    const pv = M.pvBySalesperson(bundle.dqSales);
    expect(pv[0].key).toBe('NV Dũng');
    expect(Math.round(pv[0].pct * 1000) / 10).toBe(19.3);
    expect(pv[pv.length - 1].key).toBe('NV Chi');
    expect(Math.round(pv[pv.length - 1].pct * 1000) / 10).toBe(9.6);
  });
  it('χ² = 4,716 · p = 0,194 — chênh lệch NV không có ý nghĩa thống kê', () => {
    const groups = M.pvBySalesperson(bundle.dqSales).map((g) => ({
      flagged: g.flagged,
      total: g.rows,
    }));
    const { chi2, df, p } = chiSquareIndependence(groups);
    expect(df).toBe(3);
    expect(Math.round(chi2 * 1000) / 1000).toBeCloseTo(4.716, 2);
    expect(Math.round(p * 1000) / 1000).toBeCloseTo(0.194, 2);
  });
  it('Bảng audit = 11 vấn đề, 4 tự tìm trong bảng (vấn đề thứ 5 = PV, ngoài bảng)', () => {
    expect(bundle.auditIssues.length).toBe(11);
    // "5/11 tự tìm" của docs đếm cả vấn đề #12 (63 dòng PV) — cố ý nằm
    // ngoài bảng audit vì thuộc tầng Quy trình (§6.4).
    expect(bundle.auditIssues.filter((i) => !i.in_hint).length).toBe(4);
  });
  it('Checklist = 9 hard + 4 soft + 3 doc', () => {
    const bySev = (s: string) => bundle.auditRules.filter((r) => r.severity === s).length;
    expect(bySev('hard')).toBe(9);
    expect(bySev('soft')).toBe(4);
    expect(bySev('doc')).toBe(3);
  });
});

describe('Bẫy của bộ đề — engine không được rơi vào', () => {
  it('Kênh Nội bộ ĐƯỢC tính vào Revenue Net (~24,5%)', () => {
    const noiBo = M.revenueNet(filterSales(S, { channels: new Set(['Nội bộ']) }));
    expect(pct2(noiBo / M.revenueNet(S))).toBeGreaterThan(20);
    expect(pct2(noiBo / M.revenueNet(S))).toBeLessThan(30);
  });
  it('Lọc Cancelled không đổi Revenue một đồng (49 dòng đều qty_delivered = 0)', () => {
    const all = S.reduce((a, r) => a + r.line_revenue, 0);
    expect(Math.round(all)).toBe(Math.round(M.revenueNet(S)));
  });
  it('Region hai nghĩa: ~2/3 số dòng có vùng khách ≠ vùng kho', () => {
    // Docs ghi 65,7%; tính lại trên 450 dòng sạch = 66,7% (ERRATA E7).
    // Bản chất không đổi: KHÔNG được trộn hai định nghĩa Region.
    const diff = S.filter((s) => s.region !== s.warehouse_region).length;
    const pct = (diff / S.length) * 100;
    expect(pct).toBeGreaterThan(63);
    expect(pct).toBeLessThan(69);
  });
});
