import React, { useEffect, useRef, useState } from "react";
import ControlPanel from "./components/ControlPanel.jsx";
import PipelineDiagram from "./components/PipelineDiagram.jsx";
import RiskCard from "./components/RiskCard.jsx";
import AgentGrid from "./components/AgentGrid.jsx";
import ExplainabilityPanel from "./components/ExplainabilityPanel.jsx";
import CompanyChecker from "./components/CompanyChecker.jsx";
import { analyze, health } from "./api.js";

const STAGE_DELAY = 380; // ms between simulated pipeline stages

export default function App() {
  const [backendUp, setBackendUp] = useState(null);
  const [stage, setStage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    health()
      .then(() => setBackendUp(true))
      .catch(() => setBackendUp(false));
  }, []);

  function stopStageAnimation() {
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function startStageAnimation() {
    stopStageAnimation();
    setStage(1);
    let s = 1;
    timerRef.current = setInterval(() => {
      s += 1;
      if (s > 5) {
        stopStageAnimation();
        return;
      }
      setStage(s);
    }, STAGE_DELAY);
  }

  async function handleAnalyze(payload) {
    setError(null);
    setResult(null);
    setLoading(true);
    startStageAnimation();
    const minAnimation = new Promise((resolve) => setTimeout(resolve, STAGE_DELAY * 5));

    try {
      const [res] = await Promise.all([analyze(payload), minAnimation]);
      stopStageAnimation();
      setStage(6);
      setResult(res);
    } catch (err) {
      stopStageAnimation();
      setStage(0);
      setError({ message: err.message, hint: err.hint });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">VS</div>
          <div className="brand-name">Veriscan</div>
          <div className="brand-tag">signal review workspace</div>
        </div>
        <div className="status-pill">
          <span className={`status-dot ${backendUp === false ? "off" : ""}`} />
          {backendUp === null ? "connecting…" : backendUp ? "orchestrator online" : "backend unreachable"}
        </div>
      </header>

      <main className="main">
        <div className="hero">
          <div className="hero-copy">
            <div className="eyebrow">Profile authenticity analysis</div>
            <h1>Review a profile with the same care you’d give a real hiring decision.</h1>
            <p>
              Veriscan looks at the details that matter most — the profile story, the organization trail, the visual signals, and the behavior patterns — so you can spot risk without getting lost in noise.
            </p>
            <div className="hero-highlights">
              <span className="hero-chip">Search a known profile</span>
              <span className="hero-chip">Review a random sample</span>
              <span className="hero-chip">Inspect the reasoning</span>
            </div>
          </div>

          <div className="hero-side-card">
            <div className="card-kicker">How the workflow feels</div>
            <h2>Less noise, more signal.</h2>
            <p>Each review moves through a few clear steps so the result feels grounded rather than overwhelming.</p>
            <ul className="hero-list">
              <li><strong>Start simple.</strong> Search a profile or fill in the details yourself.</li>
              <li><strong>Follow the checks.</strong> See the pipeline move from profile to risk.</li>
              <li><strong>Read the why.</strong> Surface the strongest signals behind the score.</li>
            </ul>
          </div>
        </div>

        <div className="workspace">
          <ControlPanel onAnalyze={handleAnalyze} loading={loading} />

          <div>
            <PipelineDiagram stage={stage} />

            {error && (
              <div className="error-box">
                {error.message}
                {error.hint && <div style={{ marginTop: 6, opacity: 0.85 }}>{error.hint}</div>}
              </div>
            )}

            {!result && !loading && !error && (
              <div className="results-grid">
                <div className="panel empty-state">
                  <div className="glyph">◌</div>
                  <p>Choose a profile to review, open a random sample, or enter the details yourself to see a full readiness report here.</p>
                </div>
                <div className="right-col">
                  <CompanyChecker />
                </div>
              </div>
            )}

            {result && (
              <div className="results-grid">
                <RiskCard profile={result.profile} riskAssessment={result.riskAssessment} />
                <div className="right-col">
                  <AgentGrid agents={result.agents} />
                  <ExplainabilityPanel explainability={result.explainability} />
                  <CompanyChecker />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
