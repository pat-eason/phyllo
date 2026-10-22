import type { DrumBank, ModifierDef } from "@phyllo/model";
import type { PreviewSound } from "@phyllo/engine";
import type { SoundRef } from "@phyllo/ui";
import { useAppStores, useContextMenuTrigger, useNative } from "../../../hooks";
import type { ContextMenuTrigger } from "../../../hooks";
import { bankMenuEntries, folderMenuEntries, snippetMenuEntries, soundMenuEntries } from "./libraryMenus";
import type { LibraryActions } from "./useLibraryActions";
import type { SampleFolders } from "./useSampleFolders";

/** Context-menu handlers for the Sound library's rows, chips and folders: spread them or call `onKeyDown` from yours. */

export interface SoundMenuTarget {
  ref: SoundRef;
  /** Preview key and sound, the same pair the play button passes to `actions.preview`. */
  previewKey: string;
  previewSound: PreviewSound;
  /** The sample's file, for "Show in Finder"; omit for built-in sounds. */
  filePath?: string;
}

/** Drum row, sample row, synth or instrument chip. */
export function useSoundMenu(actions: LibraryActions, target: SoundMenuTarget): ContextMenuTrigger {
  const { project } = useAppStores();
  const native = useNative();
  const { ref, previewKey, previewSound, filePath } = target;
  return useContextMenuTrigger(() => ({
    label: `Sound ${ref.name}`,
    entries: soundMenuEntries(project.getState().project, ref, actions.previewingKey === previewKey, {
      preview: () => actions.preview(previewKey, previewSound),
      replace: () => actions.replaceSound(ref),
      layer: () => actions.layerSound(ref),
      addTrack: () => actions.addSoundAsTrack(ref),
      reveal: filePath === undefined ? undefined : () => void native.revealInFinder(filePath).catch(() => undefined),
    }),
  }));
}

/** A drum-machine chip. */
export function useBankMenu(bank: DrumBank, selected: string, onSelect: (bank: string) => void): ContextMenuTrigger {
  const { project } = useAppStores();
  return useContextMenuTrigger(() => ({
    label: `Drum machine ${bank.name}`,
    entries: bankMenuEntries(project.getState().project, bank, bank.code === selected, {
      filter: () => onSelect(bank.code),
      useOnTrack() {
        const { dispatch, project: current } = project.getState();
        const trackId = current.ui.selectedTrack;
        if (trackId) dispatch({ type: "track/setSource", trackId, source: { bank: bank.code } });
      },
    }),
  }));
}

/** A Pro snippet row. */
export function useSnippetMenu(actions: LibraryActions, def: ModifierDef): ContextMenuTrigger {
  const { project } = useAppStores();
  return useContextMenuTrigger(() => ({
    label: `Snippet ${def.name}`,
    entries: snippetMenuEntries(project.getState().project, {
      add: () => actions.insertModifier(def),
      copy: () => actions.copyText(def.template, "code"),
    }),
  }));
}

/** A linked sample folder (Sounds and Samples tabs). */
export function useFolderMenu(samples: SampleFolders, path: string): ContextMenuTrigger {
  const native = useNative();
  return useContextMenuTrigger(() => ({
    label: `Folder ${path}`,
    entries: folderMenuEntries({
      reveal: () => void native.revealInFinder(path).catch(() => undefined),
      rescan: () => samples.rescan(path),
      unlink: () => samples.unlink(path),
    }),
  }));
}
