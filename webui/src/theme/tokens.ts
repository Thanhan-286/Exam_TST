// Design tokens — port từ frontend/UI_demo/Inventory Dashboard.dc.html
// KHÔNG hardcode hex ở component; mọi màu đi qua CSS variables set ở App.

export interface Theme {
  bg: string; card: string; cardBrd: string; ink: string;
  muted: string; muted2: string; soft: string; soft2: string;
  grid: string; sideBrd: string; rowBrd: string;
  kpiHiBg: string; kpiHiBrd: string; link: string;
  tipBg: string; tipInk: string;
}

export const light: Theme = {
  bg: '#e7efe8', card: '#ffffff', cardBrd: '#eef2ee', ink: '#1c2420',
  muted: '#9aa39b', muted2: '#6f776f', soft: '#f2f5f1', soft2: '#f3f6f2',
  grid: '#eef2ee', sideBrd: '#eef2ee', rowBrd: '#f1f4f0',
  kpiHiBg: 'linear-gradient(160deg,#f4fadf,#eef7cf)', kpiHiBrd: '#dce4b8',
  link: '#5c7a15', tipBg: '#1c2420', tipInk: '#ffffff',
};

export const dark: Theme = {
  bg: '#0b0f0c', card: '#141a15', cardBrd: '#232c24', ink: '#eef2ea',
  muted: '#7f8a80', muted2: '#9aa89c', soft: '#1c241d', soft2: '#1c241d',
  grid: '#242e25', sideBrd: '#1e261f', rowBrd: '#232c24',
  kpiHiBg: 'linear-gradient(160deg,#22331b,#182015)', kpiHiBrd: '#3a4a2b',
  link: '#a9d64f', tipBg: '#2b3a30', tipInk: '#eef2ea',
};

/** Accent chính (lime) + dải màu series của demo */
export const ACCENT = '#cdee6b';
export const SERIES = ['#bfe3cf', '#a3d7b3', '#8ccb9d', '#d9ee85', '#cdee6b', '#e6f4ab', '#9ed0ac'];

/** Hai họ màu Dashboard 3 — DQ (xanh) vs PV (tím). KHÔNG trộn (§6.2). */
export const DQ_FAMILY = '#7fae3e';
export const PV_FAMILY = '#7a5fae';

/** Alert */
export const ALERT_HIGH = '#d96a6a';
export const ALERT_MID = '#e6b45a';
export const GOOD = '#3f9a5a';

export const cssVars = (t: Theme): Record<string, string> => ({
  '--bg': t.bg, '--card': t.card, '--card-brd': t.cardBrd, '--ink': t.ink,
  '--muted': t.muted, '--muted2': t.muted2, '--soft': t.soft, '--soft2': t.soft2,
  '--grid': t.grid, '--side-brd': t.sideBrd, '--row-brd': t.rowBrd,
  '--kpi-hi-bg': t.kpiHiBg, '--kpi-hi-brd': t.kpiHiBrd, '--link': t.link,
  '--tip-bg': t.tipBg, '--tip-ink': t.tipInk, '--accent': ACCENT,
});
