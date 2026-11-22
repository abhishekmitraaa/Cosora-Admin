import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initTheme } from "./lib/theme";
import { installBrokenImageFallback } from "./lib/brokenImages";
import "./index.css";

// Stamp the stored theme onto <html> BEFORE the first render, so a dark-mode
// admin never sees a frame of light chrome on load.
initTheme();
installBrokenImageFallback();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
