import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api/client";

export function ViewCounter() {
  const location = useLocation();
  const [total, setTotal] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const recorded = useRef<string | null>(null);

  useEffect(() => {
    const page = location.pathname || "/";
    if (recorded.current !== page) {
      recorded.current = page;
      api.recordPageView(page).catch(() => {});
    }
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    const fetchCount = () => {
      api
        .getPageViewCount()
        .then((data) => {
          if (!cancelled) {
            if (total !== null && data.total !== total) {
              setAnimating(true);
              setTimeout(() => setAnimating(false), 800);
            }
            setTotal(data.total);
          }
        })
        .catch(() => {});
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (total === null) {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-stone-400">
        <div className="h-3 w-3 rounded-full skeleton" />
        <div className="h-3 w-24 rounded-full skeleton" />
      </div>
    );
  }

  const digits = total.toLocaleString().split("");

  const StatBox = ({
    label,
    value,
    icon,
  }: {
    label: string;
    value: number;
    icon: React.ReactNode;
  }) => (
    <div className="inline-flex items-center gap-2 text-xs text-stone-500">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-50 text-teal-600">
        {icon}
      </div>
      <span className="text-stone-400">{label}</span>
      <span className="font-mono text-sm font-semibold tabular-nums tracking-tight text-stone-700">
        {animating ? (
          <span className="inline-flex text-teal-600 transition-colors">
            {digits.map((d, i) => (
              <span key={i} className="digit-pop" style={{ animationDelay: `${i * 30}ms` }}>
                {d}
              </span>
            ))}
          </span>
        ) : (
          value.toLocaleString()
        )}
      </span>
    </div>
  );

  return (
    <div className="flex justify-center sm:justify-end">
      <StatBox
        label="Total page views"
        value={total}
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        }
      />
    </div>
  );
}
