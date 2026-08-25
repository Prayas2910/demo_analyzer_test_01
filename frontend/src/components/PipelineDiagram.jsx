import React from "react";

// stage: 0 idle, 1 orchestrator, 2 agents, 3 fusion, 4 risk, 5 explain, 6 done
const STAGE_ORDER = ["orchestrator", "agents", "fusion", "risk", "explain"];

function nodeState(stageIndexOfThisNode, currentStage) {
  if (currentStage === 0) return "idle";
  if (currentStage > stageIndexOfThisNode + 1) return "done";
  if (currentStage === stageIndexOfThisNode + 1) return "active";
  return "idle";
}

export default function PipelineDiagram({ stage }) {
  const orchestratorState = nodeState(0, stage);
  const agentsState = nodeState(1, stage);
  const fusionState = nodeState(2, stage);
  const riskState = nodeState(3, stage);
  const explainState = nodeState(4, stage);

  const connectorClass = (state) =>
    `pipe-connector ${state === "active" || state === "done" ? "done" : ""}`;

  return (
    <div className="pipeline">
      <div className="pipeline-track">
        <Node label={"AI\nOrchestrator"} icon="◆" state={orchestratorState} />
        <div className={connectorClass(orchestratorState)} />

        <div className="pipe-group">
          <div className="pipe-group-label">4 parallel agents</div>
          <div className="pipe-group-nodes">
            <Node label={"Profile"} icon="P" state={agentsState} compact />
            <Node label={"Org"} icon="O" state={agentsState} compact />
            <Node label={"Image"} icon="I" state={agentsState} compact />
            <Node label={"Behaviour"} icon="B" state={agentsState} compact />
          </div>
        </div>

        <div className={connectorClass(agentsState)} />
        <Node label={"Data /\nFeature Fusion"} icon="⋈" state={fusionState} />
        <div className={connectorClass(fusionState)} />
        <Node label={"Risk\nAssessment"} icon="!" state={riskState} />
        <div className={connectorClass(riskState)} />
        <Node label={"Explain-\nability"} icon="?" state={explainState} />
      </div>
    </div>
  );
}

function Node({ label, icon, state, compact }) {
  const cls = `pipe-dot ${state === "active" ? "active pulse" : ""} ${state === "done" ? "done" : ""}`;
  return (
    <div className="pipe-node">
      <div className={cls} style={compact ? { width: 34, height: 34, fontSize: 12 } : {}}>
        {state === "done" ? "✓" : icon}
      </div>
      <div className="pipe-label">
        {label.split("\n").map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}
