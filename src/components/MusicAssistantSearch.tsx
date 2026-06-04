import { useEffect, useMemo, useRef, useState } from 'react';
import type { HassEntities } from 'home-assistant-js-websocket';
import {
  MA_MEDIA_TYPES,
  MA_RESULT_GROUPS,
  extractItems,
  type MaItem,
} from '../lib/musicAssistant';

export type SearchMusic = (opts: {
  term: string;
  mediaType?: string;
  limit?: number;
  libraryOnly?: boolean;
}) => Promise<Record<string, unknown>>;

export type PlayMusic = (player: string, mediaId: string, mediaType?: string) => Promise<void>;

interface Props {
  entities: HassEntities;
  searchMusic: SearchMusic;
  playMusic: PlayMusic;
  /** Tile display name + icon (from the tile config / special-tile registry). */
  name: string;
  icon: string;
}

const PLAYER_KEY = 'ma-last-player';

/**
 * "Search in Music Assistant" — a launcher tile that opens a search panel.
 * Searches via the music_assistant.search service and plays a tapped result on
 * the chosen media player via music_assistant.play_media.
 */
export function MusicAssistantSearch({ entities, searchMusic, playMusic, name, icon }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="tile ma-tile" onClick={() => setOpen(true)}>
        <div className="tile-top">
          <span className={`mdi ${icon} tile-icon ma-tile-icon`} />
        </div>
        <div className="tile-info">
          <div className="tile-name">{name}</div>
          <div className="tile-sub">Search &amp; play</div>
        </div>
        <span className="mdi mdi-magnify ma-tile-search" aria-hidden="true" />
      </button>
      {open && (
        <MusicAssistantPanel
          entities={entities}
          searchMusic={searchMusic}
          playMusic={playMusic}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function MusicAssistantPanel({
  entities,
  searchMusic,
  playMusic,
  onClose,
}: {
  entities: HassEntities;
  searchMusic: SearchMusic;
  playMusic: PlayMusic;
  onClose: () => void;
}) {
  const players = useMemo(
    () =>
      Object.values(entities)
        .filter((e) => e.entity_id.startsWith('media_player.'))
        .map((e) => ({ id: e.entity_id, name: String(e.attributes.friendly_name ?? e.entity_id) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [entities],
  );

  const [term, setTerm] = useState('');
  const [mediaType, setMediaType] = useState('');
  const [limit, setLimit] = useState(5);
  const [libraryOnly, setLibraryOnly] = useState(false);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [player, setPlayer] = useState<string>(() => {
    const saved = localStorage.getItem(PLAYER_KEY);
    return saved ?? '';
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null);
  const [searched, setSearched] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(
    () => () => {
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  // Default the player to the first one if none chosen yet.
  useEffect(() => {
    if (!player && players.length) setPlayer(players[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players]);

  const runSearch = async () => {
    const q = term.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await searchMusic({ term: q, mediaType: mediaType || undefined, limit, libraryOnly });
      setRaw(res);
    } catch (err) {
      setRaw(null);
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setLoading(false);
    }
  };

  const groups = useMemo(() => {
    if (!raw) return [];
    return MA_RESULT_GROUPS.map((g) => {
      let items = extractItems(raw, g.key, g.mediaType);
      if (favouritesOnly) items = items.filter((i) => i.favorite);
      return { ...g, items };
    }).filter((g) => g.items.length > 0);
  }, [raw, favouritesOnly]);

  const totalResults = groups.reduce((n, g) => n + g.items.length, 0);

  const flashToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const play = async (item: MaItem) => {
    if (!player) {
      flashToast('Select a media player first.');
      return;
    }
    localStorage.setItem(PLAYER_KEY, player);
    try {
      await playMusic(player, item.uri, item.mediaType);
      const where = players.find((p) => p.id === player)?.name ?? 'player';
      flashToast(`Playing “${item.name}” on ${where}`);
    } catch (err) {
      flashToast(err instanceof Error ? err.message : 'Could not play that.');
    }
  };

  return (
    <div className="ts-overlay" onClick={onClose}>
      <div className="ts-modal ma-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ts-head ma-head">
          <h3>
            <span className="ma-logo mdi mdi-music-circle" />
            Search in Music Assistant
          </h3>
          <button className="edit-icon-btn" title="Close" onClick={onClose}>
            <span className="mdi mdi-close" />
          </button>
        </div>

        <div className="ts-body ma-body">
          <div className="ma-search-row">
            <span className="mdi mdi-magnify" />
            <input
              ref={inputRef}
              className="ma-search-input"
              placeholder="Type your search term here…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch();
              }}
            />
            <button className="ma-search-go" onClick={runSearch} disabled={loading || !term.trim()}>
              {loading ? <span className="mdi mdi-loading mdi-spin" /> : <span className="mdi mdi-magnify" />}
            </button>
          </div>

          <div className="ma-controls">
            <label className="ma-field">
              <span>Media player</span>
              <select value={player} onChange={(e) => setPlayer(e.target.value)}>
                {players.length === 0 && <option value="">No media players</option>}
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ma-field">
              <span>Media type</span>
              <select value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
                {MA_MEDIA_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="ma-field ma-field-narrow">
              <span>Results</span>
              <input
                type="number"
                min={1}
                max={50}
                value={limit}
                onChange={(e) => setLimit(Math.max(1, Math.min(50, Number(e.target.value) || 5)))}
              />
            </label>
          </div>

          <div className="ma-toggles">
            <button
              type="button"
              className={`ma-chip ${libraryOnly ? 'on' : ''}`}
              aria-pressed={libraryOnly}
              onClick={() => setLibraryOnly((v) => !v)}
            >
              <span className={`mdi ${libraryOnly ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline'}`} />
              Local library
            </button>
            <button
              type="button"
              className={`ma-chip ${favouritesOnly ? 'on' : ''}`}
              aria-pressed={favouritesOnly}
              onClick={() => setFavouritesOnly((v) => !v)}
            >
              <span className={`mdi ${favouritesOnly ? 'mdi-heart' : 'mdi-heart-outline'}`} />
              Favourites only
            </button>
          </div>

          <div className="ma-results">
            {error && (
              <div className="ma-empty ma-error">
                <span className="mdi mdi-alert-circle" /> {error}
              </div>
            )}
            {!error && loading && (
              <div className="ma-empty">
                <span className="mdi mdi-loading mdi-spin" /> Searching…
              </div>
            )}
            {!error && !loading && searched && totalResults === 0 && (
              <div className="ma-empty">
                <span className="mdi mdi-music-note-off" /> No results found.
              </div>
            )}
            {!error && !loading && !searched && (
              <div className="ma-empty ma-hint">
                <span className="mdi mdi-magnify" /> Search your music library and streaming services.
              </div>
            )}
            {!loading &&
              groups.map((g) => (
                <div className="ma-group" key={g.key}>
                  <h4 className="ma-group-title">
                    <span className={`mdi ${g.icon}`} /> {g.label}
                  </h4>
                  <div className="ma-group-items">
                    {g.items.map((item) => (
                      <button
                        type="button"
                        className="ma-item"
                        key={item.uri}
                        onClick={() => play(item)}
                        title={`Play on selected player`}
                      >
                        <span className="ma-item-art">
                          {item.image ? (
                            <img src={item.image} alt="" loading="lazy" />
                          ) : (
                            <span className={`mdi ${g.icon}`} />
                          )}
                          <span className="ma-item-play mdi mdi-play-circle" />
                        </span>
                        <span className="ma-item-text">
                          <span className="ma-item-name">
                            {item.name}
                            {item.favorite && <span className="mdi mdi-heart ma-item-fav" />}
                          </span>
                          {item.subtitle && <span className="ma-item-sub">{item.subtitle}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {toast && <div className="ma-toast">{toast}</div>}
      </div>
    </div>
  );
}
