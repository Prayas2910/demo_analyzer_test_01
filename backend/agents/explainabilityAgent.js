/**
 * Turns the fused signals + individual agent outputs into a ranked,
 * human-readable list of "why this score" explanations for the dashboard.
 */
function explain({ fusionResult, profileResult, orgResult, imageResult, behaviourResult }) {
  const items = [];

  const { signals, weights } = fusionResult;

  const contribution = (key) => (signals[key] || 0) * weights[key];

  const pushIfMeaningful = (key, label, detailFn) => {
    const c = contribution(key);
    if (c > 0.01) {
      items.push({
        signal: key,
        label,
        contribution: Number(c.toFixed(4)),
        detail: detailFn(),
      });
    }
  };

  pushIfMeaningful(
    "modelFakeProbability",
    "ML model flags this profile as likely fake",
    () =>
      `Model predicted class "${profileResult?.modelResult?.predicted_class}" with ${Math.round(
        (profileResult?.modelResult?.fake_probability || 0) * 100
      )}% fake probability. Top drivers: ${topFeatureImportances(profileResult)}`
  );

  pushIfMeaningful(
    "pastingPattern",
    "Copy-pasted / templated profile text detected",
    () => behaviourResult?.reasons?.join("; ") || ""
  );

  pushIfMeaningful(
    "gptLikelihood",
    "About section shows AI-generated / templated-text signals",
    () => profileResult?.gptLikelihood?.reasons?.join("; ") || ""
  );

  pushIfMeaningful(
    "bertTemplateSimilarity",
    "About text closely matches known scam/template phrasing",
    () =>
      profileResult?.bertTemplateSimilarity?.matchedTemplate
        ? `Similarity ${profileResult.bertTemplateSimilarity.maxSimilarity} to: "${profileResult.bertTemplateSimilarity.matchedTemplate.slice(0, 80)}..."`
        : "No strong template match"
  );

  pushIfMeaningful(
    "engagementGap",
    "Connection count doesn't match engagement level",
    () => `${behaviourResult?.activityCount ?? 0} activities / ${behaviourResult?.interestCount ?? 0} interests recorded despite a large network`
  );

  pushIfMeaningful(
    "orgRisk",
    "Employer domain shows verification red flags",
    () => {
      if (!orgResult || orgResult.skipped) return orgResult?.reason || "Organization check skipped";
      const bits = [];
      if (orgResult.dns?.resolved === false) bits.push("domain does not resolve (DNS)");
      if (orgResult.ssl?.valid === false) bits.push("invalid/untrusted SSL certificate");
      if (orgResult.whois?.found === false) bits.push("no WHOIS record found");
      if (orgResult.safeBrowsing?.threatsFound) bits.push("flagged by Google Safe Browsing");
      return bits.join("; ") || "No red flags found";
    }
  );

  pushIfMeaningful(
    "imageRisk",
    "Profile photo missing or unreachable",
    () => (imageResult?.hasPhotoFlag ? "Photo present but image could not be verified" : "No profile photo set")
  );

  items.sort((a, b) => b.contribution - a.contribution);

  return {
    agent: "ExplainabilityAgent",
    topReasons: items,
    summary:
      items.length > 0
        ? `Primary driver: ${items[0].label}`
        : "No significant risk signals detected across any agent",
  };
}

function topFeatureImportances(profileResult) {
  const fi = profileResult?.modelResult?.feature_importances;
  if (!fi) return "n/a";
  return Object.entries(fi)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)
    .join(", ");
}

module.exports = { explain };
