// Matches the real seed content exactly (QML, "Why Quantum, Why Now" > "Two Ways Quantum and ML
// Can Meet"): the lesson's own explanation screen lists all four data/processing combinations in
// prose immediately before this widget -- these fixtures are that same content, structured for
// the widget instead of read as one paragraph. `highlighted` marks the one quadrant the course
// itself is built around (classical data, quantum processing), matching the prose's own "this
// course's primary focus" callout.
export const dataProcessingQuadrantParams = {
  caption:
    "Two axes -- what kind of data, and what kind of device processes it -- give four combinations.",
  xAxisLabel: "Processing device",
  yAxisLabel: "Data",
  xAxisValues: ["Classical", "Quantum"],
  yAxisValues: ["Classical", "Quantum"],
  quadrants: [
    {
      label: "Classical data, classical processing",
      description: "Ordinary machine learning.",
      highlighted: false,
    },
    {
      label: "Classical data, quantum processing",
      description: "Feeding ordinary data into a quantum model -- this course's primary focus.",
      highlighted: true,
    },
    {
      label: "Quantum data, classical processing",
      description: "Analyzing data that came from a quantum sensor or experiment.",
      highlighted: false,
    },
    {
      label: "Quantum data, quantum processing",
      description: "The molecule-simulation case -- the problem is quantum through and through.",
      highlighted: false,
    },
  ],
};
