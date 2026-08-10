import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import App from "./App";
import { I18nProvider } from "./lib/i18n";

// Public customer-approval page (2026-08-10): the /approve path renders WITHOUT the app shell or
// auth gate — the customer has no ERP account; the capability key in the URL is the authorization
// (see src/pages/approval/CustomerApprovalPage.tsx). Branched here, before <App/> ever mounts, so
// the session bootstrap/sign-in gate never runs for it. Lazy so regular app loads skip its chunk.
const CustomerApprovalPage = lazy(() => import("./pages/approval/CustomerApprovalPage"));
const isApprovalRoute = window.location.pathname === "/approve" || window.location.pathname === "/approve/";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      {isApprovalRoute ? (
        <Suspense fallback={null}>
          <CustomerApprovalPage />
        </Suspense>
      ) : (
        <App />
      )}
    </I18nProvider>
  </StrictMode>,
);
