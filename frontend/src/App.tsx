import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { WatchlistProvider } from "./contexts/WatchlistContext";
import { CompanyDetail } from "./pages/CompanyDetail";
import { CompanyList } from "./pages/CompanyList";
import { Compare } from "./pages/Compare";
import { Dashboard } from "./pages/Dashboard";

function NavItem({ to, end = false, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `text-sm font-medium transition-colors ${
          isActive ? "text-teal-600 font-semibold" : "text-stone-600 hover:text-teal-600"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

function App() {
  return (
    <WatchlistProvider>
    <BrowserRouter>
      <nav className="border-b border-stone-200/80 bg-white text-stone-700 shadow-sm">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-4 py-3 sm:gap-6">
          <Link to="/" className="font-display text-lg font-semibold text-stone-900 hover:text-teal-600 transition-colors">
            NEPSE Research
          </Link>
          <NavItem to="/" end>Dashboard</NavItem>
          <NavItem to="/companies">Screener</NavItem>
          <NavItem to="/compare">Compare</NavItem>
        </div>
      </nav>
      <main className="mx-auto min-h-[calc(100vh-52px)] max-w-4xl bg-stone-50/30 px-4 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/companies" element={<CompanyList />} />
          <Route path="/company/:symbol" element={<CompanyDetail />} />
          <Route path="/compare" element={<Compare />} />
        </Routes>
      </main>
      <footer className="border-t border-stone-200/80 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <p className="text-xs text-stone-500">
            <strong className="text-stone-600">Disclaimer:</strong> This site provides AI-based analysis derived from historical and publicly available data. It is for informational and educational purposes only and must not be considered professional investment advice. Past performance does not guarantee future results. Always consult a qualified financial advisor before making investment decisions.
          </p>
        </div>
      </footer>
    </BrowserRouter>
    </WatchlistProvider>
  );
}

export default App;
