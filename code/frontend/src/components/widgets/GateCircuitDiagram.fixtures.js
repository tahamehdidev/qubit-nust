// A Bell-state circuit -- Hadamard on q0, then CNOT(control=q0, target=q1) -- the exact
// two-gate recipe the Algorithms course's own lesson text describes for building a Bell state
// ("Apply a Hadamard to the first qubit, creating superposition, then a CNOT with that first
// qubit as control and the second as target"). Small enough to read at a glance, standard enough
// to be recognizable, and exercises both a single-qubit gate and CNOT in the same fixture.
export const bellStateCircuitParams = {
  caption: "The standard two-gate recipe for a Bell state -- click a gate to see what it does.",
  qubitCount: 2,
  qubitLabels: ["q0", "q1"],
  gates: [
    { type: "H", step: 0, qubits: [0] },
    { type: "CNOT", step: 1, qubits: [0, 1] },
  ],
};

// A slightly larger three-qubit circuit ending in measurement -- exercises a gate on a qubit
// other than 0, and the "M" gate type.
export const threeQubitCircuitParams = {
  caption: "A three-qubit circuit ending in measurement.",
  qubitCount: 3,
  gates: [
    { type: "H", step: 0, qubits: [0] },
    { type: "X", step: 0, qubits: [2] },
    { type: "CNOT", step: 1, qubits: [0, 1] },
    { type: "Z", step: 2, qubits: [1] },
    { type: "M", step: 3, qubits: [0] },
    { type: "M", step: 3, qubits: [1] },
    { type: "M", step: 3, qubits: [2] },
  ],
};
