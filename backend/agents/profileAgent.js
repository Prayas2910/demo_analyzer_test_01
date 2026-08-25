const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const natural = require("natural");

const PROJECT_ROOT = path.join(__dirname, "..");
const PY_PREDICT = path.join(PROJECT_ROOT, "ml", "predict.py");
const VENV_PYTHON = path.join(PROJECT_ROOT, "ml", ".venv", "bin", "python");
const PYTHON_EXEC = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : "python3";
const tokenizer = new natural.WordTokenizer();
const TfIdf = natural.TfIdf;

/**
 * Run the trained model (ml/predict.py) on a feature vector.
 */
function runModel(features) {
  return new Promise((resolve, reject) => {
    const py = spawn(PYTHON_EXEC, [PY_PREDICT]);
    let stdout = "";
    let stderr = "";
    py.stdout.on("data", (d) => (stdout += d.toString()));
    py.stderr.on("data", (d) => (stderr += d.toString()));
    py.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || `predict.py exited ${code}`));
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`Bad JSON from predict.py: ${stdout}`));
      }
    });
    py.stdin.write(JSON.stringify(features));
    py.stdin.end();
  });
}

/**
 * Cheap heuristic GPT/template-generated text detector.
 * Real GPT-detection (e.g. GPTZero-style) needs a trained classifier or an LLM
 * call; here we score a handful of well-known surface signals so the agent is
 * still meaningful without an external API key:
 *  - very low sentence-length variance (LLM text tends to be uniform)
 *  - stuffed with generic corporate buzzwords
 *  - unusually high lexical diversity for the length (polished, edited prose)
 */
function gptLikelihoodHeuristic(aboutText) {
  if (!aboutText || aboutText.trim().length < 40) {
    return { score: 0, reasons: ["About section too short to assess"] };
  }
  const sentences = aboutText.split(/(?<=[.!?])\s+/).filter((s) => s.length > 3);
  const lengths = sentences.map((s) => s.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
  const variance =
    lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / (lengths.length || 1);
  const stdDev = Math.sqrt(variance);
  const uniformityScore = mean > 0 ? Math.max(0, 1 - stdDev / mean) : 0; // 0..1, higher = more uniform

  const buzzwords = [
    "synergy", "leverage", "passionate", "results-driven", "dynamic",
    "proven track record", "detail-oriented", "team player", "self-starter",
    "thought leader", "value-added", "cutting-edge", "innovative solutions",
    "strategic vision", "seamlessly", "robust", "holistic",
  ];
  const lower = aboutText.toLowerCase();
  const buzzHits = buzzwords.filter((b) => lower.includes(b)).length;
  const buzzScore = Math.min(1, buzzHits / 6);

  const words = tokenizer.tokenize(aboutText.toLowerCase());
  const uniqueRatio = words.length ? new Set(words).size / words.length : 0;
  const diversityScore = words.length > 30 ? Math.min(1, uniqueRatio * 1.3) : 0.3;

  const score = Number(
    (uniformityScore * 0.45 + buzzScore * 0.35 + diversityScore * 0.2).toFixed(3)
  );

  const reasons = [];
  if (uniformityScore > 0.6) reasons.push("Sentence lengths are unusually uniform");
  if (buzzHits >= 3) reasons.push(`Heavy use of generic corporate buzzwords (${buzzHits} found)`);
  if (diversityScore > 0.8) reasons.push("Very high lexical diversity for the text length");
  if (!reasons.length) reasons.push("No strong template/generated-text signals found");

  return { score, reasons, buzzwordHits: buzzHits, sentenceCount: sentences.length };
}

/**
 * BERT-similarity is normally: embed the About text with a sentence-transformer
 * and compare against a bank of known-fake / known-template profile embeddings.
 * We don't ship a BERT model over the wire here, so we approximate the same
 * *idea* with TF-IDF cosine similarity against a small set of known scam/template
 * phrasings, which is a legitimate lightweight stand-in and can be swapped for a
 * real sentence-transformer call (e.g. via a Python microservice) without
 * changing this agent's interface.
 */
const TEMPLATE_BANK = [
  "I am a Human Resource professional with broad industry experience in all aspects of recruitment",
  "Results-driven professional with a proven track record of success passionate about innovative solutions",
  "Dynamic self-starter and team player leveraging synergy to deliver value-added results",
  "Chief Scientific Recruitment Consultant with 20 years experience Sourcing Headhunting Search Selection",
];

function bertSimilarityApprox(aboutText) {
  if (!aboutText || aboutText.trim().length < 20) {
    return { maxSimilarity: 0, matchedTemplate: null };
  }
  const tfidf = new TfIdf();
  TEMPLATE_BANK.forEach((t) => tfidf.addDocument(t));
  tfidf.addDocument(aboutText);
  const targetIdx = TEMPLATE_BANK.length;

  const terms = new Set();
  tfidf.listTerms(targetIdx).forEach((t) => terms.add(t.term));

  let best = 0;
  let bestIdx = -1;
  for (let i = 0; i < TEMPLATE_BANK.length; i++) {
    const vecA = {};
    const vecB = {};
    tfidf.listTerms(i).forEach((t) => (vecA[t.term] = t.tfidf));
    tfidf.listTerms(targetIdx).forEach((t) => (vecB[t.term] = t.tfidf));
    const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
    let dot = 0, magA = 0, magB = 0;
    keys.forEach((k) => {
      const a = vecA[k] || 0;
      const b = vecB[k] || 0;
      dot += a * b;
      magA += a * a;
      magB += b * b;
    });
    const sim = magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
    if (sim > best) {
      best = sim;
      bestIdx = i;
    }
  }
  return {
    maxSimilarity: Number(best.toFixed(3)),
    matchedTemplate: bestIdx >= 0 ? TEMPLATE_BANK[bestIdx] : null,
  };
}

/**
 * Main entry point for the Profile Agent.
 * @param {object} profile - a row from the dataset (or user-submitted equivalent)
 */
async function runProfileAgent(profile) {
  const features = {
    Connections: profile.Connections || 0,
    Followers: profile.Followers || 0,
    "Number of Experiences": profile["Number of Experiences"] || 0,
    "Number of Educations": profile["Number of Educations"] || 0,
    "Number of Licenses": profile["Number of Licenses"] || 0,
    "Number of Volunteering": profile["Number of Volunteering"] || 0,
    "Number of Skills": profile["Number of Skills"] || 0,
    "Number of Recommendations": profile["Number of Recommendations"] || 0,
    "Number of Honors": profile["Number of Honors"] || 0,
    "Number of Languages": profile["Number of Languages"] || 0,
    "Number of Organizations": profile["Number of Organizations"] || 0,
    "Number of Interests": profile["Number of Interests"] || 0,
    "Number of Activities": profile["Number of Activities"] || 0,
    Total_URLs_Found: profile.Total_URLs_Found || 0,
    Has_Photo: profile.Has_Photo || (profile.Photo === "Yes" ? 1 : 0),
    About_Length: profile.About_Length || (profile.About ? profile.About.length : 0),
  };

  const [modelResult] = await Promise.all([runModel(features)]);
  const gptCheck = gptLikelihoodHeuristic(profile.About || "");
  const bertCheck = bertSimilarityApprox(profile.About || "");

  return {
    agent: "ProfileAgent",
    modelResult,
    gptLikelihood: gptCheck,
    bertTemplateSimilarity: bertCheck,
    completeness: {
      hasAbout: !!(profile.About && profile.About.trim().length > 0),
      experienceCount: features["Number of Experiences"],
      educationCount: features["Number of Educations"],
      skillCount: features["Number of Skills"],
    },
  };
}

module.exports = { runProfileAgent, gptLikelihoodHeuristic, bertSimilarityApprox };
