const crypto = require("crypto");

/**
 * Real, data-backed "pasting pattern" detector: fake-profile mills frequently
 * copy-paste the exact same About text (or experience descriptions) across
 * many accounts. We hash normalized About text for every profile in the
 * dataset once at startup (see utils/loadDataset.js) and, for a given
 * profile, report how many *other* profiles in the dataset share near-identical
 * text. A count > 1 is a strong, explainable signal of a bot/scam-farm profile.
 */

function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function hashText(text) {
  return crypto.createHash("sha256").update(normalizeText(text)).digest("hex");
}

/**
 * @param {object} profile - the profile being analyzed
 * @param {Map<string, string[]>} duplicateIndex - hash -> [Full Name, ...] built once from the dataset
 */
function runBehaviourAgent(profile, duplicateIndex) {
  const aboutText = profile.About || "";
  const activityCount = profile["Number of Activities"] || 0;
  const interestCount = profile["Number of Interests"] || 0;

  let duplicateMatches = [];
  if (aboutText.trim().length > 20 && duplicateIndex) {
    const h = hashText(aboutText);
    const matches = duplicateIndex.get(h) || [];
    duplicateMatches = matches.filter((n) => n !== profile["Full Name"]);
  }

  const pastingPatternDetected = duplicateMatches.length > 0;

  // Low activity + low interests + high connection count is another classic
  // "farmed" profile pattern (bulk-created accounts with padded connections
  // but no real engagement).
  const lowEngagement = activityCount === 0 && interestCount === 0;
  const connections = profile.Connections || 0;
  const suspiciousEngagementGap = lowEngagement && connections > 100;

  const reasons = [];
  if (pastingPatternDetected) {
    reasons.push(
      `Identical/near-identical About text found on ${duplicateMatches.length} other profile(s) in the dataset: ${duplicateMatches.slice(0, 5).join(", ")}`
    );
  }
  if (suspiciousEngagementGap) {
    reasons.push(
      `${connections} connections but zero recorded activities/interests — engagement doesn't match network size`
    );
  }
  if (!reasons.length) reasons.push("No templated-text or engagement-mismatch signals found");

  return {
    agent: "BehaviourAgent",
    pastingPatternDetected,
    duplicateProfileMatches: duplicateMatches,
    activityCount,
    interestCount,
    suspiciousEngagementGap,
    reasons,
  };
}

/**
 * Build the duplicate-text index once from the full dataset (call at server startup).
 */
function buildDuplicateIndex(profiles) {
  const index = new Map();
  for (const p of profiles) {
    if (!p.About || p.About.trim().length < 20) continue;
    const h = hashText(p.About);
    if (!index.has(h)) index.set(h, []);
    index.get(h).push(p["Full Name"]);
  }
  return index;
}

module.exports = { runBehaviourAgent, buildDuplicateIndex, hashText, normalizeText };
