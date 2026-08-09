import { z } from "zod";
import { ValidationError } from "../errors/index.js";

// 03-security-architecture.md §5.3. SimulationContentSchema's outer shape (widgetType/params)
// stays a deliberate placeholder for widget types whose params aren't pinned down yet -- but
// bloch_sphere's is now fully specified per mode (Frontend Milestone 4's build), closing the gap
// the project plan named explicitly ("only free_placement/gate_application have a documented Zod
// params shape today ... extending it per-mode as each mode's real shape becomes known is a small
// backend task"). Matches 08-quantum-machine-learning-course.md's own documented interaction spec
// (mode/startState/availableGates) plus this project's own additions for the two modes the docs
// only describe in prose (sliderLabel for rotation_slider, t1Ms for t1_decay) -- see
// BlochSphere.jsx's own params-shape comment, which this mirrors exactly.
const ExplanationContentSchema = z.object({ text: z.string().min(1) });
const QuestionContentSchema = z.object({}).passthrough(); // actual content lives on the Question row

const StartStateSchema = z.union([z.enum(["0", "1", "+", "-"]), z.tuple([z.number(), z.number()])]);

const BlochSphereParamsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("free_placement"), startState: StartStateSchema.optional() }),
  z.object({
    mode: z.literal("gate_application"),
    startState: StartStateSchema.optional(),
    availableGates: z.array(z.string()).optional(),
  }),
  z.object({
    mode: z.literal("rotation_slider"),
    startState: StartStateSchema.optional(),
    sliderLabel: z.string().optional(),
  }),
  z.object({ mode: z.literal("measurement"), startState: StartStateSchema.optional() }),
  z.object({
    mode: z.literal("t1_decay"),
    startState: StartStateSchema.optional(),
    t1Ms: z.number().positive().optional(),
  }),
  z.object({
    mode: z.literal("t2_dephasing"),
    startState: StartStateSchema.optional(),
    t2Ms: z.number().positive().optional(),
  }),
]);

// Phase 7E.2 -- built with a real params schema from day one, unlike bloch_sphere's own params
// shape, which briefly stayed an unvalidated placeholder before Frontend Milestone 4 closed that
// gap. One flat `gates` array rather than per-gate-type structural validation (e.g. requiring
// CNOT's `qubits` to have exactly 2 entries, single-qubit gates exactly 1): matches
// topology_diagram's own established "explicit author-supplied positions, not a layout/structure
// engine" philosophy -- this widget renders whatever's authored, it doesn't police gate arity.
const GateCircuitDiagramParamsSchema = z.object({
  qubitCount: z.number().int().positive(),
  qubitLabels: z.array(z.string()).optional(),
  gates: z.array(
    z.object({
      type: z.enum(["H", "X", "Y", "Z", "CNOT", "M"]),
      step: z.number().int().nonnegative(),
      qubits: z.array(z.number().int().nonnegative()).min(1).max(2),
    })
  ),
  caption: z.string().optional(),
});

// Keyed by widgetType, same convention as CONTENT_SCHEMAS_BY_TYPE below -- widget types not listed
// here (amplitude_bar_chart, topology_diagram, quadrant_selector, basis_encoder) still fall back
// to the generic params-is-an-object placeholder, tightened the same way once their own shapes are
// pinned down.
const SIMULATION_PARAMS_SCHEMAS_BY_WIDGET_TYPE = {
  bloch_sphere: BlochSphereParamsSchema,
  gate_circuit_diagram: GateCircuitDiagramParamsSchema,
};

const SimulationContentSchema = z
  .object({
    widgetType: z.enum([
      "bloch_sphere",
      "amplitude_bar_chart",
      "topology_diagram",
      "quadrant_selector",
      "basis_encoder",
      "gate_circuit_diagram",
    ]),
    params: z.record(z.unknown()),
  })
  .superRefine((content, ctx) => {
    const paramsSchema = SIMULATION_PARAMS_SCHEMAS_BY_WIDGET_TYPE[content.widgetType];
    if (!paramsSchema) return;
    const result = paramsSchema.safeParse(content.params);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ ...issue, path: ["params", ...issue.path] });
      }
    }
  });

const CONTENT_SCHEMAS_BY_TYPE = {
  explanation: ExplanationContentSchema,
  question: QuestionContentSchema,
  simulation: SimulationContentSchema,
};

// Runs in the controller, not as generic validateBody middleware -- the correct schema depends on
// the sibling `type` field, which a single declarative schema can't branch on
// (03-security-architecture.md §5.3).
export function validateScreenContent(type, content) {
  const schema = CONTENT_SCHEMAS_BY_TYPE[type];
  if (!schema) throw new ValidationError(`Unknown screen type: ${type}`, "type");

  const result = schema.safeParse(content);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new ValidationError(firstIssue.message, `content.${firstIssue.path.join(".")}`);
  }
  return result.data;
}

export const CreateScreenSchema = z.object({
  type: z.enum(["explanation", "question", "simulation"]),
  content: z.unknown(),
});

export const UpdateScreenSchema = CreateScreenSchema.partial();
