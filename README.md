# SPW v15.2

SPW v15.2 is the Portainer/GitHub deployment version of the app. It keeps Gunicorn, Cash Management, the split JavaScript structure, and daily SQLite backups. It has no PIN/authentication layer and no Caddy/reverse-proxy service.

## What runs

- `position-board` — Flask served by Gunicorn on container port 3000 and published as host port 3000.
- `position-board-backup` — creates a SQLite backup every 24 hours and keeps 30 days by default.

The database and backups remain outside the image at:

```text
/mnt/das/apps/position-board/
├── shifts.db
└── backups/
```

Rebuilding or redeploying the GitHub stack does not remove that data.

## Portainer Git stack

Use **Stacks → Add stack → Repository** and set:

- Repository URL: your public GitHub repository URL
- Reference: `refs/heads/main`
- Compose path: `docker-compose.yaml`
- Authentication: off for a public repository

Deploy the stack. SPW is then available at:

```text
http://DOCKER-HOST-IP:3000
```

## Updating

Replace/update the files in your local Git checkout, then:

```bash
git add -A
git commit -m "Update SPW"
git push
```

In Portainer open the SPW stack and choose **Pull and redeploy**. If Portainer offers an image/build pull option, enable rebuilding so changes to the Docker build context are used.

## JavaScript layout

```text
js/
├── core.js
├── spw.js
├── breaks.js
├── food-safety.js
├── profiles-history.js
├── network.js
├── live-operations.js
├── crew.js
├── tasks.js
├── skills.js
├── results-staffing.js
├── live-dashboard.js
├── cash.js
└── init.js
```

The scripts remain ordinary browser scripts rather than ES modules so the existing shared application state continues to work without a large rewrite.

## Gunicorn

The Docker image starts SPW with one Gunicorn worker and four threads:

```text
gunicorn --bind 0.0.0.0:3000 --workers 1 --threads 4 --timeout 60 app:app
```

One worker is intentional while SQLite is the shared datastore; the threads still allow concurrent request handling without creating several independent SQLite writer processes.

## Backups

`backup.py` performs a consistent SQLite backup on startup and then every 24 hours. Files are stored in `/mnt/das/apps/position-board/backups` and backups older than 30 days are deleted automatically.
