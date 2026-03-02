export type {
  InspectorConfig,
  InspectionResult,
  InspectionContext,
  Inspector,
} from "./types.js";

export { createInspector, DEFAULT_INSPECTOR_CONFIG } from "./inspector.js";
export { checkDeadLoop, checkHighRetry, checkTimeout, checkResourceExhausted } from "./rules.js";
