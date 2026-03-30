import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  // 載入環境變數
  const env = loadEnv(mode, '.', '');
  
  return {
    // base: '/measure/', 
    
    plugins: [react(), tailwindcss()],
    
    build: {
      target: 'esnext',
    },
    
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});