/**
 * In-app self-test entry (T7.5a). A normal launch only pays for one `selftest_config` call; the flow itself
 * (./run.ts) is loaded and run only when the app was started with `PHYLLO_SELFTEST=1` (see `scripts/selftest.sh`).
 */
import { invoke } from "@tauri-apps/api/core";
import type { AppStores } from "../state";
import type { SelftestConfig } from "./run";

export type { SelftestConfig } from "./run";

/** Runs the self-test when Rust says it's enabled, then quits the app. Desktop main window only. */
export async function runSelftestIfEnabled(stores: AppStores): Promise<void> {
  if (stores.native.kind !== "tauri") return;
  let config: SelftestConfig;
  try {
    config = await invoke<SelftestConfig>("selftest_config");
  } catch {
    return;
  }
  if (!config.enabled) return;
  let code = 0;
  try {
    const { runSelftest } = await import("./run");
    const report = await runSelftest(stores, config);
    console.info(`[phyllo selftest]\n${report.summary}`);
  } catch (error) {
    code = 1;
    // The report could not be finished; leave whatever evidence we have.
    const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
    await invoke("selftest_write_report", {
      json: JSON.stringify({ version: 1, ok: false, complete: false, fatal: message, steps: [], summary: `FATAL ${message}` }),
    }).catch(() => undefined);
  }
  await invoke("selftest_exit", { code }).catch(() => undefined);
}
