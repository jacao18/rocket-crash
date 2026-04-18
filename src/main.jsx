import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Admin from './Admin.jsx'
import { Providers } from './Providers.jsx'
import './index.css'

const privyId = import.meta.env.VITE_PRIVY_APP_ID

if (!privyId) {
  document.getElementById('root').innerHTML = `
    <div style="color:#f87171;font-family:monospace;padding:40px;background:#0a0e1a;min-height:100vh">
      <h2>⚠️ Missing VITE_PRIVY_APP_ID</h2>
      <p style="margin-top:12px;color:#94a3b8">Create a <b>.env</b> file in the project root with:</p>
      <pre style="margin-top:12px;background:#1e293b;padding:16px;border-radius:8px;color:#4ade80">VITE_PRIVY_APP_ID=your-app-id-from-privy-console</pre>
      <p style="margin-top:12px;color:#94a3b8">Get your App ID at <a href="https://console.privy.io" style="color:#f97316">console.privy.io</a></p>
    </div>
  `
} else {
  const isAdmin = window.location.pathname === '/admin'

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Providers>
        {isAdmin ? <Admin /> : <App />}
      </Providers>
    </React.StrictMode>
  )
}
