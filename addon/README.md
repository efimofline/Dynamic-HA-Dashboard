# Dynamic HA Dashboard — Home Assistant Add-on

Run the Dynamic HA Dashboard as a Supervisor-managed add-on, available right
from the Home Assistant sidebar via **Ingress** (no extra exposed port, inherits
HA's authentication).

## Install

1. In Home Assistant go to **Settings → Add-ons → Add-on Store**.
2. Click the **⋮** menu (top right) → **Repositories**, and add:
   ```
   https://github.com/jvenuto80/Dynamic-HA-Dashboard
   ```
3. Find **Dynamic HA Dashboard** in the store and click **Install**.
4. Click **Start**, then **Open Web UI** (or use the sidebar panel).

## First-time setup

The add-on does **not** store your Home Assistant token. On first open:

1. Click the **gear / Settings** icon in the dashboard.
2. Under **Home Assistant**, enter your server URL (e.g.
   `http://homeassistant.local:8123`) and a **Long-Lived Access Token**
   (create one in HA → your **Profile → Long-Lived Access Tokens**).
3. Click **Test connection**, then **Save & reload**.

The token is kept in that browser's `localStorage` only — it is never written to
disk or baked into the image.

## Your layout

- A generic starter layout is seeded on first run so you have something to edit.
- Your customizations (views, tiles, and at-a-glance buttons) are saved to the
  add-on's persistent `/data/layouts.json` and survive restarts and updates.

### Bringing an existing layout over

If you already built a dashboard on another device:

1. On the existing dashboard: **Settings → Dashboard data → Export layout**.
2. On this add-on: **Settings → Dashboard data → Import layout**, pick the file.

## Notes

- The dashboard talks to Home Assistant directly over WebSocket from the
  browser, so make sure the **Server URL** you enter is reachable from the
  device viewing the dashboard.
- To also expose a plain port (outside Ingress), set a host port for `3000/tcp`
  in the add-on **Network** options.
