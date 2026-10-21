// Mini-notation ↔ step grid, Euclid rhythms, velocity lanes and pattern visualisation data (SPEC §4.3, T1.3).
export { bjorklund, euclidSteps } from "./bjorklund";
export { compressTokens, euclidToken, rowToMini, rowsToMini } from "./grid";
export { miniToRows, UNFIT_REASON } from "./parse";
export type { GridParseFailure, MiniToRowsOptions, MiniToRowsResult } from "./parse";
export { formatGain, gainPatternToVelocities, velocitiesToGainPattern } from "./velocity";
export { chordSymbolPitches, clipViz, previewRows } from "./viz";
export type { ClipViz, VizTrack } from "./viz";
