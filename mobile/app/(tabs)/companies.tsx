import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../src/api/client";
import type { Company } from "../../src/types/company";
import {
  getRiskTier,
  getSignal,
  riskTierLabel,
  signalLabel,
  entryTimingLabel,
} from "../../src/lib/screening";
import type { RiskTier, Signal } from "../../src/lib/screening";

function CompanyRow({
  company,
}: {
  company: Company;
}) {
  const risk = getRiskTier(company.analysis as Record<string, unknown>);
  const sig = getSignal(company.analysis as Record<string, unknown>);
  const recStyle = sig === "buy" ? styles.badgeGreen : sig === "sell" ? styles.badgeRed : styles.badgeAmber;
  const riskStyle = risk === "low" ? styles.badgeSky : risk === "high" ? styles.badgeRed : styles.badgeAmber;

  return (
    <Link href={`/company/${company.symbol}`} asChild>
      <TouchableOpacity style={styles.card} activeOpacity={0.7}>
        <Text style={styles.symbol}>{company.symbol}</Text>
        <Text style={styles.name} numberOfLines={2}>{company.name}</Text>
        <Text style={styles.sector}>{company.sector ?? "N/A"}</Text>
        <View style={styles.badges}>
          {sig && <View style={[styles.badge, recStyle]}><Text style={styles.badgeText}>{signalLabel[sig as Signal]}</Text></View>}
          {risk && <View style={[styles.badge, riskStyle]}><Text style={styles.badgeText}>{riskTierLabel[risk as RiskTier]}</Text></View>}
        </View>
      </TouchableOpacity>
    </Link>
  );
}

export default function CompaniesScreen() {
  const params = useLocalSearchParams<{
    risk_tier?: string;
    entry_timing?: string;
    investability?: string;
  }>();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");

  const risk_tier = params.risk_tier;
  const entry_timing = params.entry_timing;
  const investability = params.investability;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listCompanies({
        limit: 500,
        q: search || undefined,
        risk_tier,
        entry_timing,
        investability,
      })
      .then((data) => {
        if (!cancelled) setCompanies(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
  }, [search, risk_tier, entry_timing, investability]);

  const router = useRouter();
  const withAnalysis = companies.filter((c) => c.analysis).length;

  const setFilter = (key: "risk_tier" | "entry_timing", value: string | null) => {
    const next: Record<string, string> = {};
    if (params.risk_tier && key !== "risk_tier") next.risk_tier = params.risk_tier;
    if (params.entry_timing && key !== "entry_timing") next.entry_timing = params.entry_timing;
    if (value) next[key] = value;
    const qs = new URLSearchParams(next).toString();
    router.replace(qs ? `/companies?${qs}` : "/companies");
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <View style={styles.stats}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{companies.length}</Text>
          <Text style={styles.statLabel}>Showing</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{withAnalysis}</Text>
          <Text style={styles.statLabel}>With analysis</Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={q}
          onChangeText={setQ}
          placeholder="Symbol, name, or sector…"
          placeholderTextColor="#a8a29e"
          returnKeyType="search"
          onSubmitEditing={() => setSearch(q.trim())}
        />
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => setSearch(q.trim())}
        >
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        <Text style={styles.filterLabel}>Signal</Text>
        {(["now", "wait", "avoid"] as const).map((t) => {
          const label = entryTimingLabel[t];
          return (
            <TouchableOpacity
              key={t}
              style={[styles.chip, entry_timing === t && styles.chipActive]}
              onPress={() => setFilter("entry_timing", entry_timing === t ? null : t)}
            >
              <Text style={[styles.chipText, entry_timing === t && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
        <Text style={[styles.filterLabel, { marginLeft: 12 }]}>Risk</Text>
        {(["low", "moderate", "high"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.chip, risk_tier === t && styles.chipActive]}
            onPress={() => setFilter("risk_tier", risk_tier === t ? null : t)}
          >
            <Text style={[styles.chipText, risk_tier === t && styles.chipTextActive]}>{riskTierLabel[t]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          {__DEV__ ? (
            <Text style={styles.errorHint}>
              Ensure the backend is running (e.g. Docker on port 8212) and mobile/.env has EXPO_PUBLIC_API_URL=http://localhost:8212/api
            </Text>
          ) : null}
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setError(null);
              setLoading(true);
              api.listCompanies({ limit: 500, q: search || undefined, risk_tier, entry_timing, investability })
                .then(setCompanies)
                .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
                .finally(() => setLoading(false));
            }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#0d9488" style={styles.loader} />
      ) : companies.length === 0 ? (
        <Text style={styles.empty}>No companies match. Try different filters or search.</Text>
      ) : (
        <FlatList
          data={companies}
          keyExtractor={(c) => String(c.id)}
          renderItem={({ item }) => <CompanyRow company={item} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
          style={styles.list}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafaf9" },
  stats: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  statBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  statValue: { fontSize: 20, fontWeight: "600", color: "#0d9488" },
  statLabel: { fontSize: 12, color: "#78716c", marginTop: 2 },
  searchRow: { flexDirection: "row", gap: 8, padding: 16, paddingTop: 12 },
  input: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e7e5e4",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1c1917",
  },
  searchBtn: {
    backgroundColor: "#0d9488",
    paddingHorizontal: 18,
    justifyContent: "center",
    borderRadius: 12,
  },
  searchBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  filters: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", paddingHorizontal: 16, gap: 8 },
  filterLabel: { fontSize: 12, fontWeight: "500", color: "#78716c" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#f5f5f4",
  },
  chipActive: { backgroundColor: "#0d9488" },
  chipText: { fontSize: 13, fontWeight: "500", color: "#57534e" },
  chipTextActive: { color: "#fff" },
  errorBox: { margin: 16, padding: 16, backgroundColor: "#fef2f2", borderRadius: 12, borderWidth: 1, borderColor: "#fecaca" },
  errorText: { color: "#b91c1c", fontSize: 14 },
  errorHint: { color: "#991b1b", fontSize: 12, marginTop: 8 },
  retryButton: { marginTop: 12, alignSelf: "flex-start", backgroundColor: "#0d9488", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  retryButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  loader: { marginTop: 32 },
  empty: { padding: 32, textAlign: "center", color: "#78716c", fontSize: 15 },
  list: { flex: 1 },
  listContent: { padding: 16, paddingTop: 8, paddingBottom: 24 },
  separator: { height: 12 },
  card: {
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
  badgeText: { fontSize: 11, fontWeight: "500", color: "#1c1917" },
  badgeGreen: { backgroundColor: "#d1fae5" },
  badgeSky: { backgroundColor: "#e0f2fe" },
  badgeRed: { backgroundColor: "#fee2e2" },
  badgeAmber: { backgroundColor: "#fef3c7" },
  badgeTeal: { backgroundColor: "#ccfbf1" },
});
