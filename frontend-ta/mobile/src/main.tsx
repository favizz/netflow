import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  });
}
import { GoogleOAuthProvider } from '@react-oauth/google'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import './index.css'
import App from './App.tsx'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <App />
        <Toaster
          richColors
          closeButton
          position="top-right"
          offset={72}
          toastOptions={{
            classNames: {
              closeButton: '!top-2 !right-2 !left-auto !translate-x-0 !translate-y-0',
            },
          }}
        />
      </ThemeProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
