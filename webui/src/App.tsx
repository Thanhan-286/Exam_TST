import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { DataProvider, useData } from './state/DataContext';
import { cssVars, dark, light, ACCENT, ALERT_HIGH, ALERT_MID, DQ_FAMILY, PV_FAMILY, SERIES } from './theme/tokens';
import * as M from './lib/measures';
import { fmtShort, fmtPct, fmtNum, fmtMonth } from './lib/format';
import {
  fetchInvariants,
  fetchLoadBatches,
  parseWorkbook,
  rollbackBatch,
  uploadParsed,
  type ParsedUpload,
} from './lib/upload';
import type { InvariantRow, LoadBatchRow, PlanRow } from './lib/types';
import {
  Badge,
  BarList,
  Card,
  DataTable,
  Donut,
  Footnote,
  Gauge,
  KpiCard,
  LineChart,
  QuadrantScatter,
  Slicer,
  StackedBar,
  Waterfall,
} from './components';
import { type EnrichedSale } from './lib/model';

type Screen = 'exec' | 'inv' | 'dq' | 'upload' | 'dev';

const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: 'exec', label: 'Executive Sales', icon: 'bar-chart-outline' },
  { id: 'inv', label: 'Inventory & Slow', icon: 'cube-outline' },
  { id: 'dq', label: 'Data Quality', icon: 'shield-checkmark-outline' },
  { id: 'upload', label: 'Upload dữ liệu', icon: 'cloud-upload-outline' },
  // Component Lab ẩn khỏi UI — vẫn còn route 'dev' + <DevLab/> để bật lại
  // bằng cách thêm lại dòng: { id: 'dev', label: 'Component Lab', icon: 'grid-outline' }
];

const TITLES: Record<Screen, [string, string]> = {
  exec: ['Executive Sales', 'Dashboard · Doanh thu 01–06/2026'],
  inv: ['Inventory & Slow Moving', 'Dashboard · Tồn kho EOM mới nhất'],
  dq: ['Data Quality', 'Dashboard · Chất lượng dữ liệu & Reconciliation'],
  upload: ['Upload dữ liệu', 'Nạp file Excel vào raw → tự chảy qua mart'],
  dev: ['Component Lab', 'Phase 2 · Thư viện component SVG'],
};

function Shell() {
  const [screen, setScreen] = useState<Screen>('exec');
  const [isDark, setIsDark] = useState(
    () => localStorage.getItem('tst-theme') === 'dark'
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const t = isDark ? dark : light;
  const { model, loading, error } = useData();

  useEffect(() => {
    localStorage.setItem('tst-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const shell: CSSProperties = {
    ...(cssVars(t) as CSSProperties),
    minHeight: '100vh', padding: 18, background: t.bg, color: t.ink,
  };
  const app: CSSProperties = {
    display: 'flex', background: t.card, borderRadius: 26, overflow: 'hidden',
    boxShadow: '0 24px 60px -30px rgba(0,0,0,.35)',
    minHeight: 'calc(100vh - 36px)', maxWidth: 1480, margin: '0 auto',
  };
  const [title, crumb] = TITLES[screen];

  return (
    <div style={shell}>
      <div style={app}>
        {/* SIDEBAR */}
        <aside
          style={{
            flexShrink: 0, overflow: 'hidden', borderRight: `1px solid ${t.sideBrd}`,
            transition: 'width .38s cubic-bezier(.4,0,.2,1)',
            width: sidebarOpen ? 236 : 0,
          }}
        >
          <div style={{ width: 236, padding: '22px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 8px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,6px)', gap: 3 }}>
                {['#1c2420', ACCENT, '#1c2420', ACCENT, '#1c2420', '#bfe3cf', '#1c2420', '#bfe3cf', '#1c2420'].map((c, i) => (
                  <div key={i} style={{ width: 6, height: 6, background: isDark && c === '#1c2420' ? '#eef2ea' : c, borderRadius: 2 }} />
                ))}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>TST Com</div>
              <div style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#5c7a15', background: '#eef7cf', padding: '2px 7px', borderRadius: 20 }}>Report BI</div>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: t.muted, padding: '6px 10px 4px' }}>ANALYTICS</div>
            {NAV.map((n) => (
              <div
                key={n.id}
                onClick={() => setScreen(n.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 12, fontSize: 14, cursor: 'pointer',
                  background: screen === n.id ? ACCENT : 'transparent',
                  color: screen === n.id ? '#1c2420' : t.muted2,
                  fontWeight: screen === n.id ? 700 : 500,
                }}
              >
                <ion-icon name={n.icon} style={{ fontSize: 18, flexShrink: 0 }} />
                <span>{n.label}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* MAIN */}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '22px 28px 14px' }}>
            <div
              onClick={() => setSidebarOpen((v) => !v)}
              title="Thu gọn sidebar"
              style={{ width: 38, height: 38, borderRadius: 11, background: t.soft2, display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}
            >
              <ion-icon name="menu-outline" style={{ fontSize: 22, color: 'var(--muted2)' }} />
            </div>
            <div>
              <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.02em' }}>{title}</div>
              <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>{crumb}</div>
            </div>
            <div
              onClick={() => setIsDark((v) => !v)}
              title="Đổi theme"
              style={{ marginLeft: 'auto', width: 38, height: 38, borderRadius: 11, background: t.soft2, display: 'grid', placeItems: 'center', cursor: 'pointer' }}
            >
              <ion-icon name={isDark ? 'sunny-outline' : 'moon-outline'} style={{ fontSize: 20, color: isDark ? ACCENT : 'var(--muted2)' }} />
            </div>
          </header>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 28px 28px' }}>
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: t.muted2, padding: 40 }}>
                <div style={{ width: 18, height: 18, border: `3px solid ${t.grid}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'lux-spin .8s linear infinite' }} />
                Đang tải dữ liệu từ Supabase…
              </div>
            )}
            {error && (
              <div style={{ background: '#fde8e8', color: '#c0453f', borderRadius: 14, padding: '16px 20px', fontSize: 13, fontWeight: 600 }}>
                Lỗi tải dữ liệu: {error}
              </div>
            )}
            {model && screen === 'exec' && <ExecutiveSalesDashboard />}
            {model && screen === 'inv' && <InventoryDashboard />}
            {model && screen === 'dq' && <DataQualityDashboard />}
            {model && screen === 'upload' && <UploadPanel />}
            {model && screen === 'dev' && <DevLab />}
          </div>
        </main>
      </div>
    </div>
  );
}

// ------- Trang stub Phase 0/1 cho các trang chưa dựng xong -------

function KpiStub({ label, value, note, hi }: { label: string; value: string; note?: string; hi?: boolean }) {
  return (
    <div
      style={{
        border: `1px solid ${hi ? 'var(--kpi-hi-brd)' : 'var(--card-brd)'}`,
        borderRadius: 20, padding: 18,
        background: hi ? 'var(--kpi-hi-bg)' : 'var(--card)',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--muted2)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', margin: '10px 0 8px' }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{note}</div>}
    </div>
  );
}

const grid4: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 16 };

const responsiveKpis: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
  gap: 10,
};

const twoColWide: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1.45fr) minmax(300px,.8fr)',
  gap: 12,
  alignItems: 'start',
};

const twoCol: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
  gap: 12,
  alignItems: 'start',
};

const compactPanelGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1.6fr) minmax(320px,.85fr)',
  gap: 12,
  alignItems: 'stretch',
};

const dateInputStyle: CSSProperties = {
  height: 40,
  border: '1px solid var(--card-brd)',
  borderRadius: 12,
  background: 'var(--card)',
  color: 'var(--ink)',
  font: 'inherit',
  fontSize: 13,
  fontWeight: 800,
  padding: '0 12px',
  outline: 'none',
};

const segmentedButton = (active: boolean): CSSProperties => ({
  border: 'none',
  borderRadius: 8,
  padding: '7px 10px',
  background: active ? 'var(--accent)' : 'transparent',
  color: active ? '#1c2420' : 'var(--muted2)',
  font: 'inherit',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
});

const dayMs = 86_400_000;
const dateMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const dateIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const minDate = (a: string, b: string) => (dateMs(a) <= dateMs(b) ? a : b);
const maxDate = (a: string, b: string) => (dateMs(a) >= dateMs(b) ? a : b);
const addDays = (date: string, days: number) => dateIso(dateMs(date) + days * dayMs);
const daysInclusive = (from: string, to: string) => Math.max(0, Math.round((dateMs(to) - dateMs(from)) / dayMs) + 1);
const monthStartOf = (date: string) => `${date.slice(0, 7)}-01`;
const monthEndOf = (monthStart: string) => dateIso(Date.UTC(Number(monthStart.slice(0, 4)), Number(monthStart.slice(5, 7)), 0));
const inDateRange = (date: string, from: string, to: string) => date >= from && date <= to;
const monthStartsBetween = (from: string, to: string) => {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7)) - 1;
  const end = monthStartOf(to);
  for (;;) {
    const cur = dateIso(Date.UTC(y, m, 1));
    out.push(cur);
    if (cur === end) return out;
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
};

const proratePlan = (plan: PlanRow[], from: string, to: string): PlanRow[] =>
  plan.flatMap((p) => {
    const mStart = monthStartOf(p.month_start);
    const mEnd = monthEndOf(mStart);
    const overlapStart = maxDate(from, mStart);
    const overlapEnd = minDate(to, mEnd);
    const overlapDays = daysInclusive(overlapStart, overlapEnd);
    if (overlapDays <= 0) return [];
    const ratio = overlapDays / daysInclusive(mStart, mEnd);
    return [{ ...p, month_start: mStart, target_revenue: p.target_revenue * ratio }];
  });

const gmColor = (gm: number | null) => {
  if (gm == null) return '#9E9E9E';
  if (gm < 0.13) return '#C0392B';
  if (gm < 0.16) return '#E08E79';
  if (gm < 0.19) return '#BDC3C7';
  if (gm < 0.21) return '#7FB3D5';
  return '#1F618D';
};

function ExecutiveSalesDashboard() {
  const { model } = useData();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [regions, setRegions] = useState(new Set<string>());
  const [channels, setChannels] = useState(new Set<string>());
  const [rankMode, setRankMode] = useState<'top' | 'bottom'>('top');
  const [rankMetric, setRankMetric] = useState<'grossProfit' | 'revenue'>('grossProfit');

  const planMonths = [...new Set(model!.bundle.plan.map((p) => p.month_start))].sort();
  const salesDates = model!.sales.map((s) => s.doc_date).sort();
  const defaultFrom = planMonths[0] ?? salesDates[0] ?? '';
  const defaultTo = planMonths.length ? monthEndOf(planMonths[planMonths.length - 1]) : (salesDates[salesDates.length - 1] ?? defaultFrom);
  const rawFrom = dateFrom || defaultFrom;
  const rawTo = dateTo || defaultTo;
  const rangeFrom = minDate(rawFrom, rawTo);
  const rangeTo = maxDate(rawFrom, rawTo);
  const rangeDays = daysInclusive(rangeFrom, rangeTo);
  const regionOptions = [...new Set(model!.sales.map((s) => s.region))].sort();
  const channelOptions = [...new Set(model!.sales.map((s) => s.channel))].sort();
  const sales = useMemo(() => model!.sales.filter((s) =>
    inDateRange(s.doc_date, rangeFrom, rangeTo) &&
    (!regions.size || regions.has(s.region)) &&
    (!channels.size || channels.has(s.channel))
  ), [model, rangeFrom, rangeTo, regions, channels]);
  const plan = useMemo(() => proratePlan(
    model!.bundle.plan.filter((p) => !regions.size || regions.has(p.market_region)),
    rangeFrom,
    rangeTo
  ), [model, rangeFrom, rangeTo, regions]);
  const globalDateSales = useMemo(() => model!.sales.filter((s) => inDateRange(s.doc_date, rangeFrom, rangeTo)), [model, rangeFrom, rangeTo]);
  const globalDatePlan = useMemo(() => proratePlan(model!.bundle.plan, rangeFrom, rangeTo), [model, rangeFrom, rangeTo]);
  const globalDatePlanRatio = M.target(globalDatePlan) > 0 ? M.revenueInPlanScope(globalDateSales) / M.target(globalDatePlan) : 0;
  const slowHeavy = new Set(model!.bundle.itemMoc.filter((m) => m.is_slow_heavy).map((m) => m.item_code));
  const revenueNet = M.revenueNet(sales);
  const grossMargin = M.grossMargin(sales);
  const grossMarginPct = M.grossMarginPct(sales);
  const fillRate = M.fillRate(sales);
  const pctOfPlan = M.pctOfPlan(sales, plan);
  const achievementIndex = M.achievementIndex(sales, plan, globalDatePlanRatio);

  const monthData = rangeDays <= 45
    ? Array.from({ length: rangeDays }, (_, i) => addDays(rangeFrom, i)).map((day) => {
        const localSales = model!.sales.filter((s) =>
          s.doc_date === day &&
          (!regions.size || regions.has(s.region)) &&
          (!channels.size || channels.has(s.channel))
        );
        const localPlan = proratePlan(model!.bundle.plan.filter((p) => !regions.size || regions.has(p.market_region)), day, day);
        return {
          label: `${day.slice(8, 10)}/${day.slice(5, 7)}`,
          value: M.revenueNet(localSales),
          value2: M.achievementIndex(localSales, localPlan, globalDatePlanRatio) ?? 0,
        };
      })
    : monthStartsBetween(monthStartOf(rangeFrom), monthStartOf(rangeTo)).map((month) => {
        const from = maxDate(rangeFrom, month);
        const to = minDate(rangeTo, monthEndOf(month));
        const localSales = model!.sales.filter((s) =>
          inDateRange(s.doc_date, from, to) &&
          (!regions.size || regions.has(s.region)) &&
          (!channels.size || channels.has(s.channel))
        );
        const localPlan = proratePlan(model!.bundle.plan.filter((p) => !regions.size || regions.has(p.market_region)), from, to);
        return {
          label: fmtMonth(month).slice(0, 2),
          value: M.revenueNet(localSales),
          value2: M.achievementIndex(localSales, localPlan, globalDatePlanRatio) ?? 0,
        };
      });

  const regionBars = groupSales(sales.filter((s) => s.region !== '(Unknown)'), (r) => r.region)
    .map((g, i) => {
      const localPlan = plan.filter((p) => p.market_region === g.key);
      const idx = M.achievementIndex(g.rows, localPlan, model!.globalPlanRatio);
      return {
        label: g.key,
        value: M.revenueNet(g.rows),
        text: `${fmtShort(M.revenueNet(g.rows))} · Index ${fmtNum(idx, 1)}`,
        color: SERIES[i % SERIES.length],
      };
    })
    .sort((a, b) => b.value - a.value);

  const categoryBars = groupSales(sales.filter((s) => s.category_name !== '(Unknown)'), (r) => r.category_name)
    .map((g) => {
      const localPlan = plan.filter((p) => p.category_name === g.key);
      const idx = M.achievementIndex(g.rows, localPlan, model!.globalPlanRatio);
      const gm = M.grossMarginPct(g.rows);
      return {
        label: g.key,
        value: M.revenueNet(g.rows),
        text: `${fmtShort(M.revenueNet(g.rows))} · GM ${fmtPct(gm, 1)} · Index ${fmtNum(idx, 1)}`,
        color: gmColor(gm),
      };
    })
    .sort((a, b) => b.value - a.value);

  const productRows = groupSales(sales, (r) => r.item_code)
    .map((g) => {
      const first = g.rows[0];
      const revenue = M.revenueNet(g.rows);
      const grossProfit = M.grossMargin(g.rows);
      const gm = M.grossMarginPct(g.rows);
      return {
        item: g.key,
        name: first.item_name,
        category: first.category_name,
        revenue,
        grossProfit,
        gm,
        slowHeavy: slowHeavy.has(g.key),
      };
    })
    .filter((r) => r.revenue !== 0 || r.grossProfit !== 0)
    .sort((a, b) => {
      const av = rankMetric === 'grossProfit' ? a.grossProfit : a.revenue;
      const bv = rankMetric === 'grossProfit' ? b.grossProfit : b.revenue;
      return rankMode === 'top' ? bv - av : av - bv;
    })
    .slice(0, 5);

  return (
    <div style={{ animation: 'lux-slide .42s cubic-bezier(.22,.61,.36,1)', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="exec-filter-grid">
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted2)', fontWeight: 800, marginBottom: 7 }}>Khoảng ngày</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 8 }}>
            <input
              type="date"
              value={rawFrom}
              min={salesDates[0]}
              max={salesDates[salesDates.length - 1]}
              onChange={(e) => setDateFrom(e.target.value)}
              style={dateInputStyle}
              aria-label="Từ ngày"
            />
            <input
              type="date"
              value={rawTo}
              min={salesDates[0]}
              max={salesDates[salesDates.length - 1]}
              onChange={(e) => setDateTo(e.target.value)}
              style={dateInputStyle}
              aria-label="Đến ngày"
            />
            <button
              type="button"
              title="Reset về kỳ mặc định"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              style={{ ...dateInputStyle, width: 44, padding: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}
            >
              <ion-icon name="refresh-outline" />
            </button>
          </div>
        </div>
        <Slicer label="Region khách hàng" options={regionOptions} selected={regions} onChange={setRegions} />
        <Slicer label="Channel" options={channelOptions} selected={channels} onChange={setChannels} />
      </div>

      <div style={responsiveKpis}>
        <KpiCard compact highlight icon="cash-outline" label="Revenue Net" value={fmtShort(revenueNet)} note="Doanh thu sạch sau return/cancel" />
        <KpiCard compact icon="wallet-outline" label="Gross Margin" value={fmtShort(grossMargin)} note={`GM ${fmtPct(grossMarginPct)}`} />
        <KpiCard compact icon="swap-horizontal-outline" label="Fill Rate" value={fmtPct(fillRate)} note="Completed + Open" />
        <KpiCard compact icon="speedometer-outline" label="% đạt kế hoạch" value={fmtPct(pctOfPlan)} note={`Index ${fmtNum(achievementIndex, 1)} · Plan prorate`} />
      </div>

      <div className="exec-summary-grid">
        <Card className="compact" title="Net Revenue Trend" subtitle={`${rangeDays <= 45 ? 'Theo ngày' : 'Theo tháng'}: cột = Revenue Net, đường = Achievement Index, plan phân bổ theo ngày`}>
          <LineChart height={198} data={monthData} barLabel="Revenue Net" lineLabel="Index" threshold={100} formatValue={fmtShort} formatLine={(v) => fmtNum(v, 1)} />
        </Card>

        <div style={{ display: 'grid', gap: 12 }}>
          <Card className="compact" title="Revenue by Customer Region" subtitle="Vùng khách hàng; nhãn kèm Index">
            <BarList data={regionBars} />
          </Card>
          <Card className="compact" title="Revenue by Product Group" subtitle="Nhóm hàng; màu theo GM%">
            <BarList data={categoryBars} />
          </Card>
        </div>
      </div>

      <Card
        className="compact"
        title={`${rankMode === 'top' ? 'Top' : 'Bottom'} 5 Products`}
        subtitle="Xếp theo Gross Profit để tránh bẫy Revenue cao nhưng biên thấp"
        action={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', background: 'var(--soft)', borderRadius: 10, padding: 3 }}>
              <button type="button" style={segmentedButton(rankMode === 'top')} onClick={() => setRankMode('top')}>Top</button>
              <button type="button" style={segmentedButton(rankMode === 'bottom')} onClick={() => setRankMode('bottom')}>Bottom</button>
            </div>
            <div style={{ display: 'flex', background: 'var(--soft)', borderRadius: 10, padding: 3 }}>
              <button type="button" style={segmentedButton(rankMetric === 'grossProfit')} onClick={() => setRankMetric('grossProfit')}>Gross Profit</button>
              <button type="button" style={segmentedButton(rankMetric === 'revenue')} onClick={() => setRankMetric('revenue')}>Revenue</button>
            </div>
          </div>
        )}
      >
        <DataTable
          maxHeight={216}
          rows={productRows}
          rowTone={(r) => r.slowHeavy ? 'warn' : undefined}
          columns={[
            {
              key: 'item',
              header: 'Item',
              width: '112px',
              render: (r) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 800, color: 'var(--ink)' }}>
                  {r.slowHeavy && <span title="Slow & Heavy" style={{ width: 8, height: 8, borderRadius: '50%', background: ALERT_MID, flexShrink: 0 }} />}
                  {r.item}
                </span>
              ),
            },
            { key: 'name', header: 'Tên', render: (r) => r.name },
            { key: 'cat', header: 'Nhóm', render: (r) => r.category },
            { key: 'rev', header: 'Revenue', align: 'right', render: (r) => fmtShort(r.revenue) },
            { key: 'gp', header: 'Gross Profit', align: 'right', render: (r) => fmtShort(r.grossProfit) },
            { key: 'gm', header: 'GM%', align: 'right', render: (r) => fmtPct(r.gm, 1) },
          ]}
        />
      </Card>

      <Footnote compact>
        <div>Region = vùng KHÁCH HÀNG (Dashboard 2 dùng vùng KHO — khác nhau).</div>
        <div>Achievement Index = tỷ lệ đạt kế hoạch chuẩn hóa, 100 = mặt bằng chung (6,07%). Chỉ đọc ở cấp vùng / nhóm hàng / tháng. KHÔNG đọc ở từng ô (~3,7 đơn/ô).</div>
        <div>Kênh Nội bộ (24,5% doanh thu) ĐƯỢC tính vào Revenue Net.</div>
        <div>Plan và fact không cùng phạm vi (fact là mẫu ~6%).</div>
        <div>Đã loại 1 dòng trùng, 1 dòng `QtyOrder = 900`. VT999 không có COGS ⇒ loại khỏi GM.</div>
      </Footnote>
    </div>
  );
}

function InventoryDashboard() {
  const { model } = useData();
  const [warehouses, setWarehouses] = useState(new Set<string>());
  const [categories, setCategories] = useState(new Set<string>());
  const [abc, setAbc] = useState(new Set<string>());
  const [statuses, setStatuses] = useState(new Set<string>());
  const [detailTab, setDetailTab] = useState<'heatmap' | 'negative' | 'discontinued'>('heatmap');

  const warehouseOptions = model!.bundle.warehouses.filter((w) => !w.is_unknown).map((w) => w.warehouse_code).sort();
  const categoryOptions = [...new Set(model!.bundle.products.filter((p) => !p.is_unknown).map((p) => p.category_name))].sort();
  const abcOptions = [...new Set(model!.bundle.products.filter((p) => !p.is_unknown).map((p) => p.abc_class))].sort();
  const statusOptions = [...new Set(model!.bundle.products.filter((p) => !p.is_unknown).map((p) => p.item_status))].sort();
  const slowHeavyCodes = new Set(model!.bundle.itemMoc.filter((m) => m.is_slow_heavy).map((m) => m.item_code));

  const productPass = (itemCode: string) => {
    const p = model!.productByCode.get(itemCode);
    if (!p || p.is_unknown) return false;
    return (!categories.size || categories.has(p.category_name)) &&
      (!abc.size || abc.has(p.abc_class)) &&
      (!statuses.size || statuses.has(p.item_status));
  };

  const latestInv = M.latestEom(model!.bundle.inventory).filter((r) =>
    (!warehouses.size || warehouses.has(r.warehouse_code)) &&
    productPass(r.item_code)
  );
  const totalInv = latestInv.reduce((a, r) => a + (r.inventory_value ?? 0), 0);
  const totalQty = latestInv.reduce((a, r) => a + r.on_hand_qty, 0);
  const slowValue = latestInv
    .filter((r) => slowHeavyCodes.has(r.item_code))
    .reduce((a, r) => a + (r.inventory_value ?? 0), 0);
  const discontinuedValue = latestInv
    .filter((r) => model!.productByCode.get(r.item_code)?.item_status === 'Discontinued')
    .reduce((a, r) => a + (r.inventory_value ?? 0), 0);
  const negativeRows = latestInv.filter((r) => r.flag_negative_stock);
  const belowRows = latestInv.filter((r) => r.flag_below_safety);
  const itemInSelectedWarehouse = new Set(latestInv.map((r) => r.item_code));

  const scatterData = model!.bundle.itemMoc
    .filter((m) =>
      productPass(m.item_code) &&
      (!warehouses.size || itemInSelectedWarehouse.has(m.item_code))
    )
    .map((m) => ({
      id: m.item_code,
      label: m.is_slow_heavy ? m.item_code : undefined,
      x: m.moc,
      y: m.inv_value_eom,
      size: m.on_hand_eom,
      colorKey: m.abc_class,
      isHighlight: m.is_slow_heavy,
    }));

  const warehouseBars = warehouseOptions
    .filter((code) => !warehouses.size || warehouses.has(code))
    .map((code, i) => {
      const rows = M.latestEom(model!.bundle.inventory).filter((r) => r.warehouse_code === code && productPass(r.item_code));
      const value = rows.reduce((a, r) => a + (r.inventory_value ?? 0), 0);
      const region = model!.warehouseByCode.get(code)?.warehouse_region ?? '';
      const ratio = M.invToRevenueByRegion(model!).find((r) => r.region === region)?.ratio ?? null;
      return {
        label: `${code} · ${region}`,
        value,
        text: `${fmtShort(value)} · tồn/DT ${fmtNum(ratio, 2)}`,
        color: SERIES[i % SERIES.length],
      };
    })
    .sort((a, b) => b.value - a.value);

  const categoryBars = categoryOptions
    .filter((cat) => !categories.size || categories.has(cat))
    .map((cat) => {
      const rows = latestInv.filter((r) => model!.productByCode.get(r.item_code)?.category_name === cat);
      const value = rows.reduce((a, r) => a + (r.inventory_value ?? 0), 0);
      return {
        label: cat,
        value,
        text: `${fmtShort(value)} · ${fmtPct(totalInv ? value / totalInv : null, 1)}`,
        color: SERIES[categoryOptions.indexOf(cat) % SERIES.length],
      };
    })
    .filter((b) => b.value !== 0)
    .sort((a, b) => b.value - a.value);

  const heatWarehouses = warehouseOptions.filter((w) => !warehouses.size || warehouses.has(w));
  const heatCategories = categoryOptions.filter((c) => !categories.size || categories.has(c));
  const heatRows = heatCategories.map((cat) => ({
    category: cat,
    values: heatWarehouses.map((wh) => {
      const value = latestInv
        .filter((r) => r.warehouse_code === wh && model!.productByCode.get(r.item_code)?.category_name === cat)
        .reduce((a, r) => a + (r.inventory_value ?? 0), 0);
      return { warehouse: wh, value };
    }),
  }));
  const heatMax = Math.max(1, ...heatRows.flatMap((r) => r.values.map((v) => v.value)));

  const negativeTable = negativeRows.map((r) => ({
    item: r.item_code,
    warehouse: r.warehouse_code,
    qty: r.on_hand_qty,
    value: r.inventory_value ?? 0,
    safety: r.safety_stock,
  }));

  const discontinuedTable = model!.bundle.products
    .filter((p) => p.item_status === 'Discontinued' && productPass(p.item_code))
    .map((p) => {
      const rows = latestInv.filter((r) => r.item_code === p.item_code);
      return {
        item: p.item_code,
        qty: rows.reduce((a, r) => a + r.on_hand_qty, 0),
        value: rows.reduce((a, r) => a + (r.inventory_value ?? 0), 0),
        maxDiscount: M.maxDiscountBeforeLoss(p),
      };
    })
    .filter((r) => r.value !== 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div style={{ animation: 'lux-slide .42s cubic-bezier(.22,.61,.36,1)', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
        <Slicer label="Kho" options={warehouseOptions} selected={warehouses} onChange={setWarehouses} />
        <Slicer label="Nhóm hàng" options={categoryOptions} selected={categories} onChange={setCategories} />
        <Slicer label="ABC" options={abcOptions} selected={abc} onChange={setAbc} />
        <Slicer label="Status" options={statusOptions} selected={statuses} onChange={setStatuses} />
      </div>

      <div style={responsiveKpis}>
        <KpiCard compact highlight icon="cube-outline" label="Tổng giá trị tồn" value={fmtShort(totalInv)} note={`${fmtNum(totalQty, 0)} đơn vị`} />
        <KpiCard compact icon="archive-outline" label="Vốn mắc kẹt" value={fmtShort(slowValue)} note={fmtPct(totalInv ? slowValue / totalInv : null, 1)} tone="warn" />
        <KpiCard compact icon="ban-outline" label="Discontinued" value={fmtShort(discontinuedValue)} note={fmtPct(totalInv ? discontinuedValue / totalInv : null, 1)} tone="bad" />
        <KpiCard compact icon="remove-circle-outline" label="Tồn âm" value={`${negativeRows.length} dòng`} note="Không set = 0" tone="bad" />
        <KpiCard compact icon="warning-outline" label="Dưới safety" value={`${belowRows.length}/${latestInv.length}`} note={fmtPct(latestInv.length ? belowRows.length / latestInv.length : null, 1)} tone="warn" />
      </div>

      <div style={compactPanelGrid}>
        <Card className="compact" title="Slow & Heavy Quadrant" subtitle="X=MOC · Y=giá trị tồn · bubble=on_hand · màu=ABC">
          <QuadrantScatter
            data={scatterData}
            xThreshold={12}
            yThreshold={model!.bundle.itemMoc[0]?.median_inv_value ?? 127_610_000}
            xLabel="MOC (tháng)"
            yLabel="Giá trị tồn"
          />
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card className="compact" title="Inventory by Warehouse" subtitle="Tồn/DT theo vùng kho">
            <BarList data={warehouseBars} />
          </Card>
          <Card className="compact" title="Inventory by Product Group" subtitle="Tỷ trọng tồn kho">
            <BarList data={categoryBars} />
          </Card>
        </div>
      </div>

      <Card
        className="compact"
        title="Inventory Details"
        subtitle="Heatmap và bảng chi tiết dùng tab để giảm scroll"
        action={(
          <div className="ui-panel-tabs">
            <button type="button" className={`ui-panel-tab ${detailTab === 'heatmap' ? 'active' : ''}`} onClick={() => setDetailTab('heatmap')}>Heatmap</button>
            <button type="button" className={`ui-panel-tab ${detailTab === 'negative' ? 'active' : ''}`} onClick={() => setDetailTab('negative')}>Tồn âm</button>
            <button type="button" className={`ui-panel-tab ${detailTab === 'discontinued' ? 'active' : ''}`} onClick={() => setDetailTab('discontinued')}>Discontinued</button>
          </div>
        )}
      >
        {detailTab === 'heatmap' && <InventoryHeatmap rows={heatRows} max={heatMax} />}
        {detailTab === 'negative' && (
          <DataTable
            maxHeight={220}
            rows={negativeTable}
            rowTone={() => 'bad'}
            columns={[
              { key: 'item', header: 'Item', width: '88px', render: (r) => <span style={{ fontWeight: 800, color: 'var(--ink)' }}>{r.item}</span> },
              { key: 'wh', header: 'Kho', width: '82px', render: (r) => r.warehouse },
              { key: 'qty', header: 'OnHand', align: 'right', render: (r) => fmtNum(r.qty, 0) },
              { key: 'value', header: 'Value', align: 'right', render: (r) => fmtShort(r.value) },
              { key: 'safety', header: 'Safety', align: 'right', render: (r) => fmtNum(r.safety, 0) },
            ]}
          />
        )}
        {detailTab === 'discontinued' && (
          <DataTable
            maxHeight={220}
            rows={discontinuedTable}
            rowTone={() => 'warn'}
            columns={[
              { key: 'item', header: 'Item', width: '88px', render: (r) => <span style={{ fontWeight: 800, color: 'var(--ink)' }}>{r.item}</span> },
              { key: 'qty', header: 'Tồn', align: 'right', render: (r) => fmtNum(r.qty, 0) },
              { key: 'value', header: 'Value', align: 'right', render: (r) => fmtShort(r.value) },
              { key: 'disc', header: 'CK tối đa', align: 'right', render: (r) => fmtPct(r.maxDiscount, 1) },
            ]}
          />
        )}
      </Card>

      <Footnote compact>
        <div>Region ở trang này = vùng KHO (Dashboard 1 dùng vùng KHÁCH HÀNG).</div>
        <div>Đã loại dòng orphan VT999 (WH_HN, 50 đv, 5.000.000 VNĐ).</div>
        <div>Slow & Heavy = Giá trị tồn &gt; trung vị (127.610.000) VÀ MOC &gt; 12 tháng. Xếp hạng chỉ theo MOC sẽ cho cảnh báo sai (VT033: MOC 65,7 nhưng chỉ 72,8 tr vốn).</div>
        <div>Tồn âm KHÔNG được set = 0 — là dấu hiệu lỗi quy trình, cần điều tra.</div>
      </Footnote>
    </div>
  );
}

function InventoryHeatmap({
  rows,
  max,
}: {
  rows: { category: string; values: { warehouse: string; value: number }[] }[];
  max: number;
}) {
  const warehouses = rows[0]?.values.map((v) => v.warehouse) ?? [];
  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          minWidth: Math.max(560, 140 + warehouses.length * 118),
          display: 'grid',
          gridTemplateColumns: `140px repeat(${warehouses.length}, minmax(92px,1fr))`,
          gap: 6,
          alignItems: 'stretch',
        }}
      >
        <div />
        {warehouses.map((w) => (
          <div key={w} style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', padding: '0 8px 4px', textAlign: 'right' }}>{w}</div>
        ))}
        {rows.map((row) => (
          <Fragment key={row.category}>
            <div style={{ color: 'var(--muted2)', fontSize: 12, fontWeight: 800, padding: '10px 8px', borderTop: '1px solid var(--row-brd)' }}>{row.category}</div>
            {row.values.map((v) => {
              const intensity = v.value / max;
              return (
                <div
                  key={`${row.category}-${v.warehouse}`}
                  className="ui-heat-cell"
                  title={`${row.category} · ${v.warehouse}: ${fmtShort(v.value)}`}
                  style={{
                    minHeight: 34,
                    borderRadius: 8,
                    padding: '8px',
                    textAlign: 'right',
                    fontSize: 12,
                    fontWeight: 800,
                    color: intensity > .55 ? '#1c2420' : 'var(--muted2)',
                    background: `rgba(205,238,107,${0.12 + intensity * 0.72})`,
                    border: '1px solid var(--row-brd)',
                  }}
                >
                  {fmtShort(v.value)}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function DataQualityDashboard() {
  const { model } = useData();
  const [detailTab, setDetailTab] = useState<'audit' | 'dq' | 'pv' | 'rules' | 'limits'>('audit');
  const dq = model!.bundle.dqSales;
  const dqi = model!.bundle.dqInventory;
  const recon = M.reconMatch(model!.bundle.recon);
  const scen = model!.bundle.cleaningScenarios;
  const biasNoClean = scen.find((s) => s.scenario_order === 2)?.bias_pct ?? null;
  const biasBadDedupe = scen.find((s) => s.scenario_order === 3)?.bias_pct ?? null;
  const noCleanRevenue = scen.find((s) => s.scenario_order === 2)?.revenue_net ?? 0;
  const badDedupeRevenue = scen.find((s) => s.scenario_order === 3)?.revenue_net ?? 0;
  const pvRows = M.pvBySalesperson(dq).map((r) => ({
    ...r,
    label: r.key.replace(/^NV\s*/, ''),
    color: PV_FAMILY,
    text: `${r.flagged}/${r.rows} · ${fmtPct(r.pct, 1)}`,
  }));
  const dqMonthRows = M.dqByMonth(dq).map((r) => ({
    ...r,
    label: fmtMonth(r.key),
    color: DQ_FAMILY,
    text: `${r.flagged}/${r.rows} bẩn · ${fmtPct(1 - r.pct, 1)}`,
  }));
  const dqWarehouseRows = M.dqByWarehouse(dq).map((r) => ({
    ...r,
    label: r.key,
    color: DQ_FAMILY,
    text: `${r.flagged}/${r.rows} bẩn · ${fmtPct(1 - r.pct, 1)}`,
  }));
  const ruleRows = model!.bundle.auditRules;
  const hardRules = ruleRows.filter((r) => r.severity === 'hard');
  const softRules = ruleRows.filter((r) => r.severity === 'soft');
  const docRules = ruleRows.filter((r) => r.severity === 'doc');
  const unanswered = [
    ['Vì sao VT018 tồn âm?', 'Snapshot cuối tháng, không có bảng phát sinh nhập/xuất.'],
    ['Ai nhập sai UnitPrice = 0?', 'Không có CreatedBy/ModifiedAt; Salesperson là người bán, không chắc là người nhập.'],
    ['Vì sao OrderNo bị trùng?', 'Không có log hệ thống; chỉ kết luận được OrderNo không phải khóa.'],
    ['Vì sao QtyOrder = 900?', 'Chứng minh được dòng sai, không biết nguyên nhân nhập liệu/test.'],
    ['Plan lập theo cơ sở nào?', 'Không có metadata; chỉ chứng minh được plan không cùng phạm vi với fact.'],
  ];
  const detailDescriptions: Record<typeof detailTab, string> = {
    audit: 'Danh sách 11 vấn đề đã phát hiện; dòng “Tự tìm” là lỗi không có trong sheet gợi ý.',
    dq: 'Theo dõi dòng bẩn theo tháng/kho; chênh lệch nhỏ là nhiễu vì chỉ có 10 dòng bẩn.',
    pv: 'Đo vi phạm quy trình theo nhân viên bán hàng; không phải DQ Score theo nhân viên.',
    rules: 'Chuyển phát hiện audit thành rule vận hành: chặn cứng, cảnh báo mềm, tài liệu hóa.',
    limits: 'Những câu hỏi không thể trả lời vì thiếu log, phát sinh kho hoặc metadata.',
  };

  return (
    <div style={{ animation: 'lux-slide .42s cubic-bezier(.22,.61,.36,1)', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={responsiveKpis}>
        <KpiCard compact highlight icon="shield-checkmark-outline" label="DQ Score SO" value={fmtPct(M.dqScoreSales(dq))} note={`INV ${fmtPct(M.dqScoreInventory(dqi))}`} tone="dq" />
        <KpiCard compact icon="git-branch-outline" label="PV Score" value={fmtPct(M.pvScore(dq))} note="Quy trình, không trộn DQ" tone="pv" />
        <KpiCard compact icon="analytics-outline" label="Không làm sạch" value={`+${fmtNum(biasNoClean, 2)}%`} note={fmtShort(noCleanRevenue)} tone="warn" />
        <KpiCard compact icon="cut-outline" label="Dedupe sai" value={`${fmtNum(biasBadDedupe, 2)}%`} note="−293,1 tr" tone="bad" />
        <KpiCard compact icon="checkmark-done-outline" label="Recon tồn kho" value={`${recon.matched}/${recon.total}`} note="Lệch = VT999" tone="dq" />
      </div>

      <div style={compactPanelGrid}>
        <Card className="compact" title="Revenue Reconciliation" subtitle="Từ gross revenue về Revenue Net sạch; cho thấy lỗi nào tác động trực tiếp bằng tiền.">
          <Waterfall
            data={model!.bundle.waterfall.map((w) => ({ label: w.step_code, value: w.amount, isTotal: w.is_total }))}
            formatValue={fmtShort}
          />
        </Card>
        <Card className="compact" title="Three Error Layers" subtitle="Tách lỗi dữ liệu, lỗi quy trình và lỗi thiết kế để không đổ nhầm trách nhiệm cho một đội.">
          <div style={{ display: 'grid', gap: 10 }}>
            {model!.bundle.errorLayers.map((layer) => {
              const tone = layer.layer_order === 1 ? DQ_FAMILY : layer.layer_order === 2 ? PV_FAMILY : ALERT_MID;
              return (
                <div key={layer.layer_order} style={{ borderLeft: `4px solid ${tone}`, background: 'var(--soft)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{layer.layer}</div>
                    <div style={{ fontSize: 10, color: tone, fontWeight: 800 }}>{layer.owner}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 4 }}>{layer.question}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{layer.metric}</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card
        className="compact"
        title="Data Quality Workspace"
        subtitle={detailDescriptions[detailTab]}
        action={(
          <div className="ui-panel-tabs">
            <button type="button" className={`ui-panel-tab ${detailTab === 'audit' ? 'active' : ''}`} onClick={() => setDetailTab('audit')}>Audit</button>
            <button type="button" className={`ui-panel-tab ${detailTab === 'dq' ? 'active' : ''}`} onClick={() => setDetailTab('dq')}>DQ</button>
            <button type="button" className={`ui-panel-tab ${detailTab === 'pv' ? 'active' : ''}`} onClick={() => setDetailTab('pv')}>PV</button>
            <button type="button" className={`ui-panel-tab ${detailTab === 'rules' ? 'active' : ''}`} onClick={() => setDetailTab('rules')}>Rules</button>
            <button type="button" className={`ui-panel-tab ${detailTab === 'limits' ? 'active' : ''}`} onClick={() => setDetailTab('limits')}>Limits</button>
          </div>
        )}
      >
        {detailTab === 'audit' && (
          <DataTable
            maxHeight={260}
            rows={model!.bundle.auditIssues}
            rowTone={(r) => !r.in_hint ? 'warn' : undefined}
            columns={[
              { key: 'no', header: '#', width: '52px', render: (r) => r.issue_no },
              { key: 'hint', header: 'Hint?', width: '70px', align: 'center', render: (r) => r.in_hint ? <Badge tone="good">Có</Badge> : <Badge tone="warn">Tự tìm</Badge> },
              { key: 'issue', header: 'Vấn đề', render: (r) => r.issue },
              { key: 'rows', header: 'Dòng', width: '90px', render: (r) => r.rows_affected },
              { key: 'money', header: 'Ảnh hưởng', width: '150px', render: (r) => r.money_impact },
              { key: 'rule', header: 'Rule', width: '90px', render: (r) => <span style={{ fontWeight: 800 }}>{r.future_rule}</span> },
            ]}
          />
        )}
        {detailTab === 'dq' && (
          <div style={twoCol}>
            <Card className="compact" title="DQ theo tháng" subtitle="Theo dõi dòng bẩn theo tháng; chênh lệch nhỏ là nhiễu vì chỉ có 10 dòng bẩn.">
              <BarList data={dqMonthRows.map((r) => ({ label: r.label, value: r.flagged, text: r.text, color: DQ_FAMILY }))} />
            </Card>
            <Card className="compact" title="DQ theo kho" subtitle="Theo dõi dòng bẩn theo kho; không dùng để kết luận kho nào vận hành kém.">
              <BarList data={dqWarehouseRows.map((r) => ({ label: r.label, value: r.flagged, text: r.text, color: DQ_FAMILY }))} />
            </Card>
          </div>
        )}
        {detailTab === 'pv' && (
          <div style={twoCol}>
            <Card className="compact" title="PV Score by Salesperson" subtitle="Đo vi phạm quy trình theo nhân viên bán hàng; không phải DQ Score theo nhân viên.">
              <BarList data={pvRows.map((r) => ({ label: r.label, value: r.flagged, text: r.text, color: PV_FAMILY }))} />
            </Card>
            <Card className="compact" title="Statistical Guardrail" subtitle="Ngăn xếp hạng nhân viên bằng khác biệt chưa có ý nghĩa thống kê.">
              <div style={{ fontSize: 26, fontWeight: 800, color: PV_FAMILY, marginBottom: 8 }}>χ²=4,716 · p=0,194</div>
              <Footnote compact>
                Chênh lệch PV giữa nhân viên chưa có ý nghĩa thống kê ở mức 5%. KHÔNG tạo measure “DQ Score theo nhân viên”; chỉ 3 dòng là lỗi nhân viên thật.
              </Footnote>
            </Card>
          </div>
        )}
        {detailTab === 'rules' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
            <RuleList title={`Hard block (${hardRules.length})`} rows={hardRules} tone="bad" />
            <RuleList title={`Soft warning (${softRules.length})`} rows={softRules} tone="warn" />
            <RuleList title={`Document (${docRules.length})`} rows={docRules} tone="dq" />
          </div>
        )}
        {detailTab === 'limits' && (
          <DataTable
            maxHeight={220}
            rows={unanswered}
            columns={[
              { key: 'q', header: 'Câu hỏi', render: (r) => r[0] },
              { key: 'why', header: 'Vì sao trang này không trả lời được', render: (r) => r[1] },
            ]}
          />
        )}
      </Card>

      <Footnote compact>
        Dashboard này chứng minh số liệu ở Dashboard 1 và 2 đáng tin đến mức nào, định lượng phần không đáng tin bằng tiền, và chỉ ra ai phải sửa cái gì. DQ Score đo lỗi dữ liệu; PV Score đo vi phạm quy trình; lỗi thiết kế không đo bằng phần trăm.
      </Footnote>
    </div>
  );
}

function RuleList({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: { rule_code: string; description: string; enforceable_in_db: boolean }[];
  tone: 'bad' | 'warn' | 'dq';
}) {
  return (
    <div style={{ border: '1px solid var(--card-brd)', borderRadius: 12, padding: 12, background: 'var(--soft)' }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflow: 'auto' }}>
        {rows.map((r) => (
          <div key={r.rule_code} style={{ display: 'grid', gridTemplateColumns: '54px minmax(0,1fr)', gap: 8, alignItems: 'start', fontSize: 12 }}>
            <Badge tone={tone}>{r.rule_code}</Badge>
            <div>
              <div style={{ color: 'var(--muted2)', lineHeight: 1.35 }}>{r.description}</div>
              <div style={{ color: 'var(--muted)', fontSize: 10, marginTop: 2 }}>{r.enforceable_in_db ? 'DB enforceable' : 'Document only'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UploadPanel() {
  const { reload } = useData();
  const [parsed, setParsed] = useState<ParsedUpload | null>(null);
  const [invariants, setInvariants] = useState<InvariantRow[]>([]);
  const [batches, setBatches] = useState<LoadBatchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchInvariants(), fetchLoadBatches()])
      .then(([inv, hist]) => {
        setInvariants(inv);
        setBatches(hist);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const next = await parseWorkbook(file);
      setParsed(next);
      setMessage(`Đã parse ${Object.values(next.rowCounts).reduce((a, n) => a + n, 0)} dòng từ ${Object.keys(next.rowCounts).length} sheet.`);
    } catch (e) {
      setError((e as Error).message);
      setParsed(null);
    } finally {
      setBusy(false);
    }
  };

  const doUpload = async () => {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await uploadParsed(parsed);
      setInvariants(result.invariants);
      setBatches(result.batches);
      setMessage(`Upload batch #${result.batchId} thành công. Dashboard đã reload.`);
      setParsed(null);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doRollback = async (batchId: number) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await rollbackBatch(batchId);
      setInvariants(result.invariants);
      setBatches(result.batches);
      setMessage(`Rollback batch #${batchId} thành công. Dashboard đã reload.`);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ animation: 'lux-slide .42s cubic-bezier(.22,.61,.36,1)', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={compactPanelGrid}>
        <Card className="compact" title="Upload Excel" subtitle="Parse file snapshot → raw.* theo batch mới nhất → mart tự cập nhật">
          <div style={{ display: 'grid', gap: 12 }}>
            <label
              style={{
                border: '1px dashed var(--card-brd)',
                borderRadius: 14,
                padding: 18,
                display: 'grid',
                placeItems: 'center',
                gap: 8,
                background: 'var(--soft)',
                cursor: 'pointer',
              }}
            >
              <ion-icon name="cloud-upload-outline" style={{ fontSize: 28, color: 'var(--link)' }} />
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Chọn file Excel</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Upload file đầy đủ 7 sheet; batch loaded mới nhất là snapshot active</div>
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={busy}
                style={{ display: 'none' }}
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
            </label>

            {parsed && (
              <div style={{ border: '1px solid var(--card-brd)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{parsed.fileName}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, wordBreak: 'break-all' }}>SHA-256: {parsed.fileHash}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {Object.entries(parsed.rowCounts).map(([table, count]) => <Badge key={table} tone="dq">{table}: {count}</Badge>)}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void doUpload()}
                  style={{ marginTop: 12, border: 'none', borderRadius: 10, background: 'var(--accent)', color: '#1c2420', fontWeight: 800, padding: '10px 14px', cursor: 'pointer' }}
                >
                  {busy ? 'Đang upload…' : 'Upload snapshot'}
                </button>
              </div>
            )}

            {message && <div style={{ color: '#3f9a5a', fontSize: 12, fontWeight: 800 }}>{message}</div>}
            {error && <div style={{ color: ALERT_HIGH, fontSize: 12, fontWeight: 800 }}>{error}</div>}
            <Footnote compact>
              `last_receipt_serial` được giữ nguyên số serial Excel. UI không dedupe, không sửa tồn âm, không convert riêng cột này.
            </Footnote>
          </div>
        </Card>

        <Card className="compact" title="Invariant Checks" subtitle="11 bất biến đọc từ mart.invariant_checks sau upload/rollback">
          <DataTable
            maxHeight={330}
            rows={invariants}
            rowTone={(r) => r.ok ? undefined : 'bad'}
            columns={[
              { key: 'no', header: '#', width: '42px', render: (r) => r.no },
              { key: 'ok', header: 'OK', width: '72px', align: 'center', render: (r) => <Badge tone={r.ok ? 'good' : 'bad'}>{r.ok ? 'OK' : 'Fail'}</Badge> },
              { key: 'inv', header: 'Invariant', render: (r) => r.invariant },
              { key: 'detail', header: 'Detail', render: (r) => r.detail },
            ]}
          />
        </Card>
      </div>

      <Card className="compact" title="Load Batches" subtitle="Lịch sử upload; batch seed #1 không rollback được">
        <DataTable
          maxHeight={300}
          rows={batches}
          rowTone={(r) => r.status === 'rolled_back' ? 'warn' : undefined}
          columns={[
            { key: 'id', header: 'Batch', width: '78px', render: (r) => `#${r.batch_id}` },
            { key: 'file', header: 'File', render: (r) => r.file_name },
            { key: 'status', header: 'Status', width: '130px', render: (r) => <Badge tone={r.is_active ? 'dq' : r.status === 'loaded' ? 'good' : 'warn'}>{r.is_active ? 'active' : r.status}</Badge> },
            { key: 'rows', header: 'Rows', render: (r) => r.row_counts ? Object.entries(r.row_counts).map(([k, v]) => `${k}:${v}`).join(' · ') : '—' },
            { key: 'at', header: 'Loaded at', width: '180px', render: (r) => new Date(r.loaded_at).toLocaleString('vi-VN') },
            {
              key: 'act',
              header: '',
              width: '120px',
              align: 'right',
              render: (r) => r.status === 'loaded' && r.batch_id !== 1 ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void doRollback(r.batch_id)}
                  style={{ border: 'none', borderRadius: 9, background: 'var(--soft)', color: ALERT_HIGH, fontWeight: 800, padding: '7px 10px', cursor: 'pointer' }}
                >
                  Rollback
                </button>
              ) : '',
            },
          ]}
        />
      </Card>
    </div>
  );
}

function groupSales(
  rows: EnrichedSale[],
  keyOf: (r: EnrichedSale) => string
): { key: string; rows: EnrichedSale[] }[] {
  const map = new Map<string, EnrichedSale[]>();
  for (const r of rows) {
    const key = keyOf(r);
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  return [...map.entries()].map(([key, grouped]) => ({ key, rows: grouped }));
}

function DevLab() {
  const { model } = useData();
  const [selected, setSelected] = useState(new Set<string>());
  const sales = model!.sales;
  const plan = model!.bundle.plan;
  const monthData = groupSales(sales, (r) => r.month_start)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((g) => {
      const planRows = plan.filter((p) => p.month_start === g.key);
      return {
        label: fmtMonth(g.key).slice(0, 2),
        value: M.revenueNet(g.rows),
        value2: M.achievementIndex(g.rows, planRows, model!.globalPlanRatio) ?? 0,
      };
    });
  const categoryBars = groupSales(sales, (r) => r.category_name)
    .map((g, i) => ({
      label: g.key,
      value: M.revenueNet(g.rows),
      text: fmtShort(M.revenueNet(g.rows)),
      color: SERIES[i % SERIES.length],
    }))
    .sort((a, b) => b.value - a.value);
  const donutData = categoryBars.slice(0, 6);
  const latestByWarehouse = model!.bundle.warehouses
    .filter((w) => !w.is_unknown)
    .map((w, i) => {
      const rows = M.latestEom(model!.bundle.inventory).filter((r) => r.warehouse_code === w.warehouse_code);
      const value = rows.reduce((a, r) => a + (r.inventory_value ?? 0), 0);
      return { label: w.warehouse_code, value, text: fmtShort(value), color: SERIES[i % SERIES.length] };
    })
    .sort((a, b) => b.value - a.value);
  const scatter = model!.bundle.itemMoc.map((m) => ({
    id: m.item_code,
    label: m.is_slow_heavy ? m.item_code : undefined,
    x: m.moc,
    y: m.inv_value_eom,
    size: m.on_hand_eom,
    colorKey: m.abc_class,
    isHighlight: m.is_slow_heavy,
  }));
  const waterfall = model!.bundle.waterfall.map((w) => ({
    label: w.step_code,
    value: w.amount,
    isTotal: w.is_total,
  }));
  const pvRows = M.pvBySalesperson(model!.bundle.dqSales).map((r) => ({
    ...r,
    label: r.key.replace(/^NV\s*/, ''),
  }));
  const options = [...new Set(sales.map((s) => s.region))].sort();
  const filteredRegions = selected.size ? options.filter((o) => selected.has(o)) : options;

  return (
    <div style={{ animation: 'lux-slide .42s cubic-bezier(.22,.61,.36,1)', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 16 }}>
        <KpiCard highlight icon="cash-outline" label="Revenue Net" value={fmtShort(M.revenueNet(sales))} note="KPI card · dùng dữ liệu mart thật" />
        <KpiCard icon="trending-up-outline" label="Gross Margin %" value={fmtPct(M.grossMarginPct(sales))} note="Mẫu số = dòng có standard_cost" tone="good" />
        <KpiCard icon="alert-circle-outline" label="Tồn âm" value={`${M.negativeStockRows(model!.bundle.inventory).length} dòng`} note="Không set = 0" tone="bad" />
        <KpiCard icon="analytics-outline" label="PV Score" value={fmtPct(M.pvScore(model!.bundle.dqSales))} note="Màu PV riêng, không trộn DQ" tone="pv" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(280px,.8fr)', gap: 18 }}>
        <Card title="LineChart + Column" subtitle="Revenue theo tháng + Achievement Index, mốc 100">
          <LineChart
            data={monthData}
            barLabel="Revenue"
            lineLabel="Index"
            threshold={100}
            formatValue={fmtShort}
            formatLine={(v) => fmtNum(v, 1)}
          />
        </Card>
        <Card title="Gauge + Badge" subtitle="Achievement Index tổng">
          <Gauge value={M.achievementIndex(sales, plan, model!.globalPlanRatio) ?? 0} label="100 = mặt bằng chung" />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            <Badge tone="good">DQ {fmtPct(M.dqScoreSales(model!.bundle.dqSales))}</Badge>
            <Badge tone="pv">PV {fmtPct(M.pvScore(model!.bundle.dqSales))}</Badge>
            <Badge tone="bad">Dedup sai -5,63%</Badge>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,.8fr) minmax(260px,.8fr) minmax(260px,.8fr)', gap: 18 }}>
        <Card title="BarList" subtitle="Revenue theo nhóm hàng">
          <BarList data={categoryBars} />
        </Card>
        <Card title="Donut" subtitle="Share doanh thu theo nhóm hàng">
          <Donut data={donutData} centerTop="Revenue" centerBottom={fmtShort(M.revenueNet(sales))} />
        </Card>
        <Card title="StackedBar + Slicer" subtitle="Slicer multi-select hoạt động thật">
          <div style={{ marginBottom: 16 }}>
            <Slicer label="Region khách hàng" options={options} selected={selected} onChange={setSelected} />
          </div>
          <StackedBar data={latestByWarehouse} valueLabel={fmtShort} />
          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--muted2)' }}>
            Đang chọn: {filteredRegions.join(' · ')}
          </div>
        </Card>
      </div>

      <Card title="QuadrantScatter" subtitle="X=MOC · Y=giá trị tồn · bubble=on_hand · label đúng Slow & Heavy">
        <QuadrantScatter
          data={scatter}
          xThreshold={12}
          yThreshold={model!.bundle.itemMoc[0]?.median_inv_value ?? 127_610_000}
          xLabel="MOC (tháng)"
          yLabel="Giá trị tồn"
        />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18 }}>
        <Card title="Waterfall" subtitle="Audit revenue reconciliation">
          <Waterfall data={waterfall} formatValue={(v) => fmtShort(v)} />
        </Card>
        <Card title="DataTable" subtitle="PV theo nhân viên, kèm cảnh báo thống kê">
          <DataTable
            rows={pvRows}
            columns={[
              { key: 'nv', header: 'NV', render: (r) => r.label },
              { key: 'rows', header: 'Dòng', align: 'right', render: (r) => r.rows },
              { key: 'flag', header: 'PV', align: 'right', render: (r) => r.flagged },
              { key: 'pct', header: '%', align: 'right', render: (r) => fmtPct(r.pct, 1) },
            ]}
            rowTone={(r) => r.pct > .18 ? 'warn' : undefined}
          />
          <div style={{ marginTop: 14 }}>
            <Footnote>χ²=4,716; p=0,194. Chênh lệch PV theo nhân viên chưa có ý nghĩa thống kê ở mức 5%.</Footnote>
          </div>
        </Card>
      </div>

      <Footnote>
        Component Lab là màn nghiệm thu Phase 2. Sau khi bạn check style ở đây, mình sẽ dùng chính các component này để dựng Dashboard 1/2/3.
      </Footnote>
    </div>
  );
}

export default function App() {
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}
