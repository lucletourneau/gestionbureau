import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app'; // Cherche exactement le fichier app.jsx à la racine

// On récupère l'élément <div id="root"></div> de ton index.html
const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error("L'élément 'root' est introuvable dans le fichier index.html");
}
