/** Frontend-only watchlist (localStorage). */

const STORAGE_KEY = "nepse_watchlist";

export function getWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string").map((s) => s.trim().toUpperCase()).filter(Boolean);
  } catch {
    return [];
  }
}

export function addToWatchlist(symbol: string): string[] {
  const next = [...new Set([...getWatchlist(), symbol.trim().toUpperCase()])];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function removeFromWatchlist(symbol: string): string[] {
  const key = symbol.trim().toUpperCase();
  const next = getWatchlist().filter((s) => s !== key);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function toggleWatchlist(symbol: string): { symbols: string[]; added: boolean } {
  const key = symbol.trim().toUpperCase();
  const current = getWatchlist();
  if (current.includes(key)) {
    return { symbols: removeFromWatchlist(symbol), added: false };
  }
  return { symbols: addToWatchlist(symbol), added: true };
}

export function isInWatchlist(symbol: string): boolean {
  return getWatchlist().includes(symbol.trim().toUpperCase());
}
