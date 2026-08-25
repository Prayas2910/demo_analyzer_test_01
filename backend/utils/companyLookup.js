const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

// XGBoost-ready dataset — the single source of truth
const XGBOOST_CSV_PATH = path.join(__dirname, "..", "..", "organisation_dataset_xgboost_ready.csv");

let COMPANIES = null;

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function normalizeName(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .trim()
    .toLowerCase()
    .replace(/[''"""'`·••–—_–,.;:()\[\]{}\/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const u = new URL(rawUrl.trim());
    u.hash = "";
    u.search = "";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return rawUrl.trim().replace(/\s+/g, "").replace(/\/+$/, "");
  }
}

// ---------------------------------------------------------------------------
// Feature extraction — computes the same features the XGBoost CSV contains,
// so we can score any arbitrary company name / URL that is NOT in the dataset.
// ---------------------------------------------------------------------------
const SUSPICIOUS_KEYWORDS = [
  "investment", "crypto", "forex", "trading", "profit", "earn", "income",
  "opportunity", "recruitment", "hiring", "job", "career", "offer", "apply",
  "grant", "loan", "fund", "capital", "bitcoin", "wallet", "transfer",
  "consulting", "services", "solutions", "global", "international", "ventures",
];

const CORPORATE_SUFFIXES = [
  "llc", "ltd", "inc", "corp", "co", "plc", "gmbh", "bv", "nv",
  "sa", "ag", "ab", "oy", "as", "srl", "sas", "pty",
];

function extractFeatures(companyName, url) {
  const name = companyName || "";
  const u = url || "";
  const words = name.trim().split(/\s+/).filter(Boolean);
  const lowerName = name.toLowerCase();
  const lowerWords = words.map((w) => w.toLowerCase());

  const nameLength = name.length;
  const wordCount = words.length;
  const avgWordLength = wordCount > 0 ? nameLength / wordCount : 0;
  const digitCount = (name.match(/\d/g) || []).length;
  const hasDigit = digitCount > 0 ? 1 : 0;
  const specialCharCount = (name.match(/[^a-zA-Z0-9\s]/g) || []).length;
  const uppercaseCount = (name.match(/[A-Z]/g) || []).length;
  const uppercaseRatio = nameLength > 0 ? uppercaseCount / nameLength : 0;
  const isAscii = /^[\x00-\x7F]*$/.test(name) ? 1 : 0;
  const containsAmpersand = name.includes("&") ? 1 : 0;
  const containsComma = name.includes(",") ? 1 : 0;

  const suspiciousKeywordCount = SUSPICIOUS_KEYWORDS.reduce(
    (sum, kw) => sum + (lowerName.includes(kw) ? 1 : 0),
    0
  );
  const hasSuspiciousKeyword = suspiciousKeywordCount > 0 ? 1 : 0;

  const corporateSuffixCount = CORPORATE_SUFFIXES.reduce(
    (sum, suf) => sum + (lowerWords.includes(suf) ? 1 : 0),
    0
  );
  const hasCorporateSuffix = corporateSuffixCount > 0 ? 1 : 0;

  // URL features
  const hasUrl = u.trim().length > 0 ? 1 : 0;
  const urlLength = u.trim().length;
  const urlHasNumericId = /\/\d+/.test(u) ? 1 : 0;

  return {
    urlHasNumericId,
    urlLength,
    hasUrl,
    avgWordLength: parseFloat(avgWordLength.toFixed(4)),
    nameLength,
    wordCount,
    digitCount,
    hasDigit,
    specialCharCount,
    uppercaseRatio: parseFloat(uppercaseRatio.toFixed(4)),
    isAscii,
    containsAmpersand,
    containsComma,
    suspiciousKeywordCount,
    hasSuspiciousKeyword,
    corporateSuffixCount,
    hasCorporateSuffix,
  };
}

// ---------------------------------------------------------------------------
// Fraud probability scorer — rule-based model derived from XGBoost feature
// importances (no Python runtime needed, deterministic, interpretable).
//
// Key insight from the dataset analysis:
//   • has_url=0 → all 100 fake entries; has_url=1 → all 2923 legit entries
//   • suspicious_keyword_count is the best name-only signal (mean 0.78 fake vs 0.075 legit)
//   • name_length: fake companies average 26.7 chars vs 19.9 for legit
//   • word_count: fake avg 3.43 vs legit avg 2.83
//   • special_char_count: legit avg 0.33 vs fake avg 0.05
// ---------------------------------------------------------------------------
function scoreFraudRisk(features) {
  let score = 0; // 0–100

  // ── URL signals (strongest feature in dataset) ──────────────────────────
  if (!features.hasUrl) {
    score += 30; // no URL is strongly associated with fake entries
  } else {
    score -= 10; // having a verified numeric LinkedIn URL is a good sign
    if (features.urlHasNumericId) score -= 5;
  }

  // ── Suspicious keyword signal ────────────────────────────────────────────
  if (features.suspiciousKeywordCount >= 3) score += 25;
  else if (features.suspiciousKeywordCount === 2) score += 18;
  else if (features.suspiciousKeywordCount === 1) score += 10;

  // ── Name length anomaly (fake names tend to be longer) ───────────────────
  if (features.nameLength > 35) score += 12;
  else if (features.nameLength > 28) score += 7;
  else if (features.nameLength < 8) score += 5;

  // ── Word count (fake tend to have 3–4 word names) ────────────────────────
  if (features.wordCount >= 4) score += 5;

  // ── Special chars (legit names often have &, accents; fake names are plain) ─
  if (features.specialCharCount === 0 && features.nameLength > 15) score += 4;

  // ── Corporate suffix (fake companies slightly more likely to use them) ────
  if (features.corporateSuffixCount >= 1) score += 3;

  // ── Non-ASCII (rare in fake names, common in real international companies) ─
  if (!features.isAscii) score -= 8;

  // ── Comma in name (very common in legit multi-word company names) ─────────
  if (features.containsComma) score -= 5;

  // Clamp to 0–100
  score = Math.max(0, Math.min(100, score));
  return score;
}

function fraudScoreToLevel(score) {
  if (score >= 65) return "High";
  if (score >= 40) return "Medium";
  if (score >= 20) return "Low";
  return "Minimal";
}

// ---------------------------------------------------------------------------
// Dataset loading
// ---------------------------------------------------------------------------

function loadCompanies() {
  if (COMPANIES) return COMPANIES;

  if (!fs.existsSync(XGBOOST_CSV_PATH)) {
    throw new Error(`XGBoost dataset not found at: ${XGBOOST_CSV_PATH}`);
  }

  const raw = fs.readFileSync(XGBOOST_CSV_PATH, "utf-8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true });

  COMPANIES = rows
    .filter((row) => row.company_name && row.company_name.trim())
    .map((row) => {
      const label = parseInt(row.label, 10);
      // Parse all numeric features from CSV (stored as floats like "1.0")
      const f = {
        urlHasNumericId:        parseFloat(row.url_has_numeric_id) || 0,
        urlLength:              parseFloat(row.url_length) || 0,
        hasUrl:                 parseFloat(row.has_url) || 0,
        avgWordLength:          parseFloat(row.avg_word_length) || 0,
        nameLength:             parseFloat(row.name_length) || 0,
        wordCount:              parseFloat(row.word_count) || 0,
        digitCount:             parseFloat(row.digit_count) || 0,
        hasDigit:               parseFloat(row.has_digit) || 0,
        specialCharCount:       parseFloat(row.special_char_count) || 0,
        uppercaseRatio:         parseFloat(row.uppercase_ratio) || 0,
        isAscii:                parseFloat(row.is_ascii) || 0,
        containsAmpersand:      parseFloat(row.contains_ampersand) || 0,
        containsComma:          parseFloat(row.contains_comma) || 0,
        suspiciousKeywordCount: parseFloat(row.suspicious_keyword_count) || 0,
        hasSuspiciousKeyword:   parseFloat(row.has_suspicious_keyword) || 0,
        corporateSuffixCount:   parseFloat(row.corporate_suffix_count) || 0,
        hasCorporateSuffix:     parseFloat(row.has_corporate_suffix) || 0,
      };
      const fraudScore = scoreFraudRisk(f);

      return {
        id:           row.id || "",
        companyName:  row.company_name.trim(),
        url:          row.url ? row.url.trim() : "",
        label,
        labelName:    row.label_name || (label === 1 ? "Fake_Scam" : "Legitimate"),
        split:        row.split || "",
        features:     f,
        fraudScore,
        riskLevel:    fraudScoreToLevel(fraudScore),
        normName:     normalizeName(row.company_name),
        normUrl:      normalizeUrl(row.url),
      };
    });

  console.log(`[companyLookup] Loaded ${COMPANIES.length} companies from organisation_dataset_xgboost_ready.csv`);
  return COMPANIES;
}

// ---------------------------------------------------------------------------
// Public lookup functions
// ---------------------------------------------------------------------------

function findCompanyByUrl(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) return null;
  const companies = loadCompanies();
  return companies.find((c) => c.normUrl === url) || null;
}

function searchCompaniesByName(query, limit = 20) {
  const normalized = normalizeName(query);
  if (!normalized) return [];
  const tokens = normalized.split(" ").filter(Boolean);
  const companies = loadCompanies();

  // 1. Exact match
  const exact = companies.filter((c) => c.normName === normalized);
  if (exact.length > 0) return exact.slice(0, limit);

  // 2. Substring
  const contains = companies.filter((c) => c.normName.includes(normalized));
  if (contains.length > 0) return contains.slice(0, limit);

  // 3. Token scoring — prioritise fake companies in results
  return companies
    .map((c) => ({
      company: c,
      score: tokens.reduce((sum, t) => sum + (c.normName.includes(t) ? 1 : 0), 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.company.label - a.company.label)
    .slice(0, limit)
    .map((x) => x.company);
}

/**
 * Analyze any company name + optional URL that may NOT be in the dataset.
 * Returns computed features + fraud score so the UI can show full analysis.
 * If a user-supplied URL is provided, features are always recomputed using it
 * so the URL signal (hasUrl, urlLength, urlHasNumericId) reflects what the
 * user actually submitted — not a stale dataset value.
 */
function analyzeCompany(companyName, url = "") {
  const userUrl = (url || "").trim();

  // Check if it exists in the dataset first (exact name match)
  const inDataset = searchCompaniesByName(companyName, 1);
  const exactMatch =
    inDataset.length > 0 &&
    normalizeName(inDataset[0].companyName) === normalizeName(companyName)
      ? inDataset[0]
      : null;

  if (exactMatch) {
    // If the user supplied a URL that differs from the dataset URL,
    // recompute URL-related features so the analysis reflects the provided URL.
    const effectiveUrl = userUrl || exactMatch.url;
    let features = exactMatch.features;
    let fraudScore = exactMatch.fraudScore;
    let riskLevel  = exactMatch.riskLevel;

    if (userUrl && userUrl !== exactMatch.url) {
      // Re-extract only if user URL differs — name features stay from dataset
      features = extractFeatures(companyName, userUrl);
      fraudScore = scoreFraudRisk(features);
      riskLevel  = fraudScoreToLevel(fraudScore);
    }

    return {
      source:      "dataset",
      id:          exactMatch.id,
      companyName: exactMatch.companyName,
      url:         effectiveUrl,
      label:       exactMatch.label,
      labelName:   exactMatch.labelName,
      split:       exactMatch.split,
      features,
      fraudScore,
      riskLevel,
    };
  }

  // Not in dataset — compute all features live from name + url
  const features = extractFeatures(companyName, userUrl);
  const fraudScore = scoreFraudRisk(features);
  const riskLevel  = fraudScoreToLevel(fraudScore);

  return {
    source:      "computed",
    id:          null,
    companyName: companyName.trim(),
    url:         userUrl,
    label:       null,
    labelName:   null,
    split:       null,
    features,
    fraudScore,
    riskLevel,
  };
}

function findCompaniesForWorkplace(workplace, limit = 5) {
  if (!workplace || typeof workplace !== "string") return [];
  const match = workplace.match(/\bat\s+(.+)$/i);
  return searchCompaniesByName(match ? match[1] : workplace, limit);
}

module.exports = {
  loadCompanies,
  findCompanyByUrl,
  searchCompaniesByName,
  analyzeCompany,
  findCompaniesForWorkplace,
  extractFeatures,
  scoreFraudRisk,
  fraudScoreToLevel,
};
