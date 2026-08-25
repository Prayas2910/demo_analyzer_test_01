const express = require("express");
const cors = require("cors");

const { loadDataset, searchProfiles, getProfileByIndex, getRandomProfile, datasetSize } = require("./utils/loadDataset");
const { findCompanyByUrl, searchCompaniesByName, analyzeCompany } = require("./utils/companyLookup");
const { runProfileAgent } = require("./agents/profileAgent");
const { runOrganizationAgent } = require("./agents/organizationAgent");
const { runImageAgent } = require("./agents/imageAgent");
const { runBehaviourAgent, buildDuplicateIndex } = require("./agents/behaviourAgent");
const { fuseSignals } = require("./agents/fusionAgent");
const { assessRisk } = require("./agents/riskAssessment");
const { explain } = require("./agents/explainabilityAgent");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 4000;

// --- Startup: load dataset + build the duplicate-text index once ---
const allProfiles = loadDataset();
const duplicateIndex = buildDuplicateIndex(allProfiles);
console.log(`[startup] duplicate-text index built (${duplicateIndex.size} unique About hashes)`);

// ------------------------------------------------------------------
// AI ORCHESTRATOR AGENT
// Runs the four Data Acquisition & Analysis Agents, then the
// Data Fusion -> Feature Fusion -> Risk Assessment -> Explainability
// chain, exactly matching the architecture diagram.
// ------------------------------------------------------------------
async function runOrchestrator(profile, { domain, imageUrl } = {}) {
  const [profileResult, orgResult, imageResult] = await Promise.all([
    runProfileAgent(profile),
    runOrganizationAgent(domain || null, profile["Workplace"]),
    runImageAgent(profile, imageUrl || null),
  ]);
  const behaviourResult = runBehaviourAgent(profile, duplicateIndex);

  const fusionResult = fuseSignals({ profileResult, orgResult, imageResult, behaviourResult });
  const riskResult = assessRisk(fusionResult.fusedRiskScore);
  const explainabilityResult = explain({ fusionResult, profileResult, orgResult, imageResult, behaviourResult });

  return {
    profile: {
      fullName: profile["Full Name"],
      workplace: profile["Workplace"],
      location: profile["Location"],
      connections: profile["Connections"],
      followers: profile["Followers"],
      hasPhoto: profile["Photo"] === "Yes",
      about: profile["About"],
      datasetLabel: profile["Label"] ?? null,
    },
    agents: {
      profileAgent: profileResult,
      organizationAgent: orgResult,
      imageAgent: imageResult,
      behaviourAgent: behaviourResult,
    },
    dataFusion: fusionResult,
    riskAssessment: riskResult,
    explainability: explainabilityResult,
  };
}

// ------------------------------------------------------------------
// ROUTES
// ------------------------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", datasetSize: datasetSize() });
});

/** GET /api/search?q=name-or-url  -> lightweight matches to pick from */
app.get("/api/search", (req, res) => {
  const results = searchProfiles(req.query.q, 15);
  res.json({ query: req.query.q || "", results });
});

/** GET /api/profile/random -> a random dataset profile (raw row) */
app.get("/api/profile/random", (req, res) => {
  res.json(getRandomProfile());
});

/** GET /api/profile/:index -> a specific dataset profile (raw row) */
app.get("/api/profile/:index", (req, res) => {
  const profile = getProfileByIndex(req.params.index);
  if (!profile) return res.status(404).json({ error: "Profile not found" });
  res.json(profile);
});

app.get("/api/company/search", (req, res) => {
  const name = req.query.name;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Company name query parameter is required" });
  }
  const results = searchCompaniesByName(name, 20);
  // Always return 200 with results array (may be empty — client handles that)
  const clean = results.map(({ normName, normUrl, ...rest }) => rest);
  res.json({ query: name, results: clean });
});

app.post("/api/company/check", (req, res) => {
  const { url, name } = req.body || {};
  if (url) {
    const company = findCompanyByUrl(url);
    // Not found is NOT a 404 — return a computed analysis instead
    if (!company) {
      try {
        // Derive name from URL path for the compute fallback
        const fallbackName = name && name.trim() ? name.trim() : url.trim();
        const result = analyzeCompany(fallbackName, url.trim());
        const { normName, normUrl, ...clean } = result;
        return res.json({ company: clean, foundInDataset: false });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }
    const { normName, normUrl, ...clean } = company;
    return res.json({ company: clean, foundInDataset: true });
  }
  if (name && name.trim()) {
    const results = searchCompaniesByName(name, 20);
    const clean = results.map(({ normName, normUrl, ...rest }) => rest);
    return res.json({ query: name, results: clean });
  }
  return res.status(400).json({ error: "Request body must include url or name" });
});

/**
 * POST /api/company/analyze
 * Body: { name: string, url?: string }
 * ALWAYS returns 200 — either a dataset match or live-computed features.
 * Never 404s.
 */
app.post("/api/company/analyze", (req, res) => {
  const { name, url } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  try {
    const result = analyzeCompany(name.trim(), url ? url.trim() : "");
    const { normName, normUrl, ...clean } = result;
    res.json(clean);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/analyze
 * Body: { mode: "dataset", index: number, domain?, imageUrl? }
 *    or { mode: "manual", profile: {...}, domain?, imageUrl? }
 *    or { mode: "url", url: string, domain?, imageUrl? }  -- url matched against dataset,
 *       falls back to manual entry required (see /api/search first)
 */
app.post("/api/analyze", async (req, res) => {
  try {
    const { mode, index, profile, url, domain, imageUrl } = req.body;
    let targetProfile = null;

    if (mode === "dataset") {
      targetProfile = getProfileByIndex(index);
      if (!targetProfile) return res.status(404).json({ error: "Dataset index not found" });
    } else if (mode === "manual") {
      if (!profile || typeof profile !== "object") {
        return res.status(400).json({ error: "profile object required for manual mode" });
      }
      targetProfile = {
        "Full Name": profile.fullName || "Manual Entry",
        "Workplace": profile.workplace || "",
        "Location": profile.location || "",
        "Connections": Number(profile.connections) || 0,
        "Followers": Number(profile.followers) || 0,
        "Photo": profile.hasPhoto ? "Yes" : "No",
        "About": profile.about || "",
        "Number of Experiences": Number(profile.experiences) || 0,
        "Number of Educations": Number(profile.educations) || 0,
        "Number of Licenses": Number(profile.licenses) || 0,
        "Number of Volunteering": Number(profile.volunteering) || 0,
        "Number of Skills": Number(profile.skills) || 0,
        "Number of Recommendations": Number(profile.recommendations) || 0,
        "Number of Honors": Number(profile.honors) || 0,
        "Number of Languages": Number(profile.languages) || 0,
        "Number of Organizations": Number(profile.organizations) || 0,
        "Number of Interests": Number(profile.interests) || 0,
        "Number of Activities": Number(profile.activities) || 0,
        "Total_URLs_Found": Number(profile.totalUrlsFound) || 0,
        "Has_Photo": profile.hasPhoto ? 1 : 0,
        "About_Length": (profile.about || "").length,
        "Label": null,
      };
    } else if (mode === "url") {
      const matches = searchProfiles(url, 1);
      if (matches.length === 0) {
        return res.status(404).json({
          error: "No matching profile found in the demo dataset for that URL.",
          hint: "This demo has no live scraper — use mode:'manual' to score an arbitrary profile, or mode:'dataset' with an index from /api/search.",
        });
      }
      targetProfile = getProfileByIndex(matches[0].index);
    } else {
      return res.status(400).json({ error: "mode must be 'dataset', 'manual', or 'url'" });
    }

    const result = await runOrchestrator(targetProfile, { domain, imageUrl });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`AI Orchestrator backend listening on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the other process or start this app with a different port, for example:`);
    console.error(`  PORT=${Number(PORT) + 1} node server.js`);
    process.exit(1);
  }
  console.error("Server error:", err);
  process.exit(1);
});
