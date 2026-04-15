import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@/styles/index.css";
import "@/styles/markdown.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
