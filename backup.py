"""Create safe SQLite backups on startup and once every 24 hours."""

import os
import sqlite3
import time
from datetime import datetime, timedelta
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
DB_PATH = DATA_DIR / "shifts.db"
BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", "/backups"))
RETENTION_DAYS = int(os.environ.get("BACKUP_RETENTION_DAYS", "30"))
INTERVAL_SECONDS = 24 * 60 * 60


def create_backup() -> Path | None:
    if not DB_PATH.exists():
        print(f"Database does not exist yet: {DB_PATH}", flush=True)
        return None

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    destination = BACKUP_DIR / f"shifts-{timestamp}.db"

    source = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    target = sqlite3.connect(destination)
    try:
        source.backup(target)
        check = target.execute("PRAGMA integrity_check").fetchone()
        if not check or check[0] != "ok":
            raise RuntimeError(f"Backup integrity check failed: {check}")
    finally:
        target.close()
        source.close()

    print(f"Backup created: {destination}", flush=True)
    return destination


def prune_old_backups() -> None:
    cutoff = datetime.now() - timedelta(days=RETENTION_DAYS)
    for path in BACKUP_DIR.glob("shifts-*.db"):
        if datetime.fromtimestamp(path.stat().st_mtime) < cutoff:
            path.unlink(missing_ok=True)
            print(f"Pruned old backup: {path}", flush=True)


def main() -> None:
    while True:
        try:
            create_backup()
            prune_old_backups()
        except Exception as exc:
            print(f"Backup failed: {exc}", flush=True)
        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
