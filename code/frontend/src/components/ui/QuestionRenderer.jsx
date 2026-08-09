import { Mcq } from "../widgets/Mcq.jsx";
import { Numeric } from "../widgets/Numeric.jsx";
import { DragDrop } from "../widgets/DragDrop.jsx";
import { AmplitudeBarChart } from "../widgets/AmplitudeBarChart.jsx";
import { TopologyDiagram } from "../widgets/TopologyDiagram.jsx";
import { BlochSphere } from "../widgets/BlochSphere.jsx";
import { QuadrantSelector } from "../widgets/QuadrantSelector.jsx";
import { BasisEncoder } from "../widgets/BasisEncoder.jsx";
import { GateCircuitDiagram } from "../widgets/GateCircuitDiagram.jsx";
import "./QuestionRenderer.css";

// Dispatcher only (Frontend Milestone 2) -- routes to a widget by Question.type or
// Screen.content.widgetType. The six real widgets are built in Milestone 4; entries are filled
// in as each one lands, and the placeholder below is what renders for the rest until then.
// quadrant_selector/basis_encoder were left as unbuilt placeholders past Milestone 4 -- both are
// now built (real QML lesson content was hitting the placeholder text in production).
const WIDGET_REGISTRY = {
  mcq: Mcq,
  drag_drop: DragDrop,
  numeric: Numeric,
  bloch_sphere: BlochSphere,
  amplitude_bar_chart: AmplitudeBarChart,
  topology_diagram: TopologyDiagram,
  quadrant_selector: QuadrantSelector,
  basis_encoder: BasisEncoder,
  gate_circuit_diagram: GateCircuitDiagram,
};

export function QuestionRenderer({ type, ...props }) {
  const Widget = WIDGET_REGISTRY[type];

  if (!Widget) {
    return (
      <div className="question-renderer__placeholder">
        Widget &quot;{type}&quot; not yet implemented.
      </div>
    );
  }

  return <Widget {...props} />;
}
