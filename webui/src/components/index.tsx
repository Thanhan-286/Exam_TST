import { useMemo, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { ACCENT, ALERT_HIGH, ALERT_MID, DQ_FAMILY, GOOD, PV_FAMILY, SERIES } from '../theme/tokens';

type DivProps = {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const safeMax = (values: number[]) => Math.max(1, ...values.map((v) => Math.abs(v)));
const fmt = (n: number, digits = 0) =>
  n.toLocaleString('vi-VN', { maximumFractionDigits: digits, minimumFractionDigits: digits });

type LocalTip = { x: number; y: number; text: string };

const localTip = (
  e: MouseEvent<Element>,
  ref: RefObject<HTMLElement>,
  text: string
): LocalTip => {
  const rect = ref.current?.getBoundingClientRect();
  return {
    x: rect ? e.clientX - rect.left : 0,
    y: rect ? e.clientY - rect.top : 0,
    text,
  };
};

export function Card({ title, subtitle, action, children, className = '' }: DivProps) {
  return (
    <section className={`ui-card ${className}`}>
      {(title || subtitle || action) && (
        <div className="ui-card-header">
          <div>
            {title && <div className="ui-card-title">{title}</div>}
            {subtitle && <div className="ui-card-subtitle">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'dq' | 'pv';
}) {
  const colors = {
    neutral: ['var(--soft)', 'var(--muted2)'],
    good: ['#e8f6ec', GOOD],
    warn: ['#fff4dd', ALERT_MID],
    bad: ['#fde8e8', ALERT_HIGH],
    dq: ['#e9f4e2', DQ_FAMILY],
    pv: ['#eee9f7', PV_FAMILY],
  }[tone];
  return (
    <span className="ui-badge" style={{ background: colors[0], color: colors[1] }}>
      {children}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  note,
  icon = 'ellipse-outline',
  tone = 'neutral',
  highlight = false,
  compact = false,
}: {
  label: string;
  value: string;
  note?: string;
  icon?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'dq' | 'pv';
  highlight?: boolean;
  compact?: boolean;
}) {
  const accent = tone === 'bad' ? ALERT_HIGH : tone === 'warn' ? ALERT_MID : tone === 'pv' ? PV_FAMILY : tone === 'dq' ? DQ_FAMILY : ACCENT;
  return (
    <Card className={`ui-kpi ${compact ? 'compact' : ''}`} title="">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div className="ui-kpi-label">{label}</div>
        <div
          className="ui-icon-box"
          style={{
            background: highlight ? 'var(--kpi-hi-bg)' : 'var(--soft)',
            color: accent,
            border: highlight ? '1px solid var(--kpi-hi-brd)' : 'none',
          }}
        >
          <ion-icon name={icon} />
        </div>
      </div>
      <div className="ui-kpi-value">{value}</div>
      {note && <div className="ui-kpi-note">{note}</div>}
    </Card>
  );
}

export function Footnote({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return <div className={`ui-footnote ${compact ? 'compact' : ''}`}>{children}</div>;
}

export interface BarDatum {
  label: string;
  value: number;
  text?: string;
  color?: string;
  muted?: boolean;
}

export function BarList({ data, valueLabel }: { data: BarDatum[]; valueLabel?: (v: number) => string }) {
  const [active, setActive] = useState<string | null>(null);
  const [tip, setTip] = useState<LocalTip | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const max = safeMax(data.map((d) => d.value));
  return (
    <div ref={chartRef} style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
      {data.map((d, i) => (
        <div
          key={d.label}
          className="ui-chart-row"
          onMouseEnter={() => setActive(d.label)}
          onMouseMove={(e) => setTip(localTip(e, chartRef, `${d.label}\n${d.text ?? valueLabel?.(d.value) ?? fmt(d.value)}`))}
          onMouseLeave={() => { setActive(null); setTip(null); }}
          style={{ opacity: d.muted || (active && active !== d.label) ? .42 : 1 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, marginBottom: 6 }}>
            <span style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
            <span style={{ color: 'var(--muted2)', fontWeight: 800, flexShrink: 0 }}>{d.text ?? valueLabel?.(d.value) ?? fmt(d.value)}</span>
          </div>
          <div style={{ height: 9, background: 'var(--soft)', borderRadius: 6, overflow: 'hidden' }}>
            <div
              className="ui-chart-fill"
              style={{
                height: '100%',
                width: `${clamp(Math.abs(d.value) / max * 100, 2, 100)}%`,
                borderRadius: 6,
                background: d.color ?? SERIES[i % SERIES.length],
                transformOrigin: 'left',
                animation: 'lux-grow .9s cubic-bezier(.22,.61,.36,1)',
              }}
            />
          </div>
        </div>
      ))}
      {tip && <div className="ui-tooltip" style={{ left: tip.x, top: tip.y, position: 'absolute' }}>{tip.text}</div>}
    </div>
  );
}

export interface PointDatum {
  label: string;
  value: number;
  value2?: number;
}

const smoothPath = (points: { x: number; y: number }[]) => {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.reduce((path, p, i, arr) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = arr[i - 1];
    const midX = (prev.x + p.x) / 2;
    return `${path} C ${midX} ${prev.y}, ${midX} ${p.y}, ${p.x} ${p.y}`;
  }, '');
};

export function LineChart({
  data,
  height = 240,
  lineLabel = 'Index',
  barLabel = 'Revenue',
  formatValue = (v) => fmt(v),
  formatLine = (v) => fmt(v, 1),
  threshold,
}: {
  data: PointDatum[];
  height?: number;
  lineLabel?: string;
  barLabel?: string;
  formatValue?: (v: number) => string;
  formatLine?: (v: number) => string;
  threshold?: number;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const w = 720;
  const h = 250;
  const pad = { l: 46, r: 16, t: 22, b: 42 };
  const vals = data.map((d) => d.value);
  const lineVals = data.map((d) => d.value2 ?? 0);
  const maxVal = safeMax(vals) * 1.1;
  const maxLine = Math.max(threshold ?? 0, ...lineVals, 1) * 1.12;
  const step = data.length > 1 ? (w - pad.l - pad.r) / (data.length - 1) : 1;
  const y = (v: number) => pad.t + (1 - v / maxVal) * (h - pad.t - pad.b);
  const y2 = (v: number) => pad.t + (1 - v / maxLine) * (h - pad.t - pad.b);
  const points = data.map((d, i) => ({ x: pad.l + i * step, y: y2(d.value2 ?? 0) }));
  const line = smoothPath(points);
  const area = `${line} L ${pad.l + (data.length - 1) * step} ${h - pad.b} L ${pad.l} ${h - pad.b} Z`;
  const barW = clamp(step * .38, 16, 42);
  const ticks = [0, .25, .5, .75, 1].map((p) => ({ y: pad.t + p * (h - pad.t - pad.b) }));
  const thresholdY = threshold == null ? null : y2(threshold);
  const activePoint = activeIndex == null ? null : points[activeIndex];
  const activeDatum = activeIndex == null ? null : data[activeIndex];

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap', margin: '0 2px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted2)', fontSize: 11, fontWeight: 800 }}>
          <span style={{ width: 12, height: 8, borderRadius: 3, background: SERIES[0], opacity: .72 }} />
          <span>{barLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted2)', fontSize: 11, fontWeight: 800 }}>
          <span style={{ display: 'inline-block', width: 18, borderTop: `3px solid ${ACCENT}`, borderRadius: 2 }} />
          <span>{lineLabel}</span>
        </div>
        {threshold != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>
            <span style={{ display: 'inline-block', width: 18, borderTop: `2px dashed ${ALERT_MID}` }} />
            <span>Mốc {fmt(threshold, 0)}</span>
          </div>
        )}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        <defs>
          <linearGradient id="uiLineArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity=".32" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => <line key={i} x1={pad.l} y1={t.y} x2={w - pad.r} y2={t.y} stroke="var(--grid)" />)}
        {thresholdY != null && <line x1={pad.l} x2={w - pad.r} y1={thresholdY} y2={thresholdY} stroke={ALERT_MID} strokeDasharray="5 5" strokeWidth="1.4" />}
        {data.map((d, i) => {
          const x = pad.l + i * step - barW / 2;
          const top = y(Math.max(0, d.value));
          const barH = h - pad.b - top;
          return (
            <rect
              key={d.label}
              className="ui-chart-fill"
              x={x}
              y={top}
              width={barW}
              height={barH}
              rx="6"
              fill={SERIES[0]}
              opacity={activeIndex == null || activeIndex === i ? .72 : .3}
              style={{ transformOrigin: `${x}px ${h - pad.b}px`, animation: 'lux-grow .9s cubic-bezier(.22,.61,.36,1)', cursor: 'pointer' }}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
            />
          );
        })}
        <path d={area} fill="url(#uiLineArea)" style={{ opacity: 0, animation: 'lux-fadein 1.2s ease forwards' }} />
        <path d={line} fill="none" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength="1" style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: 'lux-draw 1.15s ease forwards' }} />
        {activePoint && (
          <>
            <line x1={activePoint.x} y1={pad.t} x2={activePoint.x} y2={h - pad.b} stroke="#c3d98a" strokeWidth="1.5" strokeDasharray="4 4" style={{ pointerEvents: 'none', transition: 'opacity .18s ease' }} />
            <circle cx={activePoint.x} cy={activePoint.y} r="6" fill="var(--card)" stroke={ACCENT} strokeWidth="3" style={{ pointerEvents: 'none', transition: 'opacity .18s ease' }} />
          </>
        )}
        {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={activeIndex === i ? 6 : 4.5} fill="var(--card)" stroke={ACCENT} strokeWidth={activeIndex === i ? 3 : 2.5} opacity={activeIndex == null || activeIndex === i ? 1 : .45} />)}
        {points.map((p, i) => (
          <circle
            key={`hit-${i}`}
            cx={p.x}
            cy={p.y}
            r="18"
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
          />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px 0 46px', fontSize: 10, color: 'var(--muted)' }}>
        {data.map((d, i) => {
          const every = data.length > 18 ? Math.ceil(data.length / 8) : 1;
          const show = i === 0 || i === data.length - 1 || i % every === 0;
          return <span key={`${d.label}-${i}`}>{show ? d.label : ''}</span>;
        })}
      </div>
      {activePoint && activeDatum && (
        <div className="ui-tooltip" style={{ left: `${(activePoint.x / w) * 100}%`, top: `${(activePoint.y / h) * 100}%`, position: 'absolute' }}>
          {`${activeDatum.label}\n${barLabel}: ${formatValue(activeDatum.value)}${activeDatum.value2 == null ? '' : `\n${lineLabel}: ${formatLine(activeDatum.value2)}`}`}
        </div>
      )}
    </div>
  );
}

export function Donut({
  data,
  centerTop,
  centerBottom,
}: {
  data: BarDatum[];
  centerTop?: string;
  centerBottom?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0) || 1;
  let offset = 0;
  const r = 70;
  const circ = 2 * Math.PI * r;
  const segs = data.map((d, i) => {
    const pct = Math.max(0, d.value) / total;
    const seg = { ...d, color: d.color ?? SERIES[i % SERIES.length], dash: `${pct * circ} ${circ}`, off: -offset };
    offset += pct * circ;
    return seg;
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: 158, height: 158, animation: 'lux-pop .8s cubic-bezier(.34,1.4,.64,1)' }}>
        <svg viewBox="0 0 180 180" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          {segs.map((s) => (
            <circle key={s.label} cx="90" cy="90" r={r} fill="none" stroke={s.color} strokeWidth={active === s.label ? 20 : 15} strokeDasharray={s.dash} strokeDashoffset={s.off} opacity={!active || active === s.label ? 1 : .35} onMouseEnter={() => setActive(s.label)} onMouseLeave={() => setActive(null)} style={{ cursor: 'pointer' }} />
          ))}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 96, textAlign: 'center', lineHeight: 1.2 }}>{active ?? centerTop}</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{active ? `${fmt((data.find((d) => d.label === active)?.value ?? 0) / total * 100, 1)}%` : centerBottom}</div>
        </div>
      </div>
      <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '9px 18px' }}>
        {segs.map((s) => (
          <div key={s.label} onMouseEnter={() => setActive(s.label)} onMouseLeave={() => setActive(null)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: !active || active === s.label ? 1 : .35, cursor: 'pointer' }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, flexShrink: 0, background: s.color }} />
            <span style={{ flex: 1, color: 'var(--muted2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
            <span style={{ fontWeight: 800 }}>{fmt(s.value / total * 100, 0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Gauge({
  value,
  max = 100,
  label,
  color = ACCENT,
}: {
  value: number;
  max?: number;
  label?: string;
  color?: string;
}) {
  const pct = clamp(value / max, 0, 1);
  const dash = `${pct * 226} 226`;
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <svg viewBox="0 0 180 108" style={{ width: 200, height: 120 }}>
        <path d="M18 96 A72 72 0 0 1 162 96" fill="none" stroke="var(--grid)" strokeWidth="16" strokeLinecap="round" />
        <path d="M18 96 A72 72 0 0 1 162 96" fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" strokeDasharray={dash} style={{ strokeDashoffset: 226, animation: 'lux-gauge 1.2s cubic-bezier(.22,.61,.36,1) forwards' }} />
      </svg>
      <div style={{ position: 'absolute', bottom: 6, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800 }}>{fmt(value, 1)}</div>
        {label && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>}
      </div>
    </div>
  );
}

export function StackedBar({
  data,
  height = 18,
  valueLabel,
}: {
  data: BarDatum[];
  height?: number;
  valueLabel?: (v: number) => string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [tip, setTip] = useState<LocalTip | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0) || 1;
  return (
    <div ref={chartRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', height, borderRadius: 999, overflow: 'hidden', background: 'var(--soft)' }}>
        {data.map((d, i) => (
          <div
            key={d.label}
            className="ui-chart-fill"
            onMouseEnter={() => setActive(d.label)}
            onMouseMove={(e) => setTip(localTip(e, chartRef, `${d.label}\n${valueLabel?.(d.value) ?? fmt(d.value)} · ${fmt(d.value / total * 100, 1)}%`))}
            onMouseLeave={() => { setActive(null); setTip(null); }}
            style={{
              width: `${Math.max(.8, d.value / total * 100)}%`,
              background: d.color ?? SERIES[i % SERIES.length],
              animation: 'lux-grow .9s cubic-bezier(.22,.61,.36,1)',
              opacity: !active || active === d.label ? 1 : .35,
              cursor: 'pointer',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', marginTop: 12 }}>
        {data.map((d, i) => (
          <div
            key={d.label}
            onMouseEnter={() => setActive(d.label)}
            onMouseLeave={() => setActive(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--muted2)', opacity: !active || active === d.label ? 1 : .35, cursor: 'pointer' }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color ?? SERIES[i % SERIES.length] }} />
            <span>{d.label}</span>
          </div>
        ))}
      </div>
      {tip && <div className="ui-tooltip" style={{ left: tip.x, top: tip.y, position: 'absolute' }}>{tip.text}</div>}
    </div>
  );
}

export function DataTable<T>({
  rows,
  columns,
  rowTone,
  maxHeight,
}: {
  rows: T[];
  columns: { key: string; header: string; render: (row: T) => ReactNode; width?: string; align?: 'left' | 'right' | 'center' }[];
  rowTone?: (row: T) => 'warn' | 'bad' | undefined;
  maxHeight?: number;
}) {
  const style = maxHeight == null ? { overflowX: 'auto' as const } : { overflow: 'auto' as const, maxHeight };
  return (
    <div style={style}>
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key} style={{ width: c.width, textAlign: c.align }}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const tone = rowTone?.(r);
            return (
              <tr key={i} style={{ background: tone === 'bad' ? 'rgba(217,106,106,.08)' : tone === 'warn' ? 'rgba(230,180,90,.10)' : undefined }}>
                {columns.map((c) => <td key={c.key} style={{ textAlign: c.align }}>{c.render(r)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Slicer({
  label,
  options,
  selected,
  onChange,
  getLabel = (v) => v,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  getLabel?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const text = selected.size === 0 ? 'Tất cả' : selected.size === 1 ? getLabel([...selected][0]) : `${selected.size} mục`;
  const toggle = (option: string) => {
    const next = new Set(selected);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(next);
  };
  return (
    <div className="ui-slicer">
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 800, marginBottom: 6 }}>{label}</div>
      <button type="button" className="ui-slicer-button" onClick={() => setOpen((v) => !v)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 800 }}>{text}</span>
        <ion-icon name={open ? 'chevron-up-outline' : 'chevron-down-outline'} style={{ color: 'var(--muted)', flexShrink: 0 }} />
      </button>
      {open && (
        <div className="ui-slicer-menu">
          <div className="ui-slicer-option" onClick={() => onChange(new Set())}>
            <input readOnly type="checkbox" checked={selected.size === 0} />
            <span>Tất cả</span>
          </div>
          {options.map((o) => (
            <div className="ui-slicer-option" key={o} onClick={() => toggle(o)}>
              <input readOnly type="checkbox" checked={selected.has(o)} />
              <span>{getLabel(o)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface ScatterDatum {
  id: string;
  label?: string;
  x: number | null;
  y: number;
  size: number;
  colorKey?: string;
  isHighlight?: boolean;
}

export function QuadrantScatter({
  data,
  xThreshold,
  yThreshold,
  xLabel,
  yLabel,
}: {
  data: ScatterDatum[];
  xThreshold: number;
  yThreshold: number;
  xLabel: string;
  yLabel: string;
}) {
  const [tip, setTip] = useState<LocalTip | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeLegend, setActiveLegend] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const w = 720;
  const h = 360;
  const pad = { l: 58, r: 22, t: 20, b: 46 };
  const xs = data.map((d) => d.x ?? 0);
  const maxX = Math.max(xThreshold * 1.65, ...xs) || 1;
  const maxY = Math.max(yThreshold * 1.85, ...data.map((d) => d.y)) || 1;
  const maxSize = safeMax(data.map((d) => d.size));
  const scaleX = (x: number | null) => pad.l + clamp((x ?? 0) / maxX, 0, 1) * (w - pad.l - pad.r);
  const scaleY = (y: number) => pad.t + (1 - clamp(y / maxY, 0, 1)) * (h - pad.t - pad.b);
  const abcColor = (key?: string) => key === 'A' ? ACCENT : key === 'B' ? '#8ccb9d' : key === 'C' ? '#b9bfd0' : '#c7d0c8';
  const legend = [
    { label: 'ABC A', color: abcColor('A') },
    { label: 'ABC B', color: abcColor('B') },
    { label: 'ABC C', color: abcColor('C') },
  ];
  const legendKey = (label: string) => label.replace('ABC ', '');
  const tx = scaleX(xThreshold);
  const ty = scaleY(yThreshold);
  const passesLegend = (d: ScatterDatum) => {
    if (!activeLegend) return true;
    if (activeLegend === 'Slow & Heavy') return !!d.isHighlight;
    return d.colorKey === activeLegend;
  };
  return (
    <div ref={chartRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '0 2px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {legend.map((item) => (
            <div
              key={item.label}
              onMouseEnter={() => setActiveLegend(legendKey(item.label))}
              onMouseLeave={() => setActiveLegend(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted2)', fontSize: 11, fontWeight: 800, opacity: !activeLegend || activeLegend === legendKey(item.label) ? 1 : .4, cursor: 'pointer' }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, border: '1px solid var(--card)' }} />
              <span>{item.label}</span>
            </div>
          ))}
          <div
            onMouseEnter={() => setActiveLegend('Slow & Heavy')}
            onMouseLeave={() => setActiveLegend(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted2)', fontSize: 11, fontWeight: 800, opacity: !activeLegend || activeLegend === 'Slow & Heavy' ? 1 : .4, cursor: 'pointer' }}
          >
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'transparent', border: `2px solid ${ALERT_HIGH}` }} />
            <span>Slow & Heavy</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>
          <span style={{ display: 'inline-block', width: 22, borderTop: `2px dashed ${ALERT_MID}` }} />
          <span>MOC {fmt(xThreshold, 0)} · Median {fmt(yThreshold / 1e6, 1)} tr</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 360, display: 'block' }}>
        <rect x={tx} y={pad.t} width={w - pad.r - tx} height={ty - pad.t} fill={ALERT_HIGH} opacity=".07" rx="10" />
        {[0, .25, .5, .75, 1].map((p) => <line key={p} x1={pad.l} x2={w - pad.r} y1={pad.t + p * (h - pad.t - pad.b)} y2={pad.t + p * (h - pad.t - pad.b)} stroke="var(--grid)" />)}
        {[0, .25, .5, .75, 1].map((p) => <line key={p} y1={pad.t} y2={h - pad.b} x1={pad.l + p * (w - pad.l - pad.r)} x2={pad.l + p * (w - pad.l - pad.r)} stroke="var(--grid)" />)}
        <line x1={tx} x2={tx} y1={pad.t} y2={h - pad.b} stroke={ALERT_MID} strokeDasharray="6 5" strokeWidth="1.5" />
        <line x1={pad.l} x2={w - pad.r} y1={ty} y2={ty} stroke={ALERT_MID} strokeDasharray="6 5" strokeWidth="1.5" />
        <text x={pad.l} y={h - 12} fill="var(--muted)" fontSize="11" fontWeight="800">{xLabel}</text>
        <text x="14" y={pad.t + 4} fill="var(--muted)" fontSize="11" fontWeight="800" transform={`rotate(-90 14 ${pad.t + 4})`}>{yLabel}</text>
        {data.map((d) => {
          const cx = scaleX(d.x);
          const cy = scaleY(d.y);
          const r = 5 + Math.sqrt(Math.max(0, d.size) / maxSize) * 16;
          const isActive = activeId === d.id;
          const visibleByLegend = passesLegend(d);
          const opacity = visibleByLegend && (!activeId || isActive) ? (d.isHighlight ? .9 : .55) : .18;
          return (
            <g key={d.id} opacity={opacity}>
              <circle
                className="ui-chart-fill"
                cx={cx}
                cy={cy}
                r={isActive ? r + 3 : r}
                fill={abcColor(d.colorKey)}
                stroke={d.isHighlight ? ALERT_HIGH : 'var(--card)'}
                strokeWidth={d.isHighlight ? (isActive ? 3.2 : 2.4) : (isActive ? 2 : 1.2)}
                style={{ cursor: 'pointer', animation: 'lux-pop .55s ease' }}
                onMouseEnter={() => setActiveId(d.id)}
                onMouseMove={(e) => setTip(localTip(e, chartRef, `${d.id}\nABC: ${d.colorKey ?? '—'}${d.isHighlight ? '\nSlow & Heavy' : ''}\nMOC: ${d.x == null ? '—' : fmt(d.x, 1)}\nTồn: ${fmt(d.y / 1e6, 1)} tr`))}
                onMouseLeave={() => { setActiveId(null); setTip(null); }}
              />
              {d.label && <text x={cx + r + 4} y={cy + 4} fill="var(--ink)" fontSize="10" fontWeight="800" style={{ pointerEvents: 'none' }}>{d.label}</text>}
            </g>
          );
        })}
      </svg>
      {tip && <div className="ui-tooltip" style={{ left: tip.x, top: tip.y, position: 'absolute' }}>{tip.text}</div>}
    </div>
  );
}

export function Waterfall({
  data,
  formatValue = (v) => fmt(v),
}: {
  data: { label: string; value: number; isTotal?: boolean }[];
  formatValue?: (v: number) => string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [tip, setTip] = useState<LocalTip | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const w = 720;
  const h = 260;
  const pad = { l: 42, r: 18, t: 24, b: 58 };
  const calc = useMemo(() => {
    let running = 0;
    return data.map((d) => {
      const start = d.isTotal ? 0 : running;
      if (d.isTotal) running = d.value;
      else running += d.value;
      const end = d.isTotal ? d.value : running;
      return { ...d, start, end };
    });
  }, [data]);
  const min = Math.min(0, ...calc.flatMap((d) => [d.start, d.end]));
  const max = Math.max(1, ...calc.flatMap((d) => [d.start, d.end]));
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);
  const step = (w - pad.l - pad.r) / calc.length;
  const barW = clamp(step * .54, 28, 70);
  return (
    <div ref={chartRef} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 260, display: 'block' }}>
        {[0, .25, .5, .75, 1].map((p) => <line key={p} x1={pad.l} x2={w - pad.r} y1={pad.t + p * (h - pad.t - pad.b)} y2={pad.t + p * (h - pad.t - pad.b)} stroke="var(--grid)" />)}
        <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} stroke="var(--muted)" opacity=".45" />
        {calc.map((d, i) => {
          const x = pad.l + i * step + (step - barW) / 2;
          const top = y(Math.max(d.start, d.end));
          const bottom = y(Math.min(d.start, d.end));
          const color = d.isTotal ? ACCENT : d.value < 0 ? ALERT_HIGH : '#8ccb9d';
          const isActive = active === d.label;
          return (
            <g key={d.label} opacity={!active || isActive ? 1 : .35}>
              {i > 0 && <line x1={pad.l + (i - 1) * step + step / 2} x2={pad.l + i * step + step / 2} y1={y(calc[i - 1].end)} y2={y(calc[i - 1].end)} stroke="var(--muted)" strokeDasharray="4 4" opacity=".45" />}
              <rect
                className="ui-chart-fill"
                x={x}
                y={top}
                width={barW}
                height={Math.max(2, bottom - top)}
                rx="7"
                fill={color}
                opacity=".88"
                style={{ animation: 'lux-pop .55s ease', cursor: 'pointer' }}
                onMouseEnter={() => setActive(d.label)}
                onMouseMove={(e) => setTip(localTip(e, chartRef, `${d.label}\n${formatValue(d.value)}`))}
                onMouseLeave={() => { setActive(null); setTip(null); }}
              />
              <text x={x + barW / 2} y={top - 7} textAnchor="middle" fill="var(--ink)" fontSize="10" fontWeight="800">{formatValue(d.value)}</text>
              <text x={x + barW / 2} y={h - 22} textAnchor="middle" fill="var(--muted)" fontSize="10" fontWeight="800">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {tip && <div className="ui-tooltip" style={{ left: tip.x, top: tip.y, position: 'absolute' }}>{tip.text}</div>}
    </div>
  );
}
