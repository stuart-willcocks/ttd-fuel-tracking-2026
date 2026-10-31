import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { setupServiceWorkerAutoReload } from './services/appUpdate';
import { isMobileDevice } from './utils/deviceDetector';
import './index.css';
import App from './App.tsx';

// If a Supabase Auth invitation or password recovery email link lands on the root URL ('/'),
// immediately forward the user to '/admin' with the hash/query tokens preserved.
if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin')) {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  if (
    hash.includes('access_token=') ||
    hash.includes('type=invite') ||
    hash.includes('type=recovery') ||
    hash.includes('error_description=') ||
    search.includes('type=invite') ||
    search.includes('type=recovery')
  ) {
    window.location.replace(`/admin${search}${hash}`);
  }
}

// Only register offline PWA Service Worker on dedicated mobile/Zebra handheld devices.
// On desktop workstations, actively unregister any Service Worker so /admin and /stress-test are never intercepted.
if (typeof window !== 'undefined') {
  if (isMobileDevice()) {
    setupServiceWorkerAutoReload();
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        console.log('New app version available, activating...');
        updateSW(true);
      },
      onOfflineReady() {
        console.log('App ready to work offline');
      },
    });
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister().catch(() => {}))))
      .catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
