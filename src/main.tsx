import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import "./theme.css";
import { applyAppearance, readAppearance } from "./appearance";
applyAppearance(readAppearance());
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
