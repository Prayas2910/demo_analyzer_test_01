const THRESHOLDS = [
  { max: 0.25, level: "Low", color: "#22c55e" },
  { max: 0.55, level: "Medium", color: "#eab308" },
  { max: 0.8, level: "High", color: "#f97316" },
  { max: 1.01, level: "Critical", color: "#ef4444" },
];

function assessRisk(fusedRiskScore) {
  const bucket = THRESHOLDS.find((t) => fusedRiskScore <= t.max);
  return {
    agent: "RiskAssessmentAgent",
    riskScore: fusedRiskScore,
    riskPercent: Math.round(fusedRiskScore * 100),
    riskLevel: bucket.level,
    color: bucket.color,
    thresholds: THRESHOLDS,
  };
}

module.exports = { assessRisk, THRESHOLDS };
