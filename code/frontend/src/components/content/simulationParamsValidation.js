// Phase 9 (Milestone 5). screen.validator.js's SIMULATION_PARAMS_SCHEMAS_BY_WIDGET_TYPE only has
// entries for bloch_sphere/gate_circuit_diagram -- the four widget types this milestone adds
// authoring forms for (amplitude_bar_chart, topology_diagram, quadrant_selector, basis_encoder)
// fall through to the backend's z.record(z.unknown()) placeholder, which accepts anything. This
// is a real, deliberate, already-documented backend gap (see screen.validator.js's own comment),
// not something to fix server-side in this phase -- these checks are the only thing standing
// between an author and a screen whose params silently don't match what the widget expects
// (Amp­litudeBarChart.jsx would throw trying to read amplitudes[index] out of bounds, etc.).
//
// Each validator returns an error message string, or null when params look shaped correctly.
// Deliberately shallow (required fields present, paired arrays same length, numeric fields
// actually numeric) -- this is a guardrail against obviously-broken authoring mistakes, not a
// reimplementation of the widget's own runtime logic.
const VALIDATORS_BY_WIDGET_TYPE = {
  amplitude_bar_chart(params) {
    if (!Array.isArray(params.amplitudes) || params.amplitudes.length === 0) {
      return "Add at least one basis state.";
    }
    if (
      params.amplitudes.some(
        (amplitude) => typeof amplitude !== "number" || Number.isNaN(amplitude)
      )
    ) {
      return "Every amplitude must be a number.";
    }
    if (params.labels && params.labels.length !== params.amplitudes.length) {
      return "Labels and amplitudes must have the same number of entries.";
    }
    if (
      params.highlightedIndex !== undefined &&
      (params.highlightedIndex < 0 || params.highlightedIndex >= params.amplitudes.length)
    ) {
      return "Highlighted state must refer to one of the basis states.";
    }
    return null;
  },

  topology_diagram(params) {
    if (!Array.isArray(params.qubits) || params.qubits.length === 0) {
      return "Add at least one qubit.";
    }
    if (params.qubits.some((qubit) => typeof qubit.x !== "number" || typeof qubit.y !== "number")) {
      return "Every qubit needs numeric x/y coordinates.";
    }
    if (!Array.isArray(params.edges)) {
      return "Edges must be a list.";
    }
    const qubitIds = new Set(params.qubits.map((qubit) => qubit.id));
    if (params.edges.some(([a, b]) => !qubitIds.has(a) || !qubitIds.has(b))) {
      return "Every edge must connect two qubits that exist.";
    }
    return null;
  },

  quadrant_selector(params) {
    if (!params.xAxisLabel || !params.yAxisLabel) {
      return "Both axis labels are required.";
    }
    if (
      !Array.isArray(params.xAxisValues) ||
      params.xAxisValues.length !== 2 ||
      params.xAxisValues.some((v) => !v)
    ) {
      return "X axis needs exactly two non-empty values.";
    }
    if (
      !Array.isArray(params.yAxisValues) ||
      params.yAxisValues.length !== 2 ||
      params.yAxisValues.some((v) => !v)
    ) {
      return "Y axis needs exactly two non-empty values.";
    }
    if (!Array.isArray(params.quadrants) || params.quadrants.length !== 4) {
      return "Exactly four quadrants are required.";
    }
    if (params.quadrants.some((quadrant) => !quadrant.label || !quadrant.description)) {
      return "Every quadrant needs a label and a description.";
    }
    return null;
  },

  basis_encoder(params) {
    if (typeof params.qubitCount !== "number" || params.qubitCount < 1) {
      return "Qubit count must be a positive number.";
    }
    if (typeof params.defaultNumber !== "number" || Number.isNaN(params.defaultNumber)) {
      return "Default number must be a number.";
    }
    return null;
  },
};

export function validateSimulationParams(widgetType, params) {
  const validator = VALIDATORS_BY_WIDGET_TYPE[widgetType];
  if (!validator) return null;
  return validator(params ?? {});
}
