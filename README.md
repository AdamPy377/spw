# SPW v15.5

SPW v15.5 moves the live SQLite database off network storage and increases Gunicorn request concurrency while keeping daily backups on `/mnt/media/spw`.

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

## One-time migration from v15.4

Before deploying v15.5, stop the current SPW stack so the database cannot change while it is copied.

On the Docker host:

```bash
sudo mkdir -p /home/adam/docker/spw
sudo mkdir -p /mnt/media/spw/backups
sudo cp -a /mnt/media/spw/shifts.db /home/adam/docker/spw/shifts.db
sudo ls -lh /home/adam/docker/spw/shifts.db
```

Do not delete `/mnt/media/spw/shifts.db` yet. Keep it as an extra fallback until the new deployment is confirmed working.

Then update the GitHub repository and use Portainer **Pull and redeploy**.

After deployment, verify the running container sees the local database:

```bash
docker exec position-board ls -lh /data/shifts.db
docker inspect position-board --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
```

The mount output should include:

```text
/home/adam/docker/spw -> /data
```

Verify the backup container mounts both locations:

```bash
docker inspect position-board-backup --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
```

It should include:

```text
/home/adam/docker/spw -> /data
/mnt/media/spw/backups -> /backups
```

## Updating through GitHub + Portainer

Replace the repository files with this version, then run:

```bash
git add -A
git commit -m "SPW v15.5 - local database and threaded Gunicorn"
git push
```

In Portainer open **Stacks → SPW → Pull and redeploy** and make sure the image is rebuilt.

SPW remains available on:

```text
http://DOCKER-HOST-IP:3000
```

## Backups

`backup.py` creates a consistent SQLite backup when the backup container starts and then every 24 hours. Backups older than 30 days are removed automatically.
