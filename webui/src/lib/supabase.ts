import { createClient } from '@supabase/supabase-js';

/**
 * Làm sạch giá trị env. Chống các lỗi dán thường gặp trên Vercel:
 *  - dán cả "VITE_SUPABASE_URL = https://..." vào ô Value → strip phần "NAME ="
 *  - dính khoảng trắng / xuống dòng ở đầu-cuối → trim
 *  - dính dấu nháy → bỏ nháy bao ngoài
 */
function clean(v: string | undefined): string {
  if (!v) return '';
  let s = v.trim();
  const withName = s.match(/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*([\s\S]*)$/);
  if (withName) s = withName[1].trim();
  return s.replace(/^["']|["']$/g, '').trim();
}

const url = clean(import.meta.env.VITE_SUPABASE_URL as string);
const key = clean(import.meta.env.VITE_SUPABASE_KEY as string);

const validUrl = /^https?:\/\/[^\s]+$/i.test(url);
export const hasCredentials = validUrl && Boolean(key);

// KHÔNG để createClient ném lỗi lúc nạp module (sẽ làm trắng cả trang).
// URL sai → dùng placeholder hợp lệ; DataContext thấy hasCredentials=false
// sẽ hiện thông báo cấu hình thay vì crash.
const safeUrl = validUrl ? url : 'https://placeholder.supabase.co';
const safeKey = key || 'anon';

/** Đọc dashboard — schema mart, chỉ SELECT */
export const mart = createClient(safeUrl, safeKey, {
  db: { schema: 'mart' },
  auth: { persistSession: false },
});

/** Ghi upload — schema raw (demo: anon được INSERT, xem 007_dataflow.sql) */
export const raw = createClient(safeUrl, safeKey, {
  db: { schema: 'raw' },
  auth: { persistSession: false },
});
