import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app.jsx'
import './index.css' // Si tu as un fichier CSS, sinon supprime cette ligne

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
