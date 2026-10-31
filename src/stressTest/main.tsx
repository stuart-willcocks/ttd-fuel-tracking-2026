import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setupServiceWorkerAutoReload } from '../services/appUpdate';
import { StressTestApp } from './StressTestApp';

setupServiceWorkerAutoReload();

const rootEl = document.getElementById('stress-test-root');

if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <StressTestApp />
    </StrictMode>
  );
} else {
  console.error('Fatal: #stress-test-root container not found in DOM.');
}

