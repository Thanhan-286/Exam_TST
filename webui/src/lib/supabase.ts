import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_KEY as string;

export const hasCredentials = Boolean(url && key);

/** Đọc dashboard — schema mart, chỉ SELECT */
export const mart = createClient(url || 'http://localhost', key || 'anon', {
  db: { schema: 'mart' },
  auth: { persistSession: false },
});

/** Ghi upload — schema raw (demo: anon được INSERT, xem 007_dataflow.sql) */
export const raw = createClient(url || 'http://localhost', key || 'anon', {
  db: { schema: 'raw' },
  auth: { persistSession: false },
});
