import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { Link, useLocalSearchParams, useNavigation } from "expo-router";
import { api } from "../../src/api/client";
import type {
  Company,
  CompanyAnalysisListItem,
  CompanyAnalysisResponse,
} from "../../src/types/company";
import {
  getRiskTier,
  getSignal,
  riskTierLabel,
  signalLabel,
} from "../../src/lib/screening";
import type { RiskTier, Signal } from "../../src/lib/screening";

function formatAnalysisDate(analyzed_at: string) {
  return new Date(analyzed_at).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const OVERVIEW_LABELS: Record<string, string> = {
  market_price: "Current price",
  p_e_ratio: "P/E ratio",
  pe_ratio: "P/E ratio",
  book_value: "Book value",
  eps: "EPS",
  pbv: "P/BV",
  sector: "Sector",
  "52_weeks_high_low": "52 weeks high/low",
  pct_change: "% change",
  market_capitalization: "Market cap",
  last_traded_on: "Last traded",
};

const OVERVIEW_ORDER = [
  "market_price",
  "pct_change",
  "sector",
  "p_e_ratio",
  "pe_ratio",
  "book_value",
  "eps",
  "pbv",
  "52_weeks_high_low",
  "market_capitalization",
  "last_traded_on",
];

function overviewLabel(key: string): string {
  return OVERVIEW_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function CurrentValuesSection({
  sector,
  overview,
}: {
  sector: string | null;
  overview: Record<string, string | number> | null;
}) {
  const hasOverview = overview && typeof overview === "object" && Object.keys(overview).length > 0;
  const hasSector = sector != null && sector.trim() !== "";
  if (!hasOverview && !hasSector) return null;

  const entries: [string, string][] = [];
  const seen = new Set<string>();
  if (hasOverview) {
    for (const key of OVERVIEW_ORDER) {
      if (overview![key] != null && overview![key] !== "" && !seen.has(key)) {
        seen.add(key);
        entries.push([key, String(overview![key])]);
      }
    }
    Object.entries(overview!).forEach(([k, v]) => {
      if (v != null && v !== "" && !seen.has(k)) {
        seen.add(k);
        entries.push([k, String(v)]);
      }
    });
  }
  if (!seen.has("sector") && hasSector) {
    entries.unshift(["sector", sector!.trim()]);
  }
  if (entries.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Current values</Text>
      {entries.map(([key, value]) => (
        <View key={key} style={styles.overviewRow}>
          <Text style={styles.overviewLabel}>{overviewLabel(key)}</Text>
          <Text style={styles.overviewValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

type Analysis = Record<string, unknown> | null;

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
}

function AnalysisScoresSection({ analysis }: { analysis: Analysis }) {
  if (!analysis || typeof analysis !== "object") return null;
  const inv = analysis.investment_snapshot as Record<string, unknown> | undefined;
  const val = analysis.valuation_analysis as Record<string, unknown> | undefined;
  const risk = analysis.risk_analysis as Record<string, unknown> | undefined;
  const div = analysis.dividend_profile as Record<string, unknown> | undefined;
  const fin = analysis.final_decision as Record<string, unknown> | undefined;

  const scores: { label: string; value: number; max: number; danger?: boolean }[] = [
    { label: "Quality", value: num(inv?.investment_quality_score_numeric) ?? 0, max: 10 },
    { label: "Risk", value: num(inv?.risk_score_numeric) ?? 0, max: 10, danger: true },
    { label: "Return potential", value: num(inv?.return_potential_numeric) ?? 0, max: 10 },
    { label: "Confidence", value: num(fin?.confidence_score_numeric) ?? 0, max: 10 },
    { label: "Volatility", value: num(risk?.volatility_score_numeric) ?? 0, max: 10, danger: true },
    { label: "Dividend consistency", value: num(div?.dividend_consistency_score_numeric) ?? 0, max: 10 },
  ].filter((s) => s.value != null);

  const valuationScore = num(val?.valuation_score_numeric);
  const investScore = num(fin?.invest_score_numeric);

  if (scores.length === 0 && valuationScore == null && investScore == null) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Analysis scores</Text>
      {scores.map((s) => (
        <View key={s.label} style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>{s.label}</Text>
          <View style={styles.scoreBarBg}>
            <View
              style={[
                styles.scoreBarFill,
                { width: `${(s.value / s.max) * 100}%` },
                s.danger ? styles.scoreBarDanger : undefined,
              ]}
            />
          </View>
          <Text style={styles.scoreValue}>{s.value}/{s.max}</Text>
        </View>
      ))}
      {valuationScore != null && (
        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>Valuation</Text>
          <Text style={styles.scoreValue}>
            {valuationScore === -1 ? "Undervalued" : valuationScore === 0 ? "Fair" : "Overvalued"}
          </Text>
        </View>
      )}
      {investScore != null && (
        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>Consider investing now</Text>
          <Text style={styles.scoreValue}>
            {investScore <= 0 ? "No" : investScore < 1 ? "Conditional" : "Yes"}
          </Text>
        </View>
      )}
    </View>
  );
}

function AnalysisCardsSection({ analysis }: { analysis: Analysis }) {
  if (!analysis || typeof analysis !== "object") return null;
  const finalDecision = analysis.final_decision as Record<string, unknown> | undefined;
  const whoInvest = analysis.who_should_invest as unknown[] | undefined;
  const whoAvoid = analysis.who_should_avoid as unknown[] | undefined;

  const kv = (obj: Record<string, unknown> | undefined) =>
    obj && typeof obj === "object"
      ? Object.entries(obj)
          .filter(([k]) => !k.endsWith("_numeric") && !k.endsWith("_pct"))
          .map(([k, v]) => (
            <View key={k} style={styles.kvRow}>
              <Text style={styles.kvLabel}>{k.replace(/_/g, " ")}</Text>
              <Text style={styles.kvValue}>{Array.isArray(v) ? v.join(", ") : String(v ?? "N/A")}</Text>
            </View>
          ))
      : null;

  return (
    <View style={styles.analysisSection}>
      {finalDecision && (
        <View style={[styles.card, styles.cardHighlight]}>
          <Text style={styles.cardTitle}>Final decision</Text>
          {kv(finalDecision)}
        </View>
      )}
      {(whoInvest?.length ?? 0) > 0 || (whoAvoid?.length ?? 0) > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Who should invest / avoid</Text>
          {whoInvest?.length ? (
            <View style={styles.whoSection}>
              <Text style={styles.whoLabel}>Invest</Text>
              <View style={styles.whoTags}>
                {whoInvest.map((item, i) => (
                  <View key={i} style={styles.tagGreen}>
                    <Text style={styles.tagText}>{String(item)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {whoAvoid?.length ? (
            <View style={styles.whoSection}>
              <Text style={styles.whoLabel}>Avoid</Text>
              <View style={styles.whoTags}>
                {whoAvoid.map((item, i) => (
                  <View key={i} style={styles.tagRed}>
                    <Text style={styles.tagText}>{String(item)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function CompanyDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const navigation = useNavigation();
  const [company, setCompany] = useState<Company | null>(null);
  const [analyses, setAnalyses] = useState<CompanyAnalysisListItem[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<CompanyAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.getCompany(symbol), api.listCompanyAnalyses(symbol)])
      .then(([companyData, analysesData]) => {
        if (!cancelled) {
          setCompany(companyData);
          setAnalyses(analysesData);
          setSelectedAnalysis(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Not found");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [symbol]);

  useEffect(() => {
    if (company) {
      navigation.setOptions({ title: `${company.name} (${company.symbol})` });
    }
  }, [company, navigation]);

  const loadAnalysisById = (analysisId: number) => {
    if (!symbol) return;
    setSelectedAnalysis(null);
    api.getCompanyAnalysis(symbol, analysisId).then(setSelectedAnalysis).catch(() => setSelectedAnalysis(null));
  };

  const analysisToShow = selectedAnalysis?.analysis ?? company?.analysis ?? null;

  if (!symbol) return <Text style={styles.errorText}>Missing symbol.</Text>;
  if (loading) return <ActivityIndicator size="large" color="#0d9488" style={styles.loader} />;
  if (error || !company) {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>{error ?? "Company not found."}</Text>
        <Link href="/companies" asChild>
          <TouchableOpacity style={styles.backLink}>
            <Text style={styles.backLinkText}>← Back to screener</Text>
          </TouchableOpacity>
        </Link>
      </View>
    );
  }

  const risk = analysisToShow && getRiskTier(analysisToShow as Record<string, unknown>);
  const sig = analysisToShow && getSignal(analysisToShow as Record<string, unknown>);
  const sigStyle = sig === "buy" ? styles.badgeGreen : sig === "sell" ? styles.badgeRed : styles.badgeAmber;
  const riskStyle = risk === "low" ? styles.badgeSky : risk === "high" ? styles.badgeRed : styles.badgeAmber;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.symbolBadge}>
            <Text style={styles.symbolText}>{company.symbol}</Text>
          </View>
          <View style={styles.badges}>
            {sig && <View style={[styles.badge, sigStyle]}><Text style={styles.badgeText}>{signalLabel[sig as Signal]}</Text></View>}
            {risk && <View style={[styles.badge, riskStyle]}><Text style={styles.badgeText}>{riskTierLabel[risk as RiskTier]}</Text></View>}
          </View>
        </View>
        <Text style={styles.companyName}>{company.name}</Text>
        <Text style={styles.meta}>
          {company.sector ?? "N/A"}  ·  Data as of {new Date(company.updated_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
        </Text>
        {analysisToShow && (() => {
          const fin = analysisToShow.final_decision as Record<string, unknown> | undefined;
          const confidence = fin && typeof fin.confidence_score_numeric === "number" ? fin.confidence_score_numeric : null;
          const summary = fin && typeof fin.summary_verdict === "string" ? fin.summary_verdict : null;
          return (
            <>
              {summary ? <Text style={styles.summaryVerdict}>&ldquo;{summary}&rdquo;</Text> : null}
              {confidence !== null && confidence <= 4 ? (
                <View style={styles.lowConfidence}>
                  <Text style={styles.lowConfidenceText}>Low confidence in this analysis.</Text>
                </View>
              ) : null}
            </>
          );
        })()}
        {analyses.length > 0 && (
          <View style={styles.pickerRow}>
            <Text style={styles.pickerLabel}>Analysis from: </Text>
            <TouchableOpacity
              style={styles.pickerTouch}
              onPress={() => setSelectedAnalysis(null)}
            >
              <Text style={styles.pickerText}>Latest</Text>
            </TouchableOpacity>
            {analyses.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={styles.pickerTouch}
                onPress={() => loadAnalysisById(a.id)}
              >
                <Text style={styles.pickerText}>{formatAnalysisDate(a.analyzed_at)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <CurrentValuesSection sector={company.sector} overview={company.overview} />

      {analysisToShow && Object.keys(analysisToShow).length > 0 && (
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            <Text style={styles.disclaimerBold}>Disclaimer:</Text> This analysis is AI-generated from historical data. Not professional investment advice.
          </Text>
        </View>
      )}

      {analysisToShow && Object.keys(analysisToShow).length > 0 ? (
        <>
          <AnalysisScoresSection analysis={analysisToShow} />
          <AnalysisCardsSection analysis={analysisToShow} />
        </>
      ) : (
        <View style={styles.emptyAnalysis}>
          <Text style={styles.emptyAnalysisText}>No analysis available for this company yet.</Text>
          <Link href="/companies" asChild>
            <TouchableOpacity>
              <Text style={styles.emptyAnalysisLink}>Browse other companies →</Text>
            </TouchableOpacity>
          </Link>
        </View>
      )}

      <Link href="/companies" asChild>
        <TouchableOpacity style={styles.footerBack}>
          <Text style={styles.footerBackText}>← Back to screener</Text>
        </TouchableOpacity>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafaf9" },
  content: { paddingBottom: 40 },
  loader: { flex: 1, justifyContent: "center", marginTop: 48 },
  errorBox: { margin: 16, padding: 20, backgroundColor: "#fef2f2", borderRadius: 12 },
  errorText: { color: "#b91c1c", fontSize: 15 },
  backLink: { marginTop: 12 },
  backLinkText: { color: "#dc2626", fontWeight: "500", fontSize: 14 },
  header: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: 20,
    margin: 16,
    marginBottom: 12,
  },
  headerTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  symbolBadge: { backgroundColor: "#f5f5f4", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  symbolText: { fontFamily: "monospace", fontWeight: "600", fontSize: 14, color: "#44403c" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "500", color: "#1c1917" },
  badgeGreen: { backgroundColor: "#d1fae5" },
  badgeSky: { backgroundColor: "#e0f2fe" },
  badgeRed: { backgroundColor: "#fee2e2" },
  badgeAmber: { backgroundColor: "#fef3c7" },
  badgeTeal: { backgroundColor: "#ccfbf1" },
  companyName: { fontSize: 22, fontWeight: "600", color: "#1c1917", marginTop: 12 },
  meta: { fontSize: 13, color: "#78716c", marginTop: 4 },
  summaryVerdict: { fontSize: 13, color: "#57534e", fontStyle: "italic", marginTop: 8 },
  lowConfidence: { marginTop: 8, alignSelf: "flex-start", backgroundColor: "#fffbeb", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  lowConfidenceText: { fontSize: 12, fontWeight: "500", color: "#92400e" },
  pickerRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 16 },
  pickerLabel: { fontSize: 13, color: "#78716c" },
  pickerTouch: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#f5f5f4", borderRadius: 8 },
  pickerText: { fontSize: 13, color: "#44403c" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e7e5e4",
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  cardHighlight: { borderLeftWidth: 4, borderLeftColor: "#0d9488", backgroundColor: "#f0fdfa" },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#292524", marginBottom: 12 },
  overviewRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  overviewLabel: { fontSize: 13, color: "#78716c" },
  overviewValue: { fontSize: 13, fontWeight: "500", color: "#1c1917" },
  scoreRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 12 },
  scoreLabel: { fontSize: 13, color: "#78716c", width: 120 },
  scoreBarBg: { flex: 1, height: 8, backgroundColor: "#f5f5f4", borderRadius: 4, overflow: "hidden" },
  scoreBarFill: { height: "100%", backgroundColor: "#0d9488", borderRadius: 4 },
  scoreBarDanger: { backgroundColor: "#dc2626" },
  scoreValue: { fontSize: 13, fontWeight: "600", color: "#44403c", minWidth: 32 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  kvLabel: { fontSize: 13, color: "#78716c", flex: 1 },
  kvValue: { fontSize: 13, color: "#292524", flex: 1, textAlign: "right" },
  analysisSection: { paddingHorizontal: 16, gap: 12 },
  whoSection: { marginTop: 8 },
  whoLabel: { fontSize: 11, fontWeight: "600", color: "#78716c", marginBottom: 6 },
  whoTags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tagGreen: { backgroundColor: "#d1fae5", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  tagRed: { backgroundColor: "#fee2e2", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  tagText: { fontSize: 13, color: "#1c1917" },
  disclaimer: { marginHorizontal: 16, marginBottom: 12, padding: 14, backgroundColor: "#fffbeb", borderRadius: 12, borderWidth: 1, borderColor: "#fde68a" },
  disclaimerText: { fontSize: 13, color: "#92400e" },
  disclaimerBold: { fontWeight: "600" },
  emptyAnalysis: { margin: 16, padding: 24, backgroundColor: "#fafaf9", borderRadius: 16, alignItems: "center" },
  emptyAnalysisText: { fontSize: 15, color: "#57534e" },
  emptyAnalysisLink: { marginTop: 12, fontSize: 14, fontWeight: "500", color: "#0d9488" },
  footerBack: { marginHorizontal: 16, marginTop: 16 },
  footerBackText: { fontSize: 14, fontWeight: "500", color: "#0d9488" },
});
