// Model → Strudel code (SPEC §4.1).
export { generate, LINE_WIDTH, CONTINUATION_INDENT } from "./generate";
export { arrangeEntries, resolveSection, clipsOverlap } from "./arrange";
export type { ArrangeEntry, SectionRange } from "./arrange";
export { formatNumber, formatParamValue, quote } from "./format";
export {
  PARAM_ALIASES,
  PARAM_DEFAULTS,
  canonicalControl,
  controlsSetBy,
  formatCompact,
  isDefaultParam,
  modulatedParams,
  modulationRange,
} from "./params";
export type { ControlName } from "./params";
