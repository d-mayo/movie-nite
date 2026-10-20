import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/bebas-neue/400.css'
import './index.css'
import App from './App.tsx'
import { createBrowserSound } from './sound/browser.ts'
import { applyFffLink } from './state/fffLink.ts'
import { createLocalStoragePersistence } from './state/persistence.ts'
import { createAppStore } from './state/store.ts'

const store = createAppStore(createLocalStoragePersistence())
applyFffLink(store, window.location, window.history)
const sound = createBrowserSound()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} sound={sound} />
  </StrictMode>,
)
