import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./lib/auth";
import "./styles.css";

// Seamless PWA updates. The service worker uses registerType 'autoUpdate'
// (skipWaiting + clientsClaim), so a freshly deployed worker takes control of
// this page — but the page keeps running the OLD cached bundle until it
// reloads. Reload once when control changes so users never get stuck on a stale
// version (e.g. an old API URL). Guarded to fire only when REPLACING an existing
// worker — never on first install, and never in a loop.
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing || !hadController) return;
    refreshing = true;
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
