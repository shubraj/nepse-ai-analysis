import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { getWatchlist, toggleWatchlist as toggleStorage } from "../lib/watchlist";

type WatchlistContextValue = {
  symbols: string[];
  isInWatchlist: (symbol: string) => boolean;
  toggle: (symbol: string) => void;
  refresh: () => void;
};

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [symbols, setSymbols] = useState<string[]>(() => getWatchlist());

  const refresh = useCallback(() => {
    setSymbols(getWatchlist());
  }, []);

  const toggle = useCallback((symbol: string) => {
    const { symbols: next } = toggleStorage(symbol);
    setSymbols(next);
  }, []);

  const isInWatchlist = useCallback(
    (symbol: string) => symbols.includes(symbol.trim().toUpperCase()),
    [symbols]
  );

  const value = useMemo(
    () => ({ symbols, isInWatchlist, toggle, refresh }),
    [symbols, isInWatchlist, toggle, refresh]
  );

  return (
    <WatchlistContext.Provider value={value}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used within WatchlistProvider");
  return ctx;
}
