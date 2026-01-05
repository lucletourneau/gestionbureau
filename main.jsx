import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app' // On utilise './app' sans l'extension .jsx pour plus de compatibilité

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
