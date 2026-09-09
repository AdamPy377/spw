import json
import os
import sqlite3
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from pywebpush import WebPushException, webpush

DATA_DIR = os.environ.get("DATA_DIR", "/data")
DB_PATH = os.path.join(DATA_DIR, "shifts.db")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", os.path.join(DATA_DIR, "vapid_private.pem"))
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:spw@example.com")
APP_TIMEZONE = os.environ.get("APP_TIMEZONE", "Australia/Melbourne")
CHECK_SECONDS = int(os.environ.get("NOTIFICATION_CHECK_SECONDS", "30"))
TZ = ZoneInfo(APP_TIMEZONE)

BREAK_FIELDS = [
    ("meal_sent", "meal_time", "Meal"),
    ("rest1_sent", "rest1_time", "Rest"),
    ("rest2_sent", "rest2_time", "Rest"),
]


def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def parse_minutes(value):
    if not value:
        return None
    hour, minute = map(int, value.split(":"))
    return hour * 60 + minute


def break_datetime(shift_date, shift_type, shift_start, break_time):
    start_mins = parse_minutes(shift_start)
    break_mins = parse_minutes(break_time)
    if start_mins is None or break_mins is None:
        return None
    start_date = date.fromisoformat(shift_date)
    if shift_type == "Overnight" and start_mins < 12 * 60:
        start_date += timedelta(days=1)
    start_dt = datetime.combine(start_date, datetime.min.time(), TZ) + timedelta(minutes=start_mins)
    relative = (break_mins - start_mins) % (24 * 60)
    return start_dt + timedelta(minutes=relative)


def send_break_push(subscription, crew_name, label, due_dt):
    payload = {
        "title": f"{label} Break - 5 Minutes",
        "body": f"{crew_name}'s {label.lower()} is due at {due_dt.strftime('%-I:%M %p')}.",
        "tag": f"spw-break-{crew_name}-{label}-{due_dt.isoformat()}",
        "url": "./?page=breaks",
    }
    webpush(
        subscription_info={
            "endpoint": subscription["endpoint"],
            "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]},
        },
        data=json.dumps(payload),
        vapid_private_key=VAPID_PRIVATE_KEY,
        vapid_claims={"sub": VAPID_SUBJECT},
        ttl=300,
    )


def process_notifications():
    if not os.path.exists(DB_PATH) or not os.path.exists(VAPID_PRIVATE_KEY):
        return
    now = datetime.now(TZ)
    from_day = (now.date() - timedelta(days=1)).isoformat()
    to_day = (now.date() + timedelta(days=1)).isoformat()
    conn = get_db()
    try:
        cutoff = (now - timedelta(days=30)).isoformat()
        conn.execute("DELETE FROM push_notifications WHERE sent_at < ?", (cutoff,))
        conn.commit()
        subscriptions = conn.execute("SELECT * FROM push_subscriptions").fetchall()
        if not subscriptions:
            return
        rows = conn.execute(
            """
            SELECT c.*, s.shift_date, s.shift_type
            FROM crew c
            JOIN spw s ON s.id=c.spw_id
            WHERE s.shift_date BETWEEN ? AND ?
            """,
            (from_day, to_day),
        ).fetchall()
        for row in rows:
            for sent_field, time_field, label in BREAK_FIELDS:
                if row[sent_field] or not row[time_field]:
                    continue
                due_dt = break_datetime(row["shift_date"], row["shift_type"], row["shift_start"], row[time_field])
                if not due_dt:
                    continue
                seconds_until = (due_dt - now).total_seconds()
                # Send once in the five-minute window. This also catches a worker
                # restart that happens a minute or two after the exact 5m mark.
                if seconds_until <= 0 or seconds_until > 5 * 60 + CHECK_SECONDS:
                    continue
                break_key = due_dt.isoformat()
                for subscription in subscriptions:
                    already = conn.execute(
                        "SELECT 1 FROM push_notifications WHERE subscription_id=? AND crew_id=? AND break_field=? AND break_at=?",
                        (subscription["id"], row["id"], sent_field, break_key),
                    ).fetchone()
                    if already:
                        continue
                    try:
                        send_break_push(subscription, row["name"], label, due_dt)
                    except WebPushException as exc:
                        status = getattr(getattr(exc, "response", None), "status_code", None)
                        if status in (404, 410):
                            conn.execute("DELETE FROM push_subscriptions WHERE id=?", (subscription["id"],))
                            conn.commit()
                        else:
                            print(f"Push failed for subscription {subscription['id']}: {exc}", flush=True)
                        continue
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO push_notifications
                        (subscription_id, spw_id, crew_id, break_field, break_at, sent_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (subscription["id"], row["spw_id"], row["id"], sent_field, break_key, now.isoformat()),
                    )
                    conn.commit()
                    print(f"Sent {label} reminder for {row['name']} due {due_dt.isoformat()}", flush=True)
    finally:
        conn.close()


def main():
    print(f"SPW break notification worker started ({APP_TIMEZONE})", flush=True)
    while True:
        try:
            process_notifications()
        except Exception as exc:
            print(f"Notification worker error: {exc}", flush=True)
        time.sleep(CHECK_SECONDS)


if __name__ == "__main__":
    main()
