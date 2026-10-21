import type { Project, Track } from "./types";

/** True when any track is soloed. */
export function anySolo(tracks: readonly Track[]): boolean {
  return tracks.some((t) => t.solo);
}

/** A track sounds unless it is muted, or another track is soloed and it isn't (SPEC §6.1). */
export function isAudible(track: Track, tracks: readonly Track[]): boolean {
  if (track.mute) return false;
  return !anySolo(tracks) || track.solo;
}

export function findTrack(project: Project, trackId: string | null | undefined): Track | undefined {
  return trackId == null ? undefined : project.tracks.find((t) => t.id === trackId);
}
