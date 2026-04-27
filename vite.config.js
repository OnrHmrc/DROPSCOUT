import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    rollupOptions: {
      input: {
        dropscout:      resolve(__dirname, 'dropscout.html'),
        trendRadar:     resolve(__dirname, 'trend-radar.html'),
        gapRadar:       resolve(__dirname, 'gap-radar.html'),
        netKar:         resolve(__dirname, 'net-kar.html'),
        rakipAnalizi:   resolve(__dirname, 'rakip-analizi.html'),
        takipListem:    resolve(__dirname, 'takip-listem.html'),
        yasalKontrol:   resolve(__dirname, 'yasal-kontrol.html'),
        tedarikciBul:   resolve(__dirname, 'tedarikci-bul.html'),
        raporlar:       resolve(__dirname, 'raporlar.html'),
        trendyol:       resolve(__dirname, 'trendyol.html'),
        hepsiburada:    resolve(__dirname, 'hepsiburada.html'),
        amazonTr:       resolve(__dirname, 'amazon-tr.html'),
        n11:            resolve(__dirname, 'n11.html'),
        login:          resolve(__dirname, 'login.html'),
        onboarding:     resolve(__dirname, 'onboarding.html'),
        index:          resolve(__dirname, 'index.html'),
        profil:         resolve(__dirname, 'profil.html'),
        pricing:        resolve(__dirname, 'pricing.html'),
      }
    },
    outDir: 'dist',
  },
  server: {
    open: '/dropscout.html',
    proxy: {
      // Lokal geliştirmede /api/** → Firebase Functions emulator (5001)
      // Prod'da Firebase Hosting rewrite ile aynı path'e yönlenir
      '/api': {
        target: 'http://127.0.0.1:5001/dropscoutapp/europe-west1/api',
        changeOrigin: true,
        rewrite: (path) => path
      }
    }
  }
});
