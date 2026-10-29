import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { setupServiceWorkerAutoReload } from './services/appUpdate';
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

// Enable automatic reload when a new service worker takes control
setupServiceWorkerAutoReload();

// Register PWA service worker with auto-update
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
