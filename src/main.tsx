import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { setupServiceWorkerAutoReload } from './services/appUpdate';
import './index.css';
import App from './App.tsx';

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
