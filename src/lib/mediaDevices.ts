import type { HassEntity } from 'home-assistant-js-websocket';
import type { MediaTileConfig } from '../types';

// Shared Music/media player device de-duplication. A single physical device
// (e.g. an Android TV) commonly exposes several `media_player` entities — an
// ADB/androidtv one, a Cast one, an AirPlay one, a Kodi one — that all mirror
// the same device. Collapsing them to one device keeps counts and the media
// page clean instead of listing the same TV five times.

export const friendlyName = (e: HassEntity): string =>
  (e.attributes.friendly_name as string) || e.entity_id;

/** Transport/integration suffix tokens that distinguish duplicate entities. */
const MEDIA_SOURCE_TOKENS =
  /\b(adb|cast|remote|airplay|androidtv|android\s*tv|google\s*cast|chromecast|fire\s*tv|firetv|kodi|dlna|media\s*player|mediaplayer|mpd)\b/g;

/**
 * A normalized key identifying the physical device behind a media_player
 * entity. Strips the transport/source tokens and all whitespace so spacing and
 * integration variants of the same device collapse together
 * (e.g. "Living Room TV Cast" / "Livingroom TV ADB" → "livingroomtv").
 */
export function deviceNameKey(e: HassEntity): string {
  const full = friendlyName(e)
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ') // drop parenthetical qualifiers like "(MA)"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const stripped = full.replace(MEDIA_SOURCE_TOKENS, ' ').replace(/\s+/g, ' ').trim();
  // If stripping removed everything (e.g. the name *is* "ADB" or a raw id),
  // fall back to the full name / entity id so unrelated devices aren't all
  // merged into one empty-keyed group.
  const key = (stripped || full).replace(/\s+/g, '');
  return key || e.entity_id;
}

const hasMeta = (e: HassEntity) => !!(e.attributes.media_title as string | undefined);

/**
 * Choose the entity that best represents a device group. When `preferMeta` is
 * set (display contexts), an entity carrying now-playing metadata wins so the
 * tile shows artwork/title; otherwise the shortest (usually base) friendly name
 * wins for a clean, stable label.
 */
export function pickRepresentative(group: HassEntity[], preferMeta = false): HassEntity {
  return group.reduce((best, e) => {
    if (preferMeta) {
      if (hasMeta(e) && !hasMeta(best)) return e;
      if (hasMeta(e) === hasMeta(best) && friendlyName(e).length < friendlyName(best).length) return e;
      return best;
    }
    return friendlyName(e).length < friendlyName(best).length ? e : best;
  });
}

/** Group media players by physical device. Insertion order is preserved.
 *  `merges` is a list of manual merge groups (each an array of entity_ids the
 *  user has tied together); heuristic groups sharing any of those ids are
 *  unioned, so devices the name heuristic missed can still be combined. */
export function groupMediaPlayers(players: HassEntity[], merges: string[][] = []): HassEntity[][] {
  const groups: HassEntity[][] = [];
  const keyToIdx = new Map<string, number>();
  for (const e of players) {
    const k = deviceNameKey(e);
    let idx = keyToIdx.get(k);
    if (idx === undefined) {
      idx = groups.length;
      groups.push([]);
      keyToIdx.set(k, idx);
    }
    groups[idx].push(e);
  }
  if (!merges.length) return groups;

  // Union-find over heuristic group indices, joined by manual merge groups.
  const parent = groups.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const idToIdx = new Map<string, number>();
  groups.forEach((g, i) => g.forEach((e) => idToIdx.set(e.entity_id, i)));
  for (const mg of merges) {
    const idxs = mg
      .map((id) => idToIdx.get(id))
      .filter((x): x is number => x !== undefined);
    for (let i = 1; i < idxs.length; i++) union(idxs[0], idxs[i]);
  }
  // Collect unioned members, preserving first-seen order of the root groups.
  const out = new Map<number, HassEntity[]>();
  const order: number[] = [];
  groups.forEach((g, i) => {
    const r = find(i);
    if (!out.has(r)) {
      out.set(r, []);
      order.push(r);
    }
    out.get(r)!.push(...g);
  });
  return order.map((r) => out.get(r)!);
}

/** Reduce media players to one representative entity per physical device. */
export function dedupeMediaPlayers(
  players: HassEntity[],
  preferMeta = true,
  merges: string[][] = [],
): HassEntity[] {
  return groupMediaPlayers(players, merges).map((g) => pickRepresentative(g, preferMeta));
}

/**
 * Collapse synchronized speaker groups so a grouped set shows a single card.
 *
 * Real-world grouping is exposed three different ways depending on the
 * integration, so this layers three signals (all gated behind one card list):
 *
 * 1. **Standard `group_members`** (Google Cast, Sonos, Squeezebox) — HA lists
 *    the synced members and, by convention, `group_members[0]` is the leader.
 *    A member whose leader is also showing is dropped.
 * 2. **Music Assistant `active_queue`** — MA sync groups share one queue id
 *    across the group and its member players (e.g. `syncgroup_…`). Members that
 *    share a queue collapse to the `mass_player_type: 'group'` card (or, if the
 *    group isn't shown, the first member).
 * 3. **Silent passive endpoints** — when an MA group is actively playing, the
 *    raw per-speaker output entities it drives (Snapcast/satellite players)
 *    appear as bare `playing` tiles with *no* metadata (no title, app_id, queue,
 *    player type or group_members). Those are the group's outputs, so they're
 *    hidden too. This only runs while a group is playing, so an independent
 *    speaker is never hidden.
 *
 * `shown` is one representative entity per physical device (already de-duped and
 * filtered to active devices); `devices` is the full grouping so a leader that
 * is a non-representative entity still resolves to its device. A member is only
 * dropped when its leader/group maps to a *different* shown device, so a lone
 * playing speaker never disappears.
 */
export function collapseSpeakerGroups(
  shown: HassEntity[],
  devices: HassEntity[][],
): HassEntity[] {
  if (shown.length < 2) return shown;

  const deviceOf = new Map<string, number>();
  devices.forEach((g, i) => g.forEach((m) => deviceOf.set(m.entity_id, i)));
  const shownDeviceIdx = new Set(shown.map((e) => deviceOf.get(e.entity_id)));
  const drop = new Set<string>();

  // ── Signal 1: standard group_members leader convention ──
  for (const e of shown) {
    const gm = e.attributes.group_members as string[] | undefined;
    if (!Array.isArray(gm) || gm.length < 2) continue;
    const leader = gm[0];
    if (!leader || leader === e.entity_id) continue;
    const myIdx = deviceOf.get(e.entity_id);
    const leaderIdx = deviceOf.get(leader);
    if (leaderIdx === undefined || leaderIdx === myIdx) continue;
    if (shownDeviceIdx.has(leaderIdx)) drop.add(e.entity_id);
  }

  // ── Signal 2: Music Assistant active_queue ──
  const byQueue = new Map<string, HassEntity[]>();
  for (const e of shown) {
    const q = e.attributes.active_queue as string | undefined;
    if (!q) continue;
    const list = byQueue.get(q);
    if (list) list.push(e);
    else byQueue.set(q, [e]);
  }
  let maGroupPlaying = shown.some((e) => e.attributes.mass_player_type === 'group');
  for (const members of byQueue.values()) {
    if (members.length < 2) continue;
    const group = members.find((m) => m.attributes.mass_player_type === 'group');
    if (group) maGroupPlaying = true;
    const keep = group ?? members[0];
    for (const m of members) if (m !== keep) drop.add(m.entity_id);
  }

  // ── Signal 3: silent passive endpoints while a group is playing ──
  if (maGroupPlaying) {
    for (const e of shown) {
      if (drop.has(e.entity_id)) continue;
      const a = e.attributes;
      if (a.mass_player_type === 'group') continue; // never drop the group itself
      const bare =
        !a.media_title &&
        !a.app_id &&
        !a.mass_player_type &&
        !a.active_queue &&
        !(Array.isArray(a.group_members) && a.group_members.length > 0);
      if (bare) drop.add(e.entity_id);
    }
  }

  return shown.filter((e) => !drop.has(e.entity_id));
}

// ── Per-device artwork / media overrides ──
// A Now Playing device can bundle several media_player entities (Cast/ADB/MA…),
// so artwork settings are stored per member entity_id and merged when read.

/**
 * Effective artwork/media config for a device, merging the stored overrides of
 * all its member entity_ids (later members win). Returns an empty object when no
 * member has an override — i.e. the page defaults (artwork shown, auto source).
 */
export function mediaConfigFor(
  ids: string[],
  overrides: Record<string, MediaTileConfig>,
): MediaTileConfig {
  return ids.reduce<MediaTileConfig>((acc, id) => ({ ...acc, ...(overrides[id] ?? {}) }), {});
}

/**
 * Entity ids to EXCLUDE from the artwork-source picker for a given device.
 *
 * The artwork source is almost always a *sibling* player on the same physical
 * device (e.g. `media_player.mb_tv` carries the picture for the playing
 * `media_player.mb_tv_cast`), so — unlike the add-tile picker — we must NOT
 * exclude the device's own member entities, or the right source becomes
 * unpickable. Returns an empty set. Kept as a named helper so this intent is
 * pinned by a regression test and can't silently revert to excluding siblings.
 */
export function artworkPickerExclusions(_deviceEntityIds: string[]): Set<string> {
  return new Set<string>();
}

/**
 * Apply an artwork/media patch to every member entity of a device, returning a
 * NEW overrides map with defaults pruned so the saved layout stays minimal:
 * `mediaArtwork` is only kept when explicitly `false` (the non-default), and an
 * empty `artworkEntity` (Auto) is dropped. Entries that become empty are removed
 * entirely. Pure — does not mutate the input.
 */
export function applyMediaOverride(
  overrides: Record<string, MediaTileConfig>,
  ids: string[],
  patch: Partial<MediaTileConfig>,
): Record<string, MediaTileConfig> {
  const next = { ...overrides };
  for (const id of ids) {
    const merged: MediaTileConfig = { ...(next[id] ?? {}), ...patch };
    if (merged.mediaArtwork !== false) delete merged.mediaArtwork;
    if (!merged.artworkEntity) delete merged.artworkEntity;
    if (Object.keys(merged).length === 0) delete next[id];
    else next[id] = merged;
  }
  return next;
}


/**
 * Expand a media-page exclude list to *every* entity of each excluded device
 * (issue #31). Exclusions are stored as the entity ids that existed when the
 * user hid the device, but some integrations mint new session entities later
 * (Plex creates a fresh `media_player.plex_*_N` per client) — grouping by
 * device name catches those, so a hidden device stays hidden everywhere
 * (e.g. the screensaver's now-playing pill).
 */
export function expandedMediaExcludes(
  players: HassEntity[],
  exclude: string[],
  merges: string[][] = [],
): Set<string> {
  const base = new Set(exclude);
  const out = new Set(exclude);
  for (const group of groupMediaPlayers(players, merges)) {
    if (group.some((m) => base.has(m.entity_id))) {
      for (const m of group) out.add(m.entity_id);
    }
  }
  return out;
}
