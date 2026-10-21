import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/nunito/cyrillic-400.css";
import "@fontsource/nunito/cyrillic-600.css";
import "@fontsource/nunito/cyrillic-700.css";
import "@fontsource/nunito/cyrillic-800.css";
import "@fontsource/nunito/cyrillic-900.css";
import "@fontsource/nunito/latin-400.css";
import "@fontsource/nunito/latin-700.css";
import "@fontsource/nunito/latin-900.css";
import App from "./fps/FPSApp";
import "./fps/fps.css";

// Explicit isolated review mode: no player save is loaded or changed.
const ReviewApp = React.lazy(() => import('./fps/ReviewApp'));
const reviewing = new URLSearchParams(window.location.search).get('review') === '1';

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {reviewing ? <React.Suspense fallback={<p>Подготовка измерений…</p>}><ReviewApp /></React.Suspense> : <App />}
  </React.StrictMode>,
);
