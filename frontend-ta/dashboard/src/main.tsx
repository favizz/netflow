import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ToastProvider } from '@/components/layout/ToastProvider';

// Client-error telemetry (previously posted to the backend) is not needed
// in the fully static demo build — errors just surface in the console.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
