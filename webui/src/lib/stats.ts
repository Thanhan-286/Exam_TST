// Kiểm định chi-square độc lập cho bảng 2×K (vi phạm / không vi phạm × nhân viên).
// Dữ liệu gốc: χ² = 4,716 · df = 3 · p = 0,194 ⇒ chênh lệch giữa nhân viên
// KHÔNG có ý nghĩa thống kê — phải hiện con số này cạnh bar chart PV.

function gammln(x: number): number {
  // Lanczos approximation
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Regularized upper incomplete gamma Q(a, x) — dùng cho p-value chi-square */
function gammaQ(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 1;
  if (x < a + 1) {
    // series cho P(a,x), Q = 1 - P
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 200; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gammln(a));
  }
  // continued fraction cho Q(a,x)
  let b = x + 1 - a;
  let c = 1e308;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammln(a)) * h;
}

export interface ChiSquareResult {
  chi2: number;
  df: number;
  p: number;
}

/** Bảng 2×K: mỗi nhóm có {flagged, total}. */
export function chiSquareIndependence(
  groups: { flagged: number; total: number }[]
): ChiSquareResult {
  const totalFlagged = groups.reduce((a, g) => a + g.flagged, 0);
  const totalAll = groups.reduce((a, g) => a + g.total, 0);
  const rate = totalFlagged / totalAll;
  let chi2 = 0;
  for (const g of groups) {
    const expFlag = g.total * rate;
    const expOk = g.total * (1 - rate);
    const obsOk = g.total - g.flagged;
    if (expFlag > 0) chi2 += (g.flagged - expFlag) ** 2 / expFlag;
    if (expOk > 0) chi2 += (obsOk - expOk) ** 2 / expOk;
  }
  const df = groups.length - 1;
  return { chi2, df, p: gammaQ(df / 2, chi2 / 2) };
}
