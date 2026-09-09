# SPW v15.6.1

SPW v15.6.1 keeps the fast local SQLite/Gunicorn setup from v15.5 and improves live operations: demand-aware area strength, a loaded positioning overview on Live SPW, chronological next steps, corrected break ordering, and Cash Management becoming due only in the final hour of the shift.

## Storage layout

The live database now lives on the Docker host's local disk:

```text
/home/adam/docker/spw/
└── shifts.db
```

Daily backups remain on network storage:

```text
/mnt/media/spw/backups/
└── shifts-YYYYMMDD-HHMMSS.db
```

The app container mounts `/home/adam/docker/spw` as `/data`. The backup container mounts that same location read-only as `/data` and mounts `/mnt/media/spw/backups` as `/backups`.

## Gunicorn

SPW starts with one Gunicorn worker and four threads:

```text
gunicorn --bind 0.0.0.0:3000 --worker-class gthread --workers 1 --threads 4 --timeout 60 app:app
```

One worker is intentional for SQLite. Four threads allow overlapping requests without creating multiple independent Python processes that can increase SQLite write contention. SQLite uses WAL mode on the local disk for better concurrent read/write behaviour.

The SQLite lock/busy timeout is 5 seconds (`timeout=5`, `PRAGMA busy_timeout=5000`). Gunicorn's separate request timeout remains 60 seconds.

## Updating from v15.5

There is **no database move required** for v15.6. Keep the live database and backup paths exactly as they are:

```text
Live DB: /home/adam/docker/spw/shifts.db
Backups: /mnt/media/spw/backups/
```

The Compose mounts remain:

```text
/home/adam/docker/spw -> /data
/mnt/media/spw/backups -> /backups
```

### Live operations changes

- Area strength now considers position skill/capability, number of capable people in the area, current hourly sales, time of day and minimum/preferred staffing.
- McCafé expects 2 capable people minimum in the morning, prefers 3, and treats 4 capable people as very strong; after midday it still expects at least 2.
- Drive Thru requires distinct capable coverage for an order-taking/cash role and a runner/presenter/service role.
- In Restaurant can be strong with one highly capable person during non-extreme demand, while two remains preferred.
- Live SPW now includes the same positioning-style worksheet used by View SPW plus a one-tap View / edit positioning button.
- A Next steps list shows upcoming clock-ons, breaks, clock-offs and the start of the cash-management window.
- Break Dashboard sorts overdue breaks newest-first, then due/current, then the next upcoming breaks chronologically.
- Cash Management is no longer an all-shift urgent alert; it becomes due in the final hour of the shift.

## Updating through GitHub + Portainer

Replace the repository files with this version, then run:

```bash
git add -A
git commit -m "SPW v15.6.1 - live operations improvements"
git push
```

In Portainer open **Stacks → SPW → Pull and redeploy** and make sure the image is rebuilt.

SPW remains available on:

```text
http://DOCKER-HOST-IP:3000
```

## Backups

`backup.py` creates a consistent SQLite backup when the backup container starts and then every 24 hours. Backups older than 30 days are removed automatically.


## v15.6.1 mobile positioning change
- Desktop Live SPW keeps the full Positioning overview.
- Mobile Live SPW hides the embedded positioning worksheet and shows only a full-width View / edit positioning button, restoring the cleaner mobile dashboard layout.
