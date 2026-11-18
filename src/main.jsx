import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/gothic-a1/300.css'
import '@fontsource/gothic-a1/400.css'
import '@fontsource/gothic-a1/500.css'
import '@fontsource/gothic-a1/700.css'
import '@fontsource/ibm-plex-sans-jp/400.css'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/700.css'
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
