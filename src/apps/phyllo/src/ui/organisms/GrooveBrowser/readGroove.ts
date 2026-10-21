import { parseProjectFile } from "@phyllo/model";
import type { GrooveSummary, Project } from "@phyllo/model";
import type { NativeApi } from "../../../native/api";

/** Reads and validates a groove's `.phyllo` file for auditioning; rejects with a readable message when it can't. */
export async function readGroove(native: NativeApi, groove: GrooveSummary): Promise<Project> {
  const parsed = parseProjectFile(await native.projectRead(groove.path));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.project;
}

/** Where an audition starts: the first section (1-based bar), or wherever the transport is when the groove has none. */
export function firstSectionBar(project: Project): number | undefined {
  return project.sections[0]?.startBar;
}
