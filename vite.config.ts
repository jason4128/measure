import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  // 載入環境變數
  const env = loadEnv(mode, '.', '');
  
  return {
    // 關鍵修正：必須與您的 GitHub Repository 名稱「upa」一致
    base: '/upa/', 
    
    plugins: [react(), tailwindcss()],
    
    define: {
      // 確保編譯時能注入 API Key
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    
    resolve: {
      alias: {
        // 設定路徑別名
        '@': path.resolve(__dirname, '.'),
      },
    },
    
    server: {
      // AI Studio 環境專用設定，保持原樣即可
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
