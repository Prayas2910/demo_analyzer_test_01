import React from "react";

const LEVEL_COLOR = {
  Low: "var(--green)",
  Medium: "var(--amber)",
  High: "#f2883a",
  Critical: "var(--red)",
};

export default function RiskGauge({ percent, level, color }) {
  const radius = 78;
  const stroke = 12;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const c = color || LEVEL_COLOR[level] || "var(--cyan)";

  return (
    <div className="gauge-wrap">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke={c}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 90 90)"
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(.4,0,.2,1)" }}
        />
      </svg>
      <div className="gauge-score">
        <div className="num" style={{ color: c }}>
          {percent}
        </div>
        <div className="pct">risk score</div>
      </div>
    </div>
  );
}
