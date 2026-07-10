// Định dạng số kiểu Việt Nam: 5.208.670.650 · 17,18% · 5,21 tỷ · 888,4 tr

const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

export const fmtVND = (n: number): string => nf0.format(Math.round(n));

/** 5,21 tỷ · 888,4 tr · 917.700 */
export const fmtShort = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' tỷ';
  if (abs >= 1e6) return (n / 1e6).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' tr';
  return fmtVND(n);
};

/** ratio 0.1718 → "17,18%" */
export const fmtPct = (ratio: number | null, digits = 2): string =>
  ratio == null
    ? '—'
    : (ratio * 100).toLocaleString('vi-VN', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }) + '%';

export const fmtNum = (n: number | null, digits = 1): string =>
  n == null
    ? '—'
    : n.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** "2026-01-01" → "01/2026" */
export const fmtMonth = (monthStart: string): string => {
  const [y, m] = monthStart.split('-');
  return `${m}/${y}`;
};
