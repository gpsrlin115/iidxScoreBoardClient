import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { i18nReady } from './i18n'

// Render once the detected language's bundle is in, so a Japanese or English
// visitor never sees a Korean first paint. Korean resolves immediately.
i18nReady.finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
