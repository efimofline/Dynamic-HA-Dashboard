import { useEffect, useMemo, useState } from 'react';
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket';
import { resolveWeatherId, getWeatherIcon, getWeatherColor } from '../lib/weather';
import { resolveArtwork } from '../lib/entityInfo';
import { clockTime } from '../lib/format';
import { eventTimeLabel, groupByDay, type CalendarEvent } from '../lib/calendar';
import { expandedMediaExcludes } from '../lib/mediaDevices';

interface Props {
  entities: HassEntities;
  /** Upcoming events for the under-clock agenda (issue #25). */
  calendarEvents?: CalendarEvent[];
  /** Configurable shortcut button (issue #28): wakes the dashboard directly
   *  onto the chosen page (e.g. Security). */
  shortcut?: { name: string; icon?: string };
  onShortcut?: () => void;
  /** Devices hidden on the media page — also hidden from the now-playing pill
   *  (issue #31: e.g. remote Plex friends' sessions). */
  mediaExclude?: string[];
  /** Manual device merges from the media page, so an exclusion covers every
   *  entity of the merged device. */
  mediaMerge?: string[][];
}

/** The playing media player to feature, if any — feeds the ambient art
 *  background and the now-playing line. A device often exposes several playing
 *  entities (Cast/ADB/...) where one carries the `media_title` and another the
 *  picture; prefer the title-carrier — resolveArtwork borrows companion art —
 *  and fall back to any picture-carrier. */
function findPlaying(entities: HassEntities, excluded?: Set<string>): HassEntity | undefined {
  const playing = Object.values(entities).filter(
    (e) =>
      e.entity_id.startsWith('media_player.') &&
      e.state === 'playing' &&
      !excluded?.has(e.entity_id),
  );
  return (
    playing.find((e) => !!e.attributes.media_title) ??
    playing.find((e) => !!(e.attributes.entity_picture || e.attributes.entity_picture_local))
  );
}

/** Anchor spots the clock block drifts between (percent offsets from center).
 *  Moving it every minute keeps OLED wall tablets from burning in. */
const DRIFT_SPOTS: [number, number][] = [
  [0, 0],
  [-12, -10],
  [12, 8],
  [-10, 9],
  [11, -9],
  [0, 11],
];

/**
 * Idle "screensaver" for wall tablets (issue #20): after the configured idle
 * time the dashboard drifts to a dimmed full-screen clock with the date,
 * outside temperature, and — when something is playing — ambient blurred album
 * art with a now-playing line. Any touch/movement wakes the dashboard (the
 * parent unmounts this via useIdle).
 */
export function Screensaver({ entities, calendarEvents, shortcut, onShortcut, mediaExclude, mediaMerge }: Props) {
  // The waking tap must only dismiss (#30). useIdle unmounts this overlay on
  // pointerdown, but on touch screens the gesture is still in flight — the
  // browser synthesizes the `click` after the finger lifts, and by then the
  // overlay is gone, so the click lands on whatever tile is underneath. Track
  // whether a pointerdown happened while we were showing; on unmount, swallow
  // the one trailing click (capture phase) before it reaches the dashboard.
  // Wakes without a tap (mouse move, keyboard) suppress nothing.
  useEffect(() => {
    let tapped = false;
    const markTap = () => {
      tapped = true;
    };
    window.addEventListener('pointerdown', markTap, true);
    return () => {
      window.removeEventListener('pointerdown', markTap, true);
      if (!tapped) return;
      let timer = 0;
      const stop = () => {
        window.removeEventListener('click', suppress, true);
        window.clearTimeout(timer);
      };
      const suppress = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        stop();
      };
      window.addEventListener('click', suppress, true);
      timer = window.setTimeout(stop, 400);
    };
  }, []);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5_000);
    return () => clearInterval(t);
  }, []);

  // Drift the clock to a new anchor each minute.
  const [spot, setSpot] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSpot((s) => (s + 1) % DRIFT_SPOTS.length), 60_000);
    return () => clearInterval(t);
  }, []);
  const [dx, dy] = DRIFT_SPOTS[spot];

  const weatherId = resolveWeatherId(entities);
  const weather = weatherId ? entities[weatherId] : undefined;
  const temp = weather?.attributes?.temperature as number | undefined;

  const excluded = useMemo(() => {
    if (!mediaExclude?.length) return undefined;
    const players = Object.values(entities).filter((e) => e.entity_id.startsWith('media_player.'));
    return expandedMediaExcludes(players, mediaExclude, mediaMerge);
  }, [entities, mediaExclude, mediaMerge]);
  const playing = useMemo(() => findPlaying(entities, excluded), [entities, excluded]);
  const artwork = playing
    ? resolveArtwork(playing, playing.entity_id, entities)
    : undefined;
  // Title falls back through app name to the device name so the pill is never
  // empty when something is audibly playing without metadata (e.g. live TV).
  // Android players report raw package ids ("org.smarttube.beta") as app_name;
  // those read as noise, so prefer the device name instead.
  const appName = playing?.attributes.app_name as string | undefined;
  const isPackageId = !!appName && /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(appName);
  const title =
    (playing?.attributes.media_title as string | undefined) ||
    (!isPackageId ? appName : undefined) ||
    (playing?.attributes.friendly_name as string | undefined);
  const artist = playing?.attributes.media_artist as string | undefined;

  const clock = clockTime(now);
  const dateLine = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Next-48h agenda under the clock (issue #25): at most 4 events across
  // today + tomorrow, today's accented, tomorrow's dimmed. Drifts with the
  // clock block, so it stays OLED-safe.
  const agenda = useMemo(() => {
    if (!calendarEvents?.length) return [];
    const days = groupByDay(calendarEvents, 2, now);
    const rows: { key: string; label?: string; event: CalendarEvent; today: boolean }[] = [];
    for (const day of days) {
      for (const e of day.events) {
        if (rows.length >= 4) return rows;
        rows.push({
          key: `${e.calendarId}-${e.start.getTime()}-${e.summary}`,
          label: rows.find((r) => r.label === day.label) ? undefined : day.label,
          event: e,
          today: day.label.startsWith('TODAY'),
        });
      }
    }
    return rows;
    // `now` ticks every 5s; recompute only when the minute (or data) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarEvents, now.getHours(), now.getMinutes()]);

  return (
    <div className="screensaver" role="presentation">
      {artwork && (
        <div
          className="ss-backdrop"
          key={artwork}
          style={{ backgroundImage: `url("${artwork}")` }}
          aria-hidden="true"
        />
      )}
      <div className="ss-scrim" aria-hidden="true" />

      <div className="ss-center" style={{ transform: `translate(${dx}%, ${dy}%)` }}>
        <div className="ss-clock">
          {clock.time}
          {clock.suffix && <span className="ss-clock-suffix">{clock.suffix}</span>}
        </div>
        <div className="ss-date">{dateLine}</div>
        {weather && temp != null && (
          <div className="ss-weather">
            <span
              className={`mdi ${getWeatherIcon(weather.state)}`}
              style={{ color: getWeatherColor(weather.state) }}
            />
            {Math.round(temp)}°
          </div>
        )}
        {agenda.length > 0 && (
          <div className="ss-agenda">
            {agenda.map((row) => (
              <div key={row.key} className="ss-agenda-row">
                {row.label != null && (
                  <div className="ss-agenda-day">{row.label.split(' ·')[0]}</div>
                )}
                <div className={`ss-agenda-event ${row.today ? 'is-today' : ''}`}>
                  <span className="ss-agenda-time">{eventTimeLabel(row.event)}</span>
                  <span className="ss-agenda-title">{row.event.summary}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {shortcut && (
        <button
          type="button"
          className="ss-shortcut"
          // The same pointerdown that wakes the dashboard (unmounting this
          // overlay before a click could ever fire) also triggers the
          // navigation — so the tap lands on the chosen page in one go.
          onPointerDown={onShortcut}
        >
          <span className={`mdi ${shortcut.icon || 'mdi-shield-home'}`} />
          {shortcut.name}
        </button>
      )}

      {playing && title && (
        <div className="ss-nowplaying">
          {artwork && <img src={artwork} alt="" />}
          <div className="ss-np-text">
            <span className="ss-np-title">{title}</span>
            {artist && <span className="ss-np-artist">{artist}</span>}
          </div>
          <div className="ss-np-eq" aria-hidden="true">
            <span /><span /><span />
          </div>
        </div>
      )}
    </div>
  );
}
