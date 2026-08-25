import React from "react";

export default function ExplainabilityPanel({ explainability }) {
  const items = explainability?.topReasons || [];

  return (
    <div className="panel">
      <div className="panel-title">Why this score</div>
      <p className="panel-sub">{explainability?.summary}</p>

      {items.length === 0 ? (
        <div className="hint-box">No significant risk signals detected across any agent.</div>
      ) : (
        <div className="explain-list">
          {items.map((item, i) => (
            <div key={i} className="explain-item">
              <div className="top-row">
                <span className="label">{item.label}</span>
                <span className="contribution">+{(item.contribution * 100).toFixed(1)} pts</span>
              </div>
              <div className="detail">{item.detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
