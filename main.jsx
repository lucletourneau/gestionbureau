import React from 'react';
import ReactDOM from 'react-dom/client';

// Ce bloc test si l'import fonctionne vraiment
let App;
try {
  const Module = await import('./app');
  App = Module.default;
  console.log("Diagnostic: app.jsx chargé avec succès");
} catch (e) {
  console.error("Diagnostic: ÉCHEC de chargement de app.jsx", e);
  // On crée un composant d'erreur visuel si le build plante
  App = () => <div style={{padding: '20px', color: 'red'}}><h1>Erreur de chargement</h1><p>{e.message}</p></div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
