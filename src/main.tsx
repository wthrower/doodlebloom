import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker
    .register('/games/doodlebloom/sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      if (!navigator.serviceWorker.controller) return
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing
        if (!newSW) return
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'activated') {
            if (document.readyState === 'complete') {
              window.location.reload()
            } else {
              window.addEventListener('load', () => window.location.reload())
            }
          }
        })
      })
    })
}
