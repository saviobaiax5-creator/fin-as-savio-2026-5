import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  // Recover gracefully once if a mobile browser hits a stale chunk hash right after a deployment
  window.addEventListener('vite:preloadError', () => {
    try {
      const key = 'finance_ia_chunk_reload_at';
      const last = Number(window.sessionStorage.getItem(key) || '0');
      if (Date.now() - last > 15_000) {
        window.sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  });

  if ('serviceWorker' in navigator) {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        void updateSW(true);
      },
      onOfflineReady() {
        console.info('Sávio Finanças pronto para funcionamento offline.');
      },
      onRegisterError(err) {
        console.warn('Registro de Service Worker ignorado:', err);
      },
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
