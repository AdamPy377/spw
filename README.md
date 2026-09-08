# SPW v15.1

SPW v15.1 keeps the Gunicorn, Cash Management and daily-backup work from v15, removes all PIN/session authentication, and splits the frontend JavaScript into feature-focused files.

## JavaScript layout

The scripts are loaded in this order from `index.html`:

- `js/core.js` — configuration, shared state, utility helpers and navigation.
- `js/spw.js` — shift loading/saving, projections, positioning worksheet and shared SPW helpers.
- `js/breaks.js` — break planning and break dashboard.
- `js/food-safety.js` — food-safety state and screen.
- `js/profiles-history.js` — crew profiles, profile helpers and saved-shift history.
- `js/network.js` — API requests, local cache, offline queue and autosave persistence.
- `js/live-operations.js` — live break controls, skills/coverage helpers, alerts and shift operations.
- `js/crew.js` — add/edit/move/delete crew and Build/Edit rendering.
- `js/tasks.js` — shift tasks and task/food-safety actions.
- `js/skills.js` — crew skill editing and positioning recommendations.
- `js/results-staffing.js` — shift results and staffing/coverage screens.
- `js/live-dashboard.js` — page routing, handover and the Live SPW dashboard.
- `js/cash.js` — native time snapping and Cash Management.
- `js/init.js` — application startup only; keep this last.

These remain ordinary browser scripts rather than ES modules so the existing app can continue sharing its current state and helpers without a large architectural rewrite. The split makes individual features much easier to find and edit while keeping behaviour compatible.

## Docker / Gunicorn

No PIN, secret key or authentication environment variables are required anymore.

Build and restart after replacing the files:

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

The application still runs through Gunicorn on port 3000. Caddy can continue proxying to `position-board:3000` using the existing Caddyfile.

## Database and backups

The live SQLite database remains `/data/shifts.db`, mapped to `/mnt/das/apps/position-board` by `docker-compose.yaml`.

The `position-board-backup` service creates a consistent SQLite backup approximately every 24 hours in `/mnt/das/apps/position-board/backups` and keeps 30 days by default.

## Time fields

Crew shift start/end and meal fields use native time inputs constrained/snapped to 15-minute increments. Rest fields use 5-minute increments. Native iOS/macOS/Android controls may still visually expose other minute values depending on the browser, but SPW snaps entered values to the configured increment before saving.

## Cash Management

Cash Management includes the required Front Counter and Drive Thru drawers, optional Drive Thru Present drawer, $200 floats, recount history, physical safe denomination counts, $1,700 physical-safe target and $2,500 total accountability reference.
