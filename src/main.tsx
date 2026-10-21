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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
