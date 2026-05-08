import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { WatchlistProvider } from "./contexts/WatchlistContext";
import { ViewCounter } from "./components/ViewCounter";
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
        `rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
          isActive
            ? "bg-teal-50 text-teal-700"
            : "text-stone-600 hover:bg-stone-100 hover:text-stone-800"
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
        <nav
          className="sticky top-0 z-40 border-b border-stone-200/70 bg-white/90 backdrop-blur-sm"
          role="navigation"
          aria-label="Main navigation"
        >
          <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-2.5">
            <Link
              to="/"
              className="font-display text-lg font-semibold tracking-tight text-stone-900 hover:text-teal-700 transition-colors mr-auto sm:mr-3"
            >
              NEPSE Research
            </Link>
            <NavItem to="/" end>Dashboard</NavItem>
            <NavItem to="/companies">Screener</NavItem>
            <NavItem to="/compare">Compare</NavItem>
          </div>
        </nav>

        <main className="mx-auto min-h-[calc(100vh-55px)] max-w-5xl px-4 py-6 sm:py-8" role="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/companies" element={<CompanyList />} />
            <Route path="/company/:symbol" element={<CompanyDetail />} />
            <Route path="/compare" element={<Compare />} />
          </Routes>
        </main>

        <footer className="border-t border-stone-200/60 bg-stone-50/80" role="contentinfo">
          <div className="mx-auto max-w-5xl px-4 py-4 space-y-3">
            <div className="flex flex-col gap-2 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
              <p className="text-center text-xs text-stone-400 sm:text-left">&copy; {new Date().getFullYear()} NEPSE Research</p>
              <ViewCounter />
            </div>
            <div className="border-t border-stone-200/60 pt-3">
              <p className="text-center text-xs leading-5 text-stone-500">
                <strong>Disclaimer:</strong> AI-generated analysis from historical data for educational purposes. Not professional investment advice. Consult a SEBON-licensed financial advisor before investing.
              </p>
            </div>
          </div>
        </footer>
      </BrowserRouter>
    </WatchlistProvider>
  );
}

export default App;
