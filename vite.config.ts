import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: mode === 'production' ? '/banana-batch/' : '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: [
          'www.vince123.xyz',
          'vince123.xyz',
          'localhost',
        ],
        hmr: {
          protocol: 'ws',
          host: 'www.vince123.xyz',
          port: 3000,
        },
        // Fix Content-Length mismatch issues
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
        // Disable file system caching to prevent Content-Length issues
        fs: {
          strict: false,
        },
      },
      preview: {
        port: 3000,
        host: '0.0.0.0',
        headers: {
          'Cache-Control': 'public, max-age=31536000',
        },
      },
      plugins: [react()],
      // 注意：不注入 API Key 到前端代码中，避免安全风险
      // API Key 应该由用户在应用内手动输入，或通过后端代理
      // define: {
      //   'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      //   'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      //   'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      //   'import.meta.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      // },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
