import { newId, parseProjectFile, serializeProject } from "@phyllo/model";
import { OPENABLE_EXTENSIONS } from "../../native/types";
import type { AppStores } from "../../state/createAppStores";

/** Open dialog filter for everything Phyllo opens (`.phyllo` projects, `.strudel` code). */
export const OPEN_FILTERS = [{ name: "Phyllo project or Strudel code", extensions: [...OPENABLE_EXTENSIONS] }];

export function isOpenable(path: string): boolean {
  return /\.(phyllo|strudel)$/i.test(path);
}

export function isStrudel(path: string): boolean {
  return /\.strudel$/i.test(path);
}

export function fileStem(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.[^.]+$/, "");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asPaths(picked: string | string[] | null): string[] {
  if (picked === null) return [];
  return (Array.isArray(picked) ? picked : [picked]).filter(isOpenable);
}

/** Native open dialog for one file; null when cancelled or unavailable (the browser has no dialog). */
export async function pickFile(stores: AppStores): Promise<string | null> {
  const picked = await stores.native.openDialog({ title: "Open groove", filters: OPEN_FILTERS });
  return asPaths(picked)[0] ?? null;
}

export async function pickFiles(stores: AppStores): Promise<string[]> {
  return asPaths(await stores.native.openDialog({ title: "Import grooves", filters: OPEN_FILTERS, multiple: true }));
}

/** `.phyllo` opens as is; `.strudel` becomes a new unsaved project (`openProject` imports it). */
export async function openPath(stores: AppStores, path: string): Promise<string | null> {
  const result = await stores.project.getState().openProject(path);
  return result.ok ? null : result.error;
}

export interface ImportOutcome {
  /** Library paths of the imported grooves, in order. */
  imported: string[];
  errors: { path: string; error: string }[];
}

/**
 * Import… (SPEC §6.7): `.phyllo` files are copied into the library under a fresh id (a copy is its own groove);
 * `.strudel` code is imported (`importCode`) and saved into the library, which leaves it as the open project.
 * The caller guards unsaved changes first when `replacesOpenProject(paths)`.
 */
export async function importFiles(stores: AppStores, paths: readonly string[]): Promise<ImportOutcome> {
  const outcome: ImportOutcome = { imported: [], errors: [] };
  const { native } = stores;
  const root = (await native.getPaths().catch(() => null))?.root ?? null;
  for (const path of paths) {
    try {
      if (isStrudel(path)) {
        const code = await native.strudelRead(path);
        const project = stores.project.getState();
        const result = project.importCode(code, { name: fileStem(path) });
        if (!result.ok) throw new Error(result.error);
        const saved = await stores.project.getState().save();
        if (!saved.ok) throw new Error(saved.error);
        outcome.imported.push(saved.path);
        continue;
      }
      // Already in the library folder: nothing to copy.
      if (root !== null && path.startsWith(`${root}/`) && !path.slice(root.length + 1).includes("/")) {
        outcome.imported.push(path);
        continue;
      }
      const parsed = parseProjectFile(await native.projectRead(path));
      if (!parsed.ok) throw new Error(parsed.error);
      const target = await native.projectNewPath(parsed.project.name || fileStem(path));
      await native.projectWrite(target, serializeProject({ ...parsed.project, id: newId("prj_") }));
      outcome.imported.push(target);
    } catch (error) {
      outcome.errors.push({ path, error: message(error) });
    }
  }
  await stores.library.getState().refresh().catch(() => undefined);
  return outcome;
}

/** Importing replaces the open project when any `.strudel` is in the batch, or a single file will be opened. */
export function replacesOpenProject(paths: readonly string[]): boolean {
  return paths.length === 1 || paths.some(isStrudel);
}
