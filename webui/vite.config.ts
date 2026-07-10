/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Đọc ../.env của bi-case-study (CRLF — strip \r). Trên Vercel thì dùng
// biến môi trường VITE_SUPABASE_URL / VITE_SUPABASE_KEY set trong dashboard.
function parentEnv(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(resolve(here, '../.env'), 'utf8').split('\n')) {
      const m = line.replace(/\r$/, '').match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}
const env = parentEnv();

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
      process.env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? ''
    ),
    'import.meta.env.VITE_SUPABASE_KEY': JSON.stringify(
      process.env.VITE_SUPABASE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? ''
    ),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
