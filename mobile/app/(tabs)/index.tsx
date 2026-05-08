import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import { Link } from "expo-router";
import { api } from "../../src/api/client";
import type { Company } from "../../src/types/company";
import {
  getRiskTier,
  getSignal,
  riskTierLabel,
  signalLabel,
} from "../../src/lib/screening";
import type { RiskTier, Signal } from "../../src/lib/screening";

function CompanyCard({
  company,
}: {
  company: Company;
}) {
  const risk = getRiskTier(company.analysis as Record<string, unknown>);
  const sig = getSignal(company.analysis as Record<string, unknown>);

  const sigStyle = sig === "buy" ? styles.badgeGreen : sig === "sell" ? styles.badgeRed : styles.badgeAmber;
  const riskStyle = risk === "low" ? styles.badgeSky : risk === "high" ? styles.badgeRed : styles.badgeAmber;

  return (
    <Link href={`/company/${company.symbol}`} asChild>
      <TouchableOpacity style={styles.card} activeOpacity={0.7}>
        <Text style={styles.symbol}>{company.symbol}</Text>
        <Text style={styles.name} numberOfLines={2}>{company.name}</Text>
        <Text style={styles.sector}>{company.sector ?? "N/A"}</Text>
        <View style={styles.badges}>
          {sig && <View style={[styles.badge, sigStyle]}><Text style={styles.badgeText}>{signalLabel[sig as Signal]}</Text></View>}
          {risk && <View style={[styles.badge, riskStyle]}><Text style={styles.badgeText}>{riskTierLabel[risk as RiskTier]}</Text></View>}
        </View>
      </TouchableOpacity>
    </Link>
  );
}

function Section({
  title,
  subtitle,
  companies,
  loading,
  viewAllHref,
  viewAllLabel,
}: {
  title: string;
  subtitle: string;
  companies: Company[];
  loading: boolean;
  viewAllHref?: string;
  viewAllLabel?: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      {loading ? (
        <ActivityIndicator size="small" color="#0d9488" style={styles.loader} />
      ) : companies.length === 0 ? (
        <Text style={styles.empty}>No companies in this category.</Text>
      ) : (
        <>
          <View style={styles.cardRow}>
            {companies.slice(0, 6).map((c) => (
              <CompanyCard key={c.id} company={c} />
            ))}
          </View>
          {viewAllHref && companies.length > 0 && (
            <Link href={viewAllHref as any} asChild>
              <TouchableOpacity style={styles.viewAll}>
                <Text style={styles.viewAllText}>{viewAllLabel ?? "View all →"}</Text>
              </TouchableOpacity>
            </Link>
          )}
        </>
      )}
    </View>
  );
}

function fetchDashboard(
  setMostInvestable: (v: Company[]) => void,
  setLowRisk: (v: Company[]) => void,
  setHighRisk: (v: Company[]) => void,
  setTimeToInvest: (v: Company[]) => void,
  setWaitForEntry: (v: Company[]) => void,
  setLoading: (v: boolean) => void,
  setError: (v: string | null) => void,
  cancelled: { current: boolean }
) {
  setLoading(true);
  setError(null);
  Promise.all([
    api.listCompanies({ limit: 10, investability: "high" }),
    api.listCompanies({ limit: 10, risk_tier: "low" }),
    api.listCompanies({ limit: 10, risk_tier: "high" }),
    api.listCompanies({ limit: 10, entry_timing: "now" }),
    api.listCompanies({ limit: 10, entry_timing: "wait" }),
  ])
    .then(([a, b, c, d, e]) => {
      if (!cancelled.current) {
        setMostInvestable(a);
        setLowRisk(b);
        setHighRisk(c);
        setTimeToInvest(d);
        setWaitForEntry(e);
      }
    })
    .catch((e) => {
      if (!cancelled.current) {
        const msg = e instanceof Error ? e.message : "Request failed";
        setError(msg);
      }
    })
    .finally(() => {
      if (!cancelled.current) setLoading(false);
    });
}

export default function Dashboard() {
  const [mostInvestable, setMostInvestable] = useState<Company[]>([]);
  const [lowRisk, setLowRisk] = useState<Company[]>([]);
  const [highRisk, setHighRisk] = useState<Company[]>([]);
  const [timeToInvest, setTimeToInvest] = useState<Company[]>([]);
  const [waitForEntry, setWaitForEntry] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cancelled = { current: false };
    const set = {
      setMostInvestable,
      setLowRisk,
      setHighRisk,
      setTimeToInvest,
      setWaitForEntry,
      setLoading,
      setError,
    };
    fetchDashboard(
      set.setMostInvestable,
      set.setLowRisk,
      set.setHighRisk,
      set.setTimeToInvest,
      set.setWaitForEntry,
      set.setLoading,
      set.setError,
      cancelled
    );
    return () => { cancelled.current = true; };
  }, []);

  const retry = () => {
    const cancelled = { current: false };
    fetchDashboard(
      setMostInvestable,
      setLowRisk,
      setHighRisk,
      setTimeToInvest,
      setWaitForEntry,
      setLoading,
      setError,
      cancelled
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
          {__DEV__ ? (
            <Text style={styles.errorBannerHint}>
              Ensure the backend is running (e.g. Docker: port 8212) and .env has EXPO_PUBLIC_API_URL.
            </Text>
          ) : null}
          <TouchableOpacity style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>NEPSE Equity Research</Text>
        <Text style={styles.heroSubtitle}>
          Company analysis, risk profile, and entry timing for the Nepal stock market.
        </Text>
        <Text style={styles.heroDisclaimer}>
          AI-based analysis from historical data. Not professional investment advice.
        </Text>
        <Link href="/companies" asChild>
          <TouchableOpacity style={styles.cta}>
            <Text style={styles.ctaText}>Browse all companies</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <Section
        title="High Conviction"
        subtitle="High quality and conviction. Suitable for core portfolio."
        companies={mostInvestable}
        loading={loading}
        viewAllHref="/companies?investability=high"
        viewAllLabel="View all →"
      />
      <Section
        title="Low Risk"
        subtitle="Lower risk profile. Suitable for conservative investors."
        companies={lowRisk}
        loading={loading}
        viewAllHref="/companies?risk_tier=low"
        viewAllLabel="View all →"
      />
      <Section
        title="High Risk / Return"
        subtitle="Higher volatility and return potential. For risk-tolerant investors."
        companies={highRisk}
        loading={loading}
        viewAllHref="/companies?risk_tier=high"
        viewAllLabel="View all →"
      />
      <Section
        title="Buy Signal"
        subtitle="Favorable entry timing. Consider buying at current levels."
        companies={timeToInvest}
        loading={loading}
        viewAllHref="/companies?entry_timing=now"
        viewAllLabel="View all →"
      />
      <Section
        title="Hold Signal"
        subtitle="Wait for better entry or more clarity."
        companies={waitForEntry}
        loading={loading}
        viewAllHref="/companies?entry_timing=wait"
        viewAllLabel="View all →"
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          <Text style={styles.footerBold}>Disclaimer:</Text> This site provides AI-based analysis derived from historical and publicly available data. It is for informational and educational purposes only and must not be considered professional investment advice.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafaf9" },
  content: { paddingBottom: 32 },
  errorBanner: {
    margin: 16,
    padding: 16,
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorBannerText: { fontSize: 15, color: "#b91c1c", fontWeight: "500" },
  errorBannerHint: { fontSize: 13, color: "#991b1b", marginTop: 8 },
  retryButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "#0d9488",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  retryButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  hero: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: 24,
    margin: 16,
    marginBottom: 8,
    alignItems: "center",
  },
  heroTitle: { fontSize: 22, fontWeight: "600", color: "#1c1917", textAlign: "center" },
  heroSubtitle: { fontSize: 14, color: "#57534e", marginTop: 8, textAlign: "center", paddingHorizontal: 8 },
  heroDisclaimer: { fontSize: 12, color: "#78716c", marginTop: 8, textAlign: "center" },
  cta: {
    marginTop: 20,
    backgroundColor: "#0d9488",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  ctaText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  section: { paddingHorizontal: 16, marginTop: 24 },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: "#1c1917" },
  sectionSubtitle: { fontSize: 13, color: "#78716c", marginTop: 4 },
  loader: { marginVertical: 16 },
  empty: { fontSize: 14, color: "#78716c", marginVertical: 16 },
  cardRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: 16,
  },
  symbol: { fontFamily: "monospace", fontSize: 14, fontWeight: "600", color: "#0d9488" },
  name: { fontSize: 14, fontWeight: "500", color: "#292524", marginTop: 4 },
  sector: { fontSize: 12, color: "#78716c", marginTop: 4 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "500" },
  badgeGreen: { backgroundColor: "#d1fae5" },
  badgeSky: { backgroundColor: "#e0f2fe" },
  badgeRed: { backgroundColor: "#fee2e2" },
  badgeAmber: { backgroundColor: "#fef3c7" },
  badgeTeal: { backgroundColor: "#ccfbf1" },
  viewAll: { marginTop: 8 },
  viewAllText: { fontSize: 14, fontWeight: "500", color: "#0d9488" },
  footer: {
    marginTop: 32,
    marginHorizontal: 16,
    padding: 16,
    borderTopWidth: 1,
    borderColor: "#e7e5e4",
  },
  footerText: { fontSize: 12, color: "#78716c" },
  footerBold: { fontWeight: "600", color: "#57534e" },
});
