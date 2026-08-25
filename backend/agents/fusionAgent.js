/**
 * Data Fusion + Feature Fusion Agent.
 * Combines the four agents' raw outputs into one normalized 0..1 risk
 * contribution per signal, with explicit weights (tunable). This is the
 * "Data Fusion" -> "Feature Fusion Agent" step in the architecture diagram.
 */

const WEIGHTS = {
  modelFakeProbability: 0.40,   // ML model output (Profile Agent)
  gptLikelihood: 0.10,          // heuristic template/AI-text score (Profile Agent)
  bertTemplateSimilarity: 0.10, // template-bank similarity (Profile Agent)
  pastingPattern: 0.20,         // duplicate-text detection (Behaviour Agent)
  engagementGap: 0.05,          // connections/activity mismatch (Behaviour Agent)
  orgRisk: 0.10,                // domain/SSL/safe-browsing red flags (Organization Agent)
  imageRisk: 0.05,              // missing photo / image anomalies (Image Agent)
};

function fuseSignals({ profileResult, orgResult, imageResult, behaviourResult }) {
  const signals = {};

  signals.modelFakeProbability = profileResult?.modelResult?.fake_probability ?? 0;
  signals.gptLikelihood = profileResult?.gptLikelihood?.score ?? 0;
  signals.bertTemplateSimilarity = profileResult?.bertTemplateSimilarity?.maxSimilarity ?? 0;

  signals.pastingPattern = behaviourResult?.pastingPatternDetected ? 1 : 0;
  signals.engagementGap = behaviourResult?.suspiciousEngagementGap ? 1 : 0;

  let orgRisk = 0;
  if (orgResult && !orgResult.skipped) {
    if (orgResult.dns && orgResult.dns.resolved === false) orgRisk += 0.4;
    if (orgResult.ssl && orgResult.ssl.valid === false) orgRisk += 0.3;
    if (orgResult.whois && orgResult.whois.found === false) orgRisk += 0.15;
    if (orgResult.safeBrowsing && orgResult.safeBrowsing.threatsFound) orgRisk = 1;
    orgRisk = Math.min(1, orgRisk);
  }
  signals.orgRisk = orgRisk;

  let imageRisk = 0;
  if (imageResult && !imageResult.hasPhotoFlag) imageRisk += 0.5;
  if (imageResult && imageResult.imageAnalyzed && imageResult.imageMeta && imageResult.imageMeta.reachable === false) {
    imageRisk += 0.5;
  }
  signals.imageRisk = Math.min(1, imageRisk);

  let fusedScore = 0;
  for (const key of Object.keys(WEIGHTS)) {
    fusedScore += (signals[key] || 0) * WEIGHTS[key];
  }
  fusedScore = Math.min(1, Math.max(0, fusedScore));

  return {
    agent: "FeatureFusionAgent",
    signals,
    weights: WEIGHTS,
    fusedRiskScore: Number(fusedScore.toFixed(4)),
  };
}

module.exports = { fuseSignals, WEIGHTS };
