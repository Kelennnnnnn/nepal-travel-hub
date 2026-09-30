import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import { ErrorFallback } from "./components/ErrorBoundary";
import { initSentry, Sentry } from "./lib/sentry";
import "./index.css";

initSentry();

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={({ error, resetError }) => (
    <ErrorFallback error={error instanceof Error ? error : undefined} onReset={() => { resetError(); window.location.reload(); }} />
  )}>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </Sentry.ErrorBoundary>
);
