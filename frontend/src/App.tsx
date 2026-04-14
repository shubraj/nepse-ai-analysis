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
        `rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
          isActive
            ? "bg-teal-600 text-white shadow-sm"
            : "text-stone-600 hover:bg-white hover:text-teal-700"
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
        <nav className="sticky top-0 z-40 border-b border-stone-200/70 bg-white/80 text-stone-700 shadow-sm backdrop-blur" role="navigation" aria-label="Main navigation">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:gap-4">
            <Link to="/" className="font-display text-lg font-semibold text-stone-900 transition-colors hover:text-teal-600">
              NEPSE Research
            </Link>
            <NavItem to="/" end>Dashboard</NavItem>
            <NavItem to="/companies">Screener</NavItem>
            <NavItem to="/compare">Compare</NavItem>
          </div>
        </nav>

        <main className="mx-auto min-h-[calc(100vh-58px)] max-w-5xl px-4 py-8 sm:py-10" role="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/companies" element={<CompanyList />} />
            <Route path="/company/:symbol" element={<CompanyDetail />} />
            <Route path="/compare" element={<Compare />} />
          </Routes>
        </main>

        <footer className="border-t border-stone-200/80 bg-white/80 backdrop-blur" role="contentinfo">
          <div className="mx-auto max-w-5xl px-4 py-5">
            <div className="rounded-xl border border-stone-200/70 bg-white/80 px-4 py-3">
              <p className="text-xs leading-relaxed text-stone-500">
                <strong className="text-stone-600">Disclaimer:</strong> This site provides AI-based analysis from historical and publicly available data for educational use only. Not professional investment advice.
              </p>
            </div>
            <p className="mt-3 text-center text-xs text-stone-500">&copy; 2026 NEPSE Research</p>
          </div>
        </footer>
      </BrowserRouter>
    </WatchlistProvider>
  );
}

export default App;
