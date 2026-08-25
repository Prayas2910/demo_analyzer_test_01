import React, { useState } from "react";
import { analyzeCompany, searchCompany } from "../api.js";

// ─── constants ────────────────────────────────────────────────────────────────

const RISK_COLOR = {
  High:    { text: "#ff7b72", bar: "#ff7b72", bg: "rgba(255,123,114,0.10)", border: "rgba(255,123,114,0.28)" },
  Medium:  { text: "#f0b969", bar: "#f0b969", bg: "rgba(240,185,105,0.10)", border: "rgba(240,185,105,0.26)" },
  Low:     { text: "#72b6ff", bar: "#72b6ff", bg: "rgba(114,182,255,0.08)", border: "rgba(114,182,255,0.22)" },
  Minimal: { text: "#49c588", bar: "#49c588", bg: "rgba(73,197,136,0.08)",  border: "rgba(73,197,136,0.22)"  },
};

// Feature metadata: key → { label, description, goodWhen, format }
const FEATURE_META = {
  hasUrl:                 { label: "Has LinkedIn URL",       desc: "Verified company page exists on LinkedIn",            goodWhen: "high", fmt: v => v ? "Yes" : "No" },
  urlHasNumericId:        { label: "Numeric URL ID",         desc: "URL contains a numeric company identifier (legit sign)", goodWhen: "high", fmt: v => v ? "Yes" : "No" },
  urlLength:              { label: "URL length",             desc: "Character count of the LinkedIn URL",                 goodWhen: "high", fmt: v => `${v} chars` },
  nameLength:             { label: "Name length",            desc: "Total characters in the company name",                goodWhen: "low",  fmt: v => `${v} chars` },
  wordCount:              { label: "Word count",             desc: "Number of words in the company name",                 goodWhen: "low",  fmt: v => `${v} words` },
  avgWordLength:          { label: "Avg word length",        desc: "Mean characters per word — long words can indicate fabricated names", goodWhen: "low", fmt: v => v.toFixed(1) },
  suspiciousKeywordCount: { label: "Suspicious keywords",    desc: "Fraud-associated terms: investment, crypto, hiring, earn…", goodWhen: "low", fmt: v => `${v} found` },
  hasSuspiciousKeyword:   { label: "Contains sus. keyword",  desc: "At least one known fraud keyword detected",           goodWhen: "low",  fmt: v => v ? "Yes" : "No" },
  corporateSuffixCount:   { label: "Corporate suffixes",     desc: "Presence of LLC, Ltd, Inc, Corp etc. in name",       goodWhen: "neutral", fmt: v => `${v} found` },
  hasCorporateSuffix:     { label: "Has corporate suffix",   desc: "Name ends with a standard corporate identifier",      goodWhen: "neutral", fmt: v => v ? "Yes" : "No" },
  specialCharCount:       { label: "Special characters",     desc: "Symbols like &, (, ) in the name — legitimate names often have these", goodWhen: "high", fmt: v => `${v} found` },
  uppercaseRatio:         { label: "Uppercase ratio",        desc: "Proportion of uppercase letters (0–1)",               goodWhen: "neutral", fmt: v => `${(v * 100).toFixed(0)}%` },
  digitCount:             { label: "Digit count",            desc: "Numeric characters embedded in the name",             goodWhen: "neutral", fmt: v => `${v}` },
  hasDigit:               { label: "Contains digits",        desc: "Digits present in the company name",                  goodWhen: "neutral", fmt: v => v ? "Yes" : "No" },
  isAscii:                { label: "ASCII only",             desc: "Name uses only ASCII characters — non-ASCII common in real international firms", goodWhen: "low", fmt: v => v ? "Yes" : "No" },
  containsAmpersand:      { label: "Contains &",             desc: "Ampersand present — often seen in legitimate partnership names", goodWhen: "high", fmt: v => v ? "Yes" : "No" },
  containsComma:          { label: "Contains comma",         desc: "Comma present — can appear in legitimate formal company names", goodWhen: "high", fmt: v => v ? "Yes" : "No" },
};

// Features to show in the analysis panel (ordered by importance)
const FEATURE_ORDER = [
  "hasUrl", "urlHasNumericId", "urlLength",
  "suspiciousKeywordCount", "hasSuspiciousKeyword",
  "nameLength", "wordCount", "avgWordLength",
  "specialCharCount", "containsAmpersand", "containsComma",
  "hasCorporateSuffix", "isAscii", "uppercaseRatio",
];

// ─── sub-components ───────────────────────────────────────────────────────────

function ScoreGauge({ score, riskLevel }) {
  const col = RISK_COLOR[riskLevel] || RISK_COLOR.Minimal;
  const pct = Math.max(0, Math.min(100, score));
  // SVG arc gauge
  const R = 52, cx = 64, cy = 64;
  const totalArc = Math.PI; // 180° sweep (semicircle)
  const arcLen = 2 * Math.PI * R;
  const dashArray = Math.PI * R;
  const dashOffset = dashArray * (1 - pct / 100);

  return (
    <div className="cc-gauge-wrap">
      <svg viewBox="0 0 128 80" className="cc-gauge-svg">
        {/* Track */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none"
          stroke={col.bar}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dashArray}`}
          strokeDashoffset={`${dashOffset}`}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div className="cc-gauge-score">
        <span className="cc-gauge-num" style={{ color: col.text }}>{score}</span>
        <span className="cc-gauge-label">/ 100</span>
      </div>
      <span className="cc-gauge-level" style={{ background: col.bg, color: col.text, border: `1px solid ${col.border}` }}>
        {riskLevel} Risk
      </span>
    </div>
  );
}

function FeatureRow({ featureKey, value }) {
  const meta = FEATURE_META[featureKey];
  if (!meta) return null;

  // Determine signal colour
  let signal = "neutral";
  if (meta.goodWhen === "high") signal = value ? "good" : "bad";
  else if (meta.goodWhen === "low") signal = value ? "bad" : "good";

  // For counts, any value > 0 is "bad" when goodWhen=low
  if (meta.goodWhen === "low" && typeof value === "number") {
    signal = value > 0 ? "bad" : "good";
  }
  if (meta.goodWhen === "high" && typeof value === "number") {
    signal = value > 0 ? "good" : "bad";
  }

  const dot = signal === "good" ? "●" : signal === "bad" ? "●" : "○";
  const dotCls = `cc-feat-dot ${signal}`;

  return (
    <div className="cc-feat-row">
      <span className={dotCls}>{dot}</span>
      <div className="cc-feat-body">
        <div className="cc-feat-top">
          <span className="cc-feat-name">{meta.label}</span>
          <span className="cc-feat-val">{meta.fmt(value)}</span>
        </div>
        <span className="cc-feat-desc">{meta.desc}</span>
      </div>
    </div>
  );
}

function VerdictBadge({ labelName }) {
  if (!labelName) return null;
  const isFake = labelName === "Fake_Scam";
  return (
    <span className={`verdict-badge ${isFake ? "fake" : "legit"}`}>
      {isFake ? "⚠ FRAUDULENT" : "✓ LEGITIMATE"}
    </span>
  );
}

function AnalysisPanel({ data }) {
  if (!data) return null;
  const { companyName, url, label, labelName, fraudScore, riskLevel, features, source, split, id } = data;
  const isFake = label === 1;
  const isComputed = source === "computed";
  const col = RISK_COLOR[riskLevel] || RISK_COLOR.Minimal;

  return (
    <div className="cc-analysis-panel" style={{ borderColor: col.border }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="cc-analysis-header">
        <div className="cc-analysis-name-block">
          <div className="cc-analysis-company-name">{companyName}</div>
          {url ? (
            <a className="cc-card-url" href={url} target="_blank" rel="noreferrer">🔗 {url}</a>
          ) : (
            <span className="cc-no-url">No LinkedIn URL on record</span>
          )}
        </div>
        <div className="cc-analysis-badges">
          {labelName ? (
            <VerdictBadge labelName={labelName} />
          ) : (
            <span className="cc-computed-badge">⚡ Computed</span>
          )}
          {id && <span className="cc-id-pill">ID #{id}</span>}
          {split && <span className="cc-split-pill">{split}</span>}
        </div>
      </div>

      {/* ── Score gauge + summary ────────────────────────────── */}
      <div className="cc-analysis-top">
        <ScoreGauge score={fraudScore} riskLevel={riskLevel} />

        <div className="cc-analysis-summary">
          <div className="cc-summary-title">Risk Assessment</div>
          {isComputed && (
            <div className="cc-computed-note">
              This company was not found in the dataset. Features were computed live from the name and URL using the same XGBoost feature extraction pipeline.
            </div>
          )}
          {!isComputed && label !== null && (
            <div className="cc-dataset-note" style={{ color: isFake ? col.text : "#49c588" }}>
              {isFake
                ? "This company is confirmed fraudulent in the training dataset."
                : "This company is confirmed legitimate in the training dataset."}
            </div>
          )}
          <div className="cc-signal-pills">
            {features.hasSuspiciousKeyword ? <span className="cc-signal-pill bad">Suspicious keyword</span> : null}
            {!features.hasUrl ? <span className="cc-signal-pill bad">No LinkedIn URL</span> : null}
            {features.hasUrl && features.urlHasNumericId ? <span className="cc-signal-pill good">Numeric URL ID</span> : null}
            {features.nameLength > 28 ? <span className="cc-signal-pill warn">Long name</span> : null}
            {features.specialCharCount > 0 ? <span className="cc-signal-pill good">Special chars</span> : null}
            {!features.isAscii ? <span className="cc-signal-pill good">Non-ASCII (international)</span> : null}
            {features.suspiciousKeywordCount >= 2 ? <span className="cc-signal-pill bad">Multiple sus. keywords ({features.suspiciousKeywordCount})</span> : null}
          </div>
        </div>
      </div>

      {/* ── Feature breakdown ────────────────────────────────── */}
      <div className="cc-features-section">
        <div className="cc-features-title">
          <span>📊 XGBoost Feature Breakdown</span>
          <span className="cc-features-count">{FEATURE_ORDER.length} features</span>
        </div>
        <div className="cc-features-grid">
          {FEATURE_ORDER.map((key) => (
            <FeatureRow key={key} featureKey={key} value={features[key]} />
          ))}
        </div>
      </div>

      {/* ── No-URL warning ───────────────────────────────────── */}
      {!features.hasUrl && (
        <div className="cc-warning-box">
          ⚠ No LinkedIn URL on record. In the dataset, 100% of confirmed scam companies have no associated URL — this is the strongest single fraud signal.
        </div>
      )}
    </div>
  );
}

function SearchResultRow({ company, onSelect }) {
  const col = RISK_COLOR[company.riskLevel] || RISK_COLOR.Minimal;
  const isFake = company.label === 1;
  return (
    <button className="cc-search-row" onClick={() => onSelect(company)}>
      <div className="cc-search-row-left">
        <span className="cc-search-name">{company.companyName}</span>
        {company.url && <span className="cc-search-url">{company.url}</span>}
      </div>
      <div className="cc-search-row-right">
        {isFake
          ? <span className="verdict-badge fake" style={{ fontSize: "9px" }}>⚠ FRAUD</span>
          : <span className="verdict-badge legit" style={{ fontSize: "9px" }}>✓ LEGIT</span>
        }
        <span className="cc-risk-pill" style={{ color: col.text, background: col.bg, border: `1px solid ${col.border}` }}>
          {company.riskLevel}
        </span>
      </div>
    </button>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function CompanyChecker() {
  const [query, setQuery]         = useState("");
  const [url, setUrl]             = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [analysis, setAnalysis]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  function reset() {
    setSearchResults([]);
    setAnalysis(null);
    setError(null);
  }

  // Search by name → show dataset matches list (if any) OR go straight to analysis
  async function handleSearch(e) {
    e.preventDefault();
    reset();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await searchCompany(query);
      const sorted = (res.results || []).sort((a, b) => b.fraudScore - a.fraudScore);
      if (sorted.length === 0) {
        // Not in dataset — skip the list and go straight to live analysis
        const data = await analyzeCompany({ name: query.trim(), url: url.trim() });
        setAnalysis(data);
      } else {
        setSearchResults(sorted);
      }
    } catch (err) {
      // searchCompany failed for some reason — fall back to live analysis
      try {
        const data = await analyzeCompany({ name: query.trim(), url: url.trim() });
        setAnalysis(data);
      } catch (err2) {
        setError(err2.message);
      }
    } finally {
      setLoading(false);
    }
  }

  // Analyse button — always calls /api/company/analyze which never 404s
  async function handleAnalyze(e) {
    e.preventDefault();
    reset();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await analyzeCompany({ name: query.trim(), url: url.trim() });
      setAnalysis(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Clicking a search result row → full analysis for that entry
  async function selectFromSearch(company) {
    setQuery(company.companyName);
    setUrl(company.url || "");
    setSearchResults([]);
    setError(null);
    setLoading(true);
    try {
      const data = await analyzeCompany({ name: company.companyName, url: company.url || "" });
      setAnalysis(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const fakeCount  = searchResults.filter(r => r.label === 1).length;
  const legitCount = searchResults.filter(r => r.label === 0).length;

  return (
    <div className="panel company-checker">
      <div className="panel-title">🔍 Company Checker</div>
      <p className="panel-sub">
        Analyse any company using the XGBoost feature pipeline. Search the dataset of 3,023 companies or compute live features for any unknown name.
      </p>

      {/* ── Search form ─────────────────────────────────────── */}
      <form className="cc-main-form" onSubmit={handleSearch}>
        <div className="cc-form-row">
          <div className="field">
            <label>Company name</label>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. Apex Academic Proofreaders"
              autoComplete="off"
            />
          </div>
          <button className="btn-primary cc-search-btn" type="submit" disabled={loading}>
            {loading ? "…" : "Search"}
          </button>
        </div>
        <div className="cc-form-row">
          <div className="field">
            <label>LinkedIn URL <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>(optional — improves analysis)</span></label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://www.linkedin.com/company/1395"
              autoComplete="off"
            />
          </div>
          <button
            className="btn-ghost cc-analyze-btn"
            type="button"
            disabled={loading || !query.trim()}
            onClick={handleAnalyze}
          >
            {loading ? "…" : "Analyse"}
          </button>
        </div>
      </form>

      {/* ── Error ───────────────────────────────────────────── */}
      {error && <div className="company-error"><strong>{error}</strong></div>}

      {/* ── Search results list ──────────────────────────────── */}
      {searchResults.length > 0 && !analysis && (
        <div className="cc-search-results-wrap">
          <div className="cc-results-header">
            <span>{searchResults.length} match{searchResults.length !== 1 ? "es" : ""} — click to analyse</span>
            <div className="cc-results-counts">
              {fakeCount  > 0 && <span className="cc-count fake">{fakeCount} fraud</span>}
              {legitCount > 0 && <span className="cc-count legit">{legitCount} legit</span>}
            </div>
          </div>
          <div className="cc-search-list">
            {searchResults.map((c, i) => (
              <SearchResultRow key={i} company={c} onSelect={selectFromSearch} />
            ))}
          </div>
        </div>
      )}

      {/* ── Full analysis panel ──────────────────────────────── */}
      {analysis && <AnalysisPanel data={analysis} />}
    </div>
  );
}
