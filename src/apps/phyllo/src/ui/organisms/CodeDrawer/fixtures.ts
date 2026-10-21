// Story and test fixtures for the code drawer (organism-private).
import { createTrack } from "@phyllo/model";
import type { EngineStatus, Project } from "@phyllo/model";
import { createFakeEngine } from "../../../state/fakeEngine";
import type { FakeEngine } from "../../../state/fakeEngine";
import { fixtureProject } from "../../../state/mocks";

/** Code track whose expression the fake engine rejects ("ERROR is not defined"). */
export const BROKEN_CODE = 's("bd*4").gain(ERROR)';

/** The House fixture plus a broken Code track named "Broken". */
export function projectWithBrokenTrack(overrides: Partial<Project> = {}): Project {
  const base = fixtureProject();
  const broken = createTrack("code", { id: "broken", name: "Broken", rawCode: BROKEN_CODE, existing: base.tracks });
  return { ...base, tracks: [...base.tracks, broken], ...overrides };
}

const withColumn = (status: EngineStatus, column: number): EngineStatus =>
  status.error ? { ...status, error: { ...status.error, column } } : status;

/**
 * The fake engine, but its errors also carry a 1-based `column` (the real engine reports one for parse errors;
 * the fake only knows the line).
 */
export function fakeEngineWithErrorColumn(column: number): FakeEngine {
  const engine = createFakeEngine({ ready: true });
  return new Proxy(engine, {
    get(target, prop) {
      if (prop === "status") return withColumn(target.status, column);
      if (prop === "onStatus") {
        return (callback: (status: EngineStatus) => void) => target.onStatus((s) => callback(withColumn(s, column)));
      }
      if (prop === "evaluate") {
        return async (...args: Parameters<FakeEngine["evaluate"]>) => withColumn(await target.evaluate(...args), column);
      }
      return Reflect.get(target, prop, target) as unknown;
    },
  });
}

/** 1-based column of `ERROR` in the broken track's line (`$: s("bd*4").gain(ERROR)`). */
export const BROKEN_COLUMN = `$: ${BROKEN_CODE}`.indexOf("ERROR") + 1;
