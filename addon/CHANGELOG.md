# Changelog
## 0.9.4.0-beta

- **Header people bubble.** Moved the People avatars into the header's top-right,
  level with the weather, in their own glass bubble matching the weather widget.
- **Scenes moved to the bottom.** The Scenes card now lives at the bottom of the
  page instead of the top, so the room tiles shift up and are visible sooner
  without scrolling.
## 0.9.3.9-beta

- **Compact sections (smarter space).** New **Settings → Appearance → Compact
  sections** toggle (on by default) flows whole sections into a responsive
  masonry so short sections sit side-by-side and fill the screen width, instead
  of each claiming a full-width band with a tall empty gap underneath (e.g.
  Kitchen above Climate & Utilities). Section headings and separation stay
  intact, and sections never split across columns. Column count scales with the
  viewport (1 → 4). Turn it off to stack every section full-width. Sensor views
  keep the full-width stack so their graphs read wide.
## 0.9.3.8-beta

- **Resolution-aware tiles.** Tile width, height and gap now scale with the
  viewport via `clamp()` (min ~104px wide / 78px tall on small tablets like the
  Fire HD, up to 140x96 on large displays). Smaller screens fit more buttons
  with less wasted space; larger screens get roomier tiles.
## 0.9.3.7-beta

- **Tiles fill the row width.** Switched the tile grid from `auto-fill` to
  `auto-fit`, so the tiles in a section stretch to consume leftover space
  instead of leaving phantom empty columns. Tightened the vertical spacing
  between room sections so stacked sections (e.g. Kitchen above
  Climate & Utilities) sit closer together with less dead space.
## 0.9.3.6-beta

- **Tighter masonry between sections.** Narrowed the masonry column width
  (440px → 340px) and enabled `column-fill: balance` so sibling room sections
  (e.g. Kitchen vs Climate & Utilities) balance to roughly equal heights
  instead of leaving a tall blank gap below a short section.
## 0.9.3.5-beta

- **Tiles backfill empty gaps.** Switched the tile grid to `grid-auto-flow: dense`
  so 1x1 tiles fill the space left next to taller (1x2) tiles — e.g. the empty
  area beside a vacuum/cover tile no longer stays blank. Manual tile size
  overrides in **TileSettings** are still respected.
## 0.9.3.4-beta

- **More tiles per screen, less scrolling on tablets.** Light tiles no longer
  expand to a wide 2x1 when turned on — they stay compact 1x1 (the brightness
  slider still works across the tile), so toggling a light doesn't reflow the
  grid. Tile columns are also a bit narrower (min 150px → 128px) to fit more per
  row. You can still set any tile to a larger size manually in tile settings.
- **Scene bar wraps instead of overflowing.** With many scenes, the Scenes card
  now wraps its pills onto multiple rows rather than running off the screen edge.
## 0.9.3.3-beta

- **Fix shared connection not carrying over to other devices.** The server now
  only stores a complete connection (non-empty URL **and** token), and a device
  adopts the shared connection when its own connection is incomplete (e.g. a
  tablet with a token but no URL, which previously fell back to the unreachable
  `homeassistant.local` default and showed "Connection failed"). Saving with the
  toggle on now stores the effective URL instead of an empty field value.
## 0.9.3.2-beta

- **No-cache for the HTML entry point.** The preview server now sends
  `Cache-Control: no-cache` for `index.html` so kiosks/tablets always pick up the
  latest build after an add-on update (content-hashed JS/CSS stay cached). Fixes
  the dashboard showing stale UI until a manual cache clear.
## 0.9.3.1-beta

- **Update now reliably rebuilds from source.** Added a cache-bust step before the
  `git clone` in the Dockerfile so an add-on **Update** always pulls the latest
  `main` instead of reusing a cached (stale) clone layer. Previously only the
  **Rebuild** button (`--no-cache`) guaranteed fresh source.
## 0.9.3-beta

- **Remember connection on this server** (opt-in) — a new toggle in **Settings →
  Home Assistant** stores the server URL + token on the add-on's `/data` so new
  devices (tablets, kiosks) connect automatically without pasting the token on
  each one. Off by default; the token stays per-device unless you enable it, and
  you can turn it off (which clears the stored connection) anytime.
## 0.9.2.2-beta

- Document the **Web UI port (`3000`)** on the add-on page so kiosk setups
  (Fully Kiosk Browser, tablets, wall displays) know where to point. Clarified
  the port description and added a Network/port setup section to the docs.
## 0.9.2.1-beta

- Rebrand to **Glance**: add-on store name, sidebar panel, and repo all show
  the Glance name. The panel title only applies when the add-on (re)starts —
  restart the add-on after updating if it still shows the old name.
## 0.9.2.1-beta

- Force the sidebar panel to re-register so it shows **Glance** (the panel
  title is only applied when the add-on (re)starts). Restart the add-on after
  updating if it still shows the old name.

## 0.9.2-beta

- Sidebar panel is now named **Glance** (was "Dashboard").

## 0.9.1-beta

- Fix Docker build failure: declare `ARG BUILD_FROM` in the global scope
  (before the first `FROM`) so the runtime stage's base image resolves.

## 0.9.0-beta

- Added add-on icon and logo.
- Added a one-click **Add to Home Assistant** repository button in the docs.
- Beta release for hardware/Ingress testing.

## 0.8.0

- Initial Home Assistant add-on release.
- Serves the Dynamic HA Dashboard via Ingress.
- Persists layout/glance config to `/data/layouts.json`.
- Seeds a generic starter layout on first run.
- Token entered in-app (Settings), never stored on disk.
