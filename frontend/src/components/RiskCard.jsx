import React from "react";
import RiskGauge from "./RiskGauge.jsx";

const LEVEL_STYLE = {
  Low: { bg: "var(--success-dim)", color: "var(--success)" },
  Medium: { bg: "var(--warning-dim)", color: "var(--warning)" },
  High: { bg: "rgba(210, 153, 34, 0.15)", color: "#d29922" },
  Critical: { bg: "var(--danger-dim)", color: "var(--danger)" },
};

export default function RiskCard({ profile, riskAssessment }) {
  const level = riskAssessment?.riskLevel || "Low";
  const style = LEVEL_STYLE[level] || LEVEL_STYLE.Low;

  return (
    <div className="panel gauge-card">
      <div className="panel-title" style={{ justifyContent: "center" }}>
        Risk Assessment
      </div>
      <RiskGauge percent={riskAssessment?.riskPercent ?? 0} level={level} color={riskAssessment?.color} />
      <span className="risk-badge" style={{ background: style.bg, color: style.color }}>
        {level} risk
      </span>

      <div className="profile-meta">
        <div className="row">
          <span>name</span>
          <span>{profile?.fullName || "—"}</span>
        </div>
        <div className="row">
          <span>workplace</span>
          <span>{(profile?.workplace || "—").slice(0, 34)}</span>
        </div>
        <div className="row">
          <span>location</span>
          <span>{profile?.location || "—"}</span>
        </div>
        <div className="row">
          <span>connections</span>
          <span>{profile?.connections ?? "—"}</span>
        </div>
        <div className="row">
          <span>followers</span>
          <span>{profile?.followers ?? "—"}</span>
        </div>
        <div className="row">
          <span>photo</span>
          <span>{profile?.hasPhoto ? "yes" : "no"}</span>
        </div>
        {profile?.datasetLabel !== null && profile?.datasetLabel !== undefined && (
          <div className="row">
            <span>dataset label</span>
            <span>{profile.datasetLabel} {profile.datasetLabel === 0 ? "(genuine)" : "(fake)"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
