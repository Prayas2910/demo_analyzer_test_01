import React from "react";

const ICON_STYLES = {
  Profile: { bg: "var(--purple-dim)", color: "var(--purple)" },
  Organization: { bg: "var(--accent-dim)", color: "var(--accent)" },
  Image: { bg: "var(--warning-dim)", color: "var(--warning)" },
  Behaviour: { bg: "var(--success-dim)", color: "var(--success)" },
};

function Tag({ children, tone }) {
  const styles = {
    live: { background: "var(--success-dim)", color: "var(--success)" },
    proxy: { background: "var(--warning-dim)", color: "var(--warning)" },
    stub: { background: "var(--surface-3)", color: "var(--text-faint)" },
  };
  return (
    <span className="tag" style={styles[tone]}>
      {children}
    </span>
  );
}

export default function AgentGrid({ agents }) {
  const { profileAgent, organizationAgent, imageAgent, behaviourAgent } = agents;

  return (
    <div className="agents-grid">
      {/* Profile Agent */}
      <div className="agent-card">
        <div className="agent-head">
          <div className="agent-icon" style={ICON_STYLES.Profile}>P</div>
          <div className="agent-name">Profile Agent</div>
          <Tag tone="live">trained model</Tag>
        </div>
        <div className="agent-body">
          <div className="kv">
            <span>ML fake probability</span>
            <span>{Math.round((profileAgent?.modelResult?.fake_probability ?? 0) * 100)}%</span>
          </div>
          <div className="kv">
            <span>Predicted class</span>
            <span>{profileAgent?.modelResult?.predicted_class ?? "—"}</span>
          </div>
          <div className="kv">
            <span>GPT-text heuristic</span>
            <span>{profileAgent?.gptLikelihood?.score ?? 0}</span>
          </div>
          <div className="kv">
            <span>Template similarity</span>
            <span>{profileAgent?.bertTemplateSimilarity?.maxSimilarity ?? 0}</span>
          </div>
          <div className="note">Model: RandomForest trained on 3,600 labeled profiles (96%+ accuracy).</div>
        </div>
      </div>

      {/* Organization Agent */}
      <div className="agent-card">
        <div className="agent-head">
          <div className="agent-icon" style={ICON_STYLES.Organization}>O</div>
          <div className="agent-name">Organization Agent</div>
          <Tag tone={organizationAgent?.skipped ? "stub" : "live"}>
            {organizationAgent?.skipped ? "skipped" : "live check"}
          </Tag>
        </div>
        <div className="agent-body">
          {organizationAgent?.skipped ? (
            <div className="note">{organizationAgent.reason}</div>
          ) : (
            <>
              <div className="kv">
                <span>Domain checked</span>
                <span>{organizationAgent?.domain}</span>
              </div>
              <div className="kv">
                <span>DNS resolves</span>
                <span>{String(organizationAgent?.dns?.resolved)}</span>
              </div>
              <div className="kv">
                <span>SSL valid</span>
                <span>{String(organizationAgent?.ssl?.valid)}</span>
              </div>
              <div className="kv">
                <span>WHOIS found</span>
                <span>{String(organizationAgent?.whois?.found)}</span>
              </div>
              <div className="note">
                Domain {organizationAgent?.domainWasGuessed ? "guessed from workplace text" : "provided explicitly"} —
                network checks run for real; sandboxed environments may show timeouts.
              </div>
            </>
          )}
        </div>
      </div>

      {/* Image Agent */}
      <div className="agent-card">
        <div className="agent-head">
          <div className="agent-icon" style={ICON_STYLES.Image}>I</div>
          <div className="agent-name">Image Agent</div>
          <Tag tone="stub">DeepFace/CLIP stub</Tag>
        </div>
        <div className="agent-body">
          <div className="kv">
            <span>Has photo</span>
            <span>{String(imageAgent?.hasPhotoFlag)}</span>
          </div>
          <div className="kv">
            <span>Image analyzed</span>
            <span>{String(imageAgent?.imageAnalyzed)}</span>
          </div>
          <div className="note">
            {imageAgent?.deepFace?.note || "DeepFace/CLIP require a separate model microservice — see agents/imageAgent.js."}
          </div>
        </div>
      </div>

      {/* Behaviour Agent */}
      <div className="agent-card">
        <div className="agent-head">
          <div className="agent-icon" style={ICON_STYLES.Behaviour}>B</div>
          <div className="agent-name">Behaviour Agent</div>
          <Tag tone="live">dataset-backed</Tag>
        </div>
        <div className="agent-body">
          <div className="kv">
            <span>Pasting pattern</span>
            <span>{String(behaviourAgent?.pastingPatternDetected)}</span>
          </div>
          <div className="kv">
            <span>Duplicate matches</span>
            <span>{behaviourAgent?.duplicateProfileMatches?.length ?? 0}</span>
          </div>
          <div className="kv">
            <span>Activity count</span>
            <span>{behaviourAgent?.activityCount ?? 0}</span>
          </div>
          <div className="kv">
            <span>Engagement gap</span>
            <span>{String(behaviourAgent?.suspiciousEngagementGap)}</span>
          </div>
          <div className="note">
            Cross-checks About text against every other profile in the dataset for copy-paste duplication.
          </div>
        </div>
      </div>
    </div>
  );
}
