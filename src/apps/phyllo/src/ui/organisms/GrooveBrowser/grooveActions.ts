import type { GrooveSummary } from "@phyllo/model";
import type { UseLibrary } from "../../../hooks";
import type { NativeApi } from "../../../native/api";
import { replaceTag, sameTag, unionTags } from "./tags";

export interface Notice {
  tone: "info" | "error";
  text: string;
}

export interface GrooveActionsDeps {
  library: UseLibrary;
  native: NativeApi;
  /** Report a result or problem to the user (status line). */
  notify: (notice: Notice) => void;
  /** The screen's navigation after a groove is opened. */
  onOpenGroove?: (path: string) => void;
}

/** What the dialogs await: an error message, or null on success. */
export type ActionResult = Promise<string | null>;

export interface GrooveActions {
  open: (groove: GrooveSummary) => Promise<void>;
  toggleFavorite: (groove: GrooveSummary) => Promise<void>;
  rename: (groove: GrooveSummary, name: string) => ActionResult;
  duplicate: (groove: GrooveSummary) => Promise<void>;
  reveal: (groove: GrooveSummary) => Promise<void>;
  trash: (targets: GrooveSummary[]) => ActionResult;
  /** One groove: replace its tags. Several: add `tags` to each. */
  saveTags: (targets: GrooveSummary[], tags: string[]) => ActionResult;
  /** Adds one tag to every target. */
  addTag: (targets: GrooveSummary[], tag: string) => ActionResult;
  /** Rename/merge (`to` is a name) or delete (`to` is null) a tag in every file that has it. */
  rewriteTag: (from: string, to: string | null) => ActionResult;
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

/** File operations behind the browser's tiles, rows, menu and dialogs, all through `useLibrary()` and `useNative()`. */
export function createGrooveActions({ library, native, notify, onOpenGroove }: GrooveActionsDeps): GrooveActions {
  const fail = (text: string) => notify({ tone: "error", text });

  /** Runs `op` on each groove in turn (files are rewritten one at a time) and stops at the first failure. */
  async function eachGroove(grooves: readonly GrooveSummary[], op: (groove: GrooveSummary) => Promise<{ ok: boolean; error?: string }>): ActionResult {
    for (const groove of grooves) {
      const result = await op(groove);
      if (!result.ok) return `${groove.name}: ${result.error ?? "couldn't be updated."}`;
    }
    return null;
  }

  return {
    async open(groove) {
      const result = await library.open(groove.path);
      if (result.ok) onOpenGroove?.(groove.path);
      else fail(`Couldn't open ${groove.name}: ${result.error}`);
    },
    async toggleFavorite(groove) {
      const result = await library.toggleFavorite(groove.path);
      if (!result.ok) fail(`Couldn't update ${groove.name}: ${result.error}`);
    },
    async rename(groove, name) {
      const result = await library.rename(groove.path, name);
      return result.ok ? null : result.error;
    },
    async duplicate(groove) {
      const result = await library.duplicate(groove.path);
      if (result.ok) notify({ tone: "info", text: `Duplicated ${groove.name}.` });
      else fail(`Couldn't duplicate ${groove.name}: ${result.error}`);
    },
    async reveal(groove) {
      try {
        await native.revealInFinder(groove.path);
      } catch (caught) {
        fail(`Couldn't show ${groove.name} in Finder: ${messageOf(caught)}`);
      }
    },
    async trash(targets) {
      const error = await eachGroove(targets, (groove) => library.trash(groove.path));
      if (error === null) notify({ tone: "info", text: targets.length === 1 ? `Moved ${targets[0]?.name ?? "the groove"} to the Trash.` : `Moved ${targets.length} grooves to the Trash.` });
      return error;
    },
    async saveTags(targets, tags) {
      const bulk = targets.length > 1;
      return eachGroove(targets, (groove) => library.editTags(groove.path, bulk ? unionTags(groove.tags, tags) : tags));
    },
    async addTag(targets, tag) {
      return eachGroove(targets, (groove) => library.editTags(groove.path, unionTags(groove.tags, [tag])));
    },
    async rewriteTag(from, to) {
      const affected = library.grooves.filter((groove) => groove.tags.some((tag) => sameTag(tag, from)));
      const error = await eachGroove(affected, (groove) => library.editTags(groove.path, replaceTag(groove.tags, from, to)));
      if (error !== null) return error;
      const filters = library.selectedTags.flatMap((tag) => (sameTag(tag, from) ? (to === null ? [] : [to]) : [tag]));
      if (filters.length !== library.selectedTags.length || filters.some((tag, i) => tag !== library.selectedTags[i])) {
        library.setSelectedTags(filters);
      }
      return null;
    },
  };
}
