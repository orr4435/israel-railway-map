import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const API_BASE   = 'https://sheets-connector.vercel.app';
const PROJECT_ID = '8a1144db-1cbf-4141-90b2-85021a633ed5';

export default defineConfig(({ mode }) => {
  const env    = loadEnv(mode, process.cwd(), '');
  const apiKey = env.VITE_API_KEY ?? '';

  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      proxy: {
        // Dev proxy: /.netlify/functions/sheets?table=X&id=Y  →  upstream API
        '/.netlify/functions/sheets': {
          target:      API_BASE,
          changeOrigin: true,
          rewrite(path) {
            const [, qs = ''] = path.split('?');
            const p    = new URLSearchParams(qs);
            const tbl  = p.get('table') ?? 'RAIL1';
            const id   = p.get('id');
            p.delete('table');
            p.delete('id');
            const rest     = p.toString();
            const upstream = `/api/v1/projects/${PROJECT_ID}/tables/${tbl}${id ? '/' + id : ''}`;
            return rest ? `${upstream}?${rest}` : upstream;
          },
          configure(proxy) {
            proxy.on('proxyReq', (req) => {
              req.setHeader('x-api-key', apiKey);
            });
          },
        },
      },
    },
  };
});
