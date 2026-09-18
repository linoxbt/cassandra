import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { WalletProviders } from "./components/wallet-providers";
import { AppLayout, MarketingLayout } from "./components/layouts";
import { Landing } from "./pages/Landing";
import { DocsLayout } from "./pages/Docs";
import { DocsIndex, DocsPage } from "./pages/DocsPage";
import { NotFound } from "./pages/NotFound";

const Markets = lazy(() => import("./pages/Markets").then((m) => ({ default: m.Markets })));
const MarketDetail = lazy(() => import("./pages/MarketDetail").then((m) => ({ default: m.MarketDetail })));
const Portfolio = lazy(() => import("./pages/Portfolio").then((m) => ({ default: m.Portfolio })));
const Jury = lazy(() => import("./pages/Jury").then((m) => ({ default: m.Jury })));
const AgentPage = lazy(() => import("./pages/Agent").then((m) => ({ default: m.AgentPage })));
const CreateMarket = lazy(() => import("./pages/Create").then((m) => ({ default: m.CreateMarket })));

export function App() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/docs" element={<DocsLayout />}>
          <Route index element={<DocsIndex />} />
          <Route path=":slug" element={<DocsPage />} />
        </Route>
      </Route>
      <Route
        element={
          <WalletProviders>
            <Suspense fallback={null}>
              <AppLayout />
            </Suspense>
          </WalletProviders>
        }
      >
        <Route path="/markets" element={<Markets />} />
        <Route path="/market/:id" element={<MarketDetail />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/jury" element={<Jury />} />
        <Route path="/agent" element={<AgentPage />} />
        <Route path="/create" element={<CreateMarket />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
