import { Route, Routes } from "react-router-dom";
import { AppLayout, MarketingLayout } from "./components/layouts";
import { Landing } from "./pages/Landing";
import { DocsLayout } from "./pages/Docs";
import { DocsIndex, DocsPage } from "./pages/DocsPage";
import { Markets } from "./pages/Markets";
import { MarketDetail } from "./pages/MarketDetail";
import { Portfolio } from "./pages/Portfolio";
import { Jury } from "./pages/Jury";
import { AgentPage } from "./pages/Agent";
import { CreateMarket } from "./pages/Create";
import { NotFound } from "./pages/NotFound";

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
      <Route element={<AppLayout />}>
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
