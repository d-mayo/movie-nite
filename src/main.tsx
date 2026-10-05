import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createLocalStoragePersistence } from './state/persistence.ts'
import { createAppStore } from './state/store.ts'

const store = createAppStore(createLocalStoragePersistence())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
)
