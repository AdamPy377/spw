import os
import json
import sqlite3
import re
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory

DATA_DIR = os.environ.get("DATA_DIR", "/data")
DB_PATH = os.path.join(DATA_DIR, "shifts.db")
APP_DIR = os.path.dirname(__file__)

app = Flask(__name__, static_folder=APP_DIR, static_url_path="")



VALID_SHIFT_TYPES = {"Day Shift", "Night Shift", "Overnight"}
TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")

def valid_time(value):
    return value in (None, "") or bool(TIME_RE.match(str(value)))

def validate_crew_data(data):
    name = str(data.get("name", "")).strip()
    if name and len(name) > 80:
        return "Crew name is too long"
    for field in ("shift_start", "shift_end", "meal_time", "rest1_time", "rest2_time"):
        if field not in data:
            continue
        value = data.get(field)
        if not valid_time(value):
            return f"{field.replace('_', ' ').title()} must be a valid HH:MM time"
        if value:
            minute = int(str(value).split(":")[1])
            step = 5 if field.startswith("rest") else 15
            if minute % step:
                return f"{field.replace('_', ' ').title()} must use {step}-minute increments"
    if "rest_count" in data:
        try:
            rests = int(data.get("rest_count") or 0)
        except (TypeError, ValueError):
            return "Rest count must be a number"
        if rests < 0 or rests > 2:
            return "Rest count must be between 0 and 2"
    return None

DEFAULT_GOALS = {
    "Kitchen": {"Peak Burgers": "", "MFY Time – 45 sec": "", "Accuracy / Procedure / Step Up QSC Focus": ""},
    "Drive Thru": {"Peak Cars": "", "OEPE <120 sec": "", "R2P <60 sec": "", "Accuracy / Procedure / Step Up QSC Focus": ""},
    "In Restaurant": {"MX Score – 55%": "", "No. Surveys Completed": "", "R2P <90 sec": "", "Accuracy / Procedure / Step Up QSC Focus": ""},
    "McDelivery": {"McDelivery R2P <180 sec": "", "Restaurant Time": "", "Accuracy / Procedure / Step Up QSC Focus": ""},
    "McCafé": {"Peak Coffees": "", "Peak McCafé Dollars": "", "McCafé R2P <180 sec": "", "Accuracy / Procedure / Step Up QSC Focus": ""},
}


def get_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    # Keep SQLite in its simple rollback-journal mode. The database lives on the
    # mounted /data volume, where WAL can be noticeably slower or unreliable on
    # some NAS/DAS filesystems.
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.row_factory = sqlite3.Row
    return conn


def add_missing_columns(conn, table, columns):
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    for col, decl in columns.items():
        if col not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS spw (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shift_date TEXT NOT NULL,
            shift_type TEXT NOT NULL,
            shift_manager TEXT DEFAULT '',
            safety_champion TEXT DEFAULT '',
            hours_json TEXT DEFAULT '[]',
            projected_json TEXT DEFAULT '[]',
            actual_json TEXT DEFAULT '[]',
            goals_json TEXT DEFAULT '{}',
            area_leaders_json TEXT DEFAULT '{}',
            notes TEXT DEFAULT '',
            handover TEXT DEFAULT '',
            food_safety_json TEXT DEFAULT '{}',
            tasks_json TEXT DEFAULT '{}',
            results_json TEXT DEFAULT '{}',
            cash_json TEXT DEFAULT '{}',
            UNIQUE(shift_date, shift_type)
        )
    """)
    add_missing_columns(conn, "spw", {
        "shift_manager": "TEXT DEFAULT ''",
        "safety_champion": "TEXT DEFAULT ''",
        "hours_json": "TEXT DEFAULT '[]'",
        "projected_json": "TEXT DEFAULT '[]'",
        "actual_json": "TEXT DEFAULT '[]'",
        "goals_json": "TEXT DEFAULT '{}'",
        "area_leaders_json": "TEXT DEFAULT '{}'",
        "notes": "TEXT DEFAULT ''",
        "handover": "TEXT DEFAULT ''",
        "food_safety_json": "TEXT DEFAULT '{}'",
        "tasks_json": "TEXT DEFAULT '{}'",
        "results_json": "TEXT DEFAULT '{}'",
        "cash_json": "TEXT DEFAULT '{}'",
    })

    conn.execute("""
        CREATE TABLE IF NOT EXISTS crew (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            spw_id INTEGER NOT NULL,
            area TEXT NOT NULL,
            name TEXT NOT NULL,
            station TEXT DEFAULT '',
            secondary_flex TEXT DEFAULT '',
            shift_start TEXT DEFAULT '',
            shift_end TEXT DEFAULT '',
            meal_time TEXT DEFAULT '',
            rest1_time TEXT DEFAULT '',
            rest2_time TEXT DEFAULT '',
            rest_count INTEGER DEFAULT 0,
            meal_sent INTEGER DEFAULT 0,
            rest1_sent INTEGER DEFAULT 0,
            rest2_sent INTEGER DEFAULT 0,
            meal_sent_at TEXT DEFAULT '',
            rest1_sent_at TEXT DEFAULT '',
            rest2_sent_at TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            profile_id INTEGER,
            FOREIGN KEY(spw_id) REFERENCES spw(id),
            FOREIGN KEY(profile_id) REFERENCES crew_profiles(id) ON DELETE SET NULL
        )
    """)
    add_missing_columns(conn, "crew", {
        "rest_count": "INTEGER DEFAULT 0",
        "meal_sent": "INTEGER DEFAULT 0",
        "rest1_sent": "INTEGER DEFAULT 0",
        "rest2_sent": "INTEGER DEFAULT 0",
        "meal_sent_at": "TEXT DEFAULT ''",
        "rest1_sent_at": "TEXT DEFAULT ''",
        "rest2_sent_at": "TEXT DEFAULT ''",
        "rest1_time": "TEXT DEFAULT ''",
        "rest2_time": "TEXT DEFAULT ''",
        "sort_order": "INTEGER DEFAULT 0",
        "profile_id": "INTEGER",
    })

    conn.execute("""
        CREATE TABLE IF NOT EXISTS crew_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE,
            notes TEXT DEFAULT '',
            skills_json TEXT DEFAULT '{}',
            flags_json TEXT DEFAULT '{}',
            updated_at TEXT DEFAULT ''
        )
    """)
    add_missing_columns(conn, "crew_profiles", {
        "flags_json": "TEXT DEFAULT '{}'",
    })
    conn.execute("CREATE INDEX IF NOT EXISTS idx_crew_spw_id ON crew(spw_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_spw_date_type ON spw(shift_date, shift_type)")
    # v11 enabled WAL. Convert existing databases back to the normal DELETE
    # journal so upgrades do not remain stuck in WAL mode on mounted storage.
    try:
        conn.execute("PRAGMA journal_mode=DELETE")
    except sqlite3.DatabaseError:
        pass
    conn.commit()
    conn.close()


init_db()


@app.route("/api/health")
def health():
    return jsonify({"ok": True})


@app.route("/")
def index():
    return send_from_directory(APP_DIR, "index.html")


@app.route("/api/spw/list")
def list_spw():
    conn = get_db()
    rows = conn.execute("SELECT id, shift_date, shift_type FROM spw ORDER BY shift_date DESC, shift_type").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


def spw_to_dict(row):
    d = dict(row)
    d["hours"] = json.loads(d.pop("hours_json") or "[]")
    d["projected"] = json.loads(d.pop("projected_json") or "[]")
    d["actual"] = json.loads(d.pop("actual_json") or "[]")
    d["goals"] = json.loads(d.pop("goals_json") or "{}")
    d["area_leaders"] = json.loads(d.pop("area_leaders_json") or "{}")
    d["food_safety"] = json.loads(d.pop("food_safety_json", "{}") or "{}")
    d["tasks"] = json.loads(d.pop("tasks_json", "{}") or "{}")
    d["results"] = json.loads(d.pop("results_json", "{}") or "{}")
    d["cash"] = json.loads(d.pop("cash_json", "{}") or "{}")
    return d


@app.route("/api/spw")
def get_spw():
    shift_date = request.args.get("date")
    shift_type = request.args.get("shift_type")
    conn = get_db()
    row = conn.execute("SELECT * FROM spw WHERE shift_date=? AND shift_type=?", (shift_date, shift_type)).fetchone()
    if not row:
        conn.close()
        return jsonify(None)
    spw = spw_to_dict(row)
    crew = conn.execute("SELECT * FROM crew WHERE spw_id=? ORDER BY sort_order, id", (spw["id"],)).fetchall()
    conn.close()
    spw["crew"] = [dict(c) for c in crew]
    return jsonify(spw)


@app.route("/api/spw/ensure", methods=["POST"])
def ensure_spw():
    data = request.get_json() or {}
    shift_date = data.get("shift_date")
    shift_type = data.get("shift_type")
    if not shift_date or not shift_type:
        return jsonify({"error": "shift_date and shift_type required"}), 400
    if shift_type not in VALID_SHIFT_TYPES:
        return jsonify({"error": "Invalid shift type"}), 400
    conn = get_db()
    row = conn.execute("SELECT id FROM spw WHERE shift_date=? AND shift_type=?", (shift_date, shift_type)).fetchone()
    if row:
        spw_id = row["id"]
    else:
        cur = conn.execute(
            "INSERT INTO spw (shift_date, shift_type, goals_json) VALUES (?, ?, ?)",
            (shift_date, shift_type, json.dumps(DEFAULT_GOALS)),
        )
        spw_id = cur.lastrowid
        conn.commit()
    conn.close()
    return jsonify({"id": spw_id})


@app.route("/api/spw/<int:spw_id>", methods=["PUT"])
def update_spw(spw_id):
    data = request.get_json() or {}
    conn = get_db()
    conn.execute("""
        UPDATE spw SET shift_manager=?, safety_champion=?, hours_json=?, projected_json=?, actual_json=?,
        goals_json=?, area_leaders_json=?, notes=?, handover=?, food_safety_json=?, tasks_json=?, results_json=?, cash_json=? WHERE id=?
    """, (
        data.get("shift_manager", ""), data.get("safety_champion", ""),
        json.dumps(data.get("hours", [])), json.dumps(data.get("projected", [])), json.dumps(data.get("actual", [])),
        json.dumps(data.get("goals", {})), json.dumps(data.get("area_leaders", {})),
        data.get("notes", ""), data.get("handover", ""),
        json.dumps(data.get("food_safety", {})), json.dumps(data.get("tasks", {})), json.dumps(data.get("results", {})),
        json.dumps(data.get("cash", {})), spw_id,
    ))
    conn.commit()
    conn.close()
    return "", 204


CREW_FIELDS = [
    "area", "name", "station", "secondary_flex", "shift_start", "shift_end",
    "meal_time", "rest1_time", "rest2_time", "rest_count", "sort_order", "profile_id"
]


@app.route("/api/crew", methods=["POST"])
def add_crew():
    data = request.get_json() or {}
    if not data.get("spw_id") or not data.get("name"):
        return jsonify({"error": "spw_id and name required"}), 400
    error = validate_crew_data(data)
    if error:
        return jsonify({"error": error}), 400
    conn = get_db()
    if data.get("profile_id") and not conn.execute("SELECT 1 FROM crew_profiles WHERE id=?", (data.get("profile_id"),)).fetchone():
        conn.close()
        return jsonify({"error": "Linked crew profile no longer exists"}), 400
    cur = conn.execute("""
        INSERT INTO crew (spw_id, area, name, station, secondary_flex, shift_start, shift_end,
                          meal_time, rest1_time, rest2_time, rest_count, sort_order, profile_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data["spw_id"], data.get("area", ""), data["name"], data.get("station", ""),
        data.get("secondary_flex", ""), data.get("shift_start", ""), data.get("shift_end", ""),
        data.get("meal_time", ""), data.get("rest1_time", ""), data.get("rest2_time", ""),
        int(data.get("rest_count", 0) or 0), int(data.get("sort_order", 0) or 0), data.get("profile_id") or None,
    ))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return jsonify({"id": new_id}), 201


@app.route("/api/crew/<int:crew_id>", methods=["PUT"])
def update_crew(crew_id):
    data = request.get_json() or {}
    error = validate_crew_data(data)
    if error:
        return jsonify({"error": error}), 400
    conn = get_db()
    if data.get("profile_id") and not conn.execute("SELECT 1 FROM crew_profiles WHERE id=?", (data.get("profile_id"),)).fetchone():
        conn.close()
        return jsonify({"error": "Linked crew profile no longer exists"}), 400
    row = conn.execute("SELECT * FROM crew WHERE id=?", (crew_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Crew member not found"}), 404
    vals = {field: data.get(field, row[field] if field in row.keys() else "") for field in CREW_FIELDS}
    conn.execute("""
        UPDATE crew SET area=?, name=?, station=?, secondary_flex=?, shift_start=?, shift_end=?,
                        meal_time=?, rest1_time=?, rest2_time=?, rest_count=?, sort_order=?, profile_id=? WHERE id=?
    """, (
        vals["area"], vals["name"], vals["station"], vals["secondary_flex"], vals["shift_start"], vals["shift_end"],
        vals["meal_time"], vals["rest1_time"], vals["rest2_time"], int(vals["rest_count"] or 0), int(vals["sort_order"] or 0), vals.get("profile_id") or None, crew_id,
    ))
    conn.commit()
    conn.close()
    return "", 204


@app.route("/api/crew/bulk", methods=["PUT"])
def bulk_update_crew():
    data = request.get_json() or {}
    items = data.get("items", [])
    if not isinstance(items, list):
        return jsonify({"error": "items must be a list"}), 400
    conn = get_db()
    try:
        for data_item in items:
            crew_id = data_item.get("id")
            if not crew_id:
                continue
            row = conn.execute("SELECT * FROM crew WHERE id=?", (crew_id,)).fetchone()
            if not row:
                continue
            vals = {field: data_item.get(field, row[field] if field in row.keys() else "") for field in CREW_FIELDS}
            conn.execute("""
                UPDATE crew SET area=?, name=?, station=?, secondary_flex=?, shift_start=?, shift_end=?,
                                meal_time=?, rest1_time=?, rest2_time=?, rest_count=?, sort_order=?, profile_id=? WHERE id=?
            """, (
                vals["area"], vals["name"], vals["station"], vals["secondary_flex"],
                vals["shift_start"], vals["shift_end"], vals["meal_time"], vals["rest1_time"],
                vals["rest2_time"], int(vals["rest_count"] or 0), int(vals["sort_order"] or 0), vals.get("profile_id") or None, crew_id,
            ))
        conn.commit()
    finally:
        conn.close()
    return "", 204


@app.route("/api/crew/reorder", methods=["PUT"])
def reorder_crew():
    data = request.get_json() or {}
    items = data.get("items", [])
    conn = get_db()
    for item in items:
        conn.execute("UPDATE crew SET area=?, station=?, sort_order=? WHERE id=?", (
            item.get("area", ""), item.get("station", ""), int(item.get("sort_order", 0)), item.get("id")
        ))
    conn.commit()
    conn.close()
    return "", 204


@app.route("/api/crew/<int:crew_id>/breaks", methods=["PUT"])
def update_crew_break(crew_id):
    data = request.get_json() or {}
    field = data.get("field")
    if field not in ("meal_sent", "rest1_sent", "rest2_sent"):
        return jsonify({"error": "Invalid crew break field"}), 400
    sent = 1 if data.get("sent") else 0
    time_field = field.replace("_sent", "_sent_at")
    sent_at = data.get("sent_at") or (datetime.now().isoformat(timespec="minutes") if sent else "")
    conn = get_db()
    conn.execute(f"UPDATE crew SET {field}=?, {time_field}=? WHERE id=?", (sent, sent_at if sent else "", crew_id))
    conn.commit()
    conn.close()
    return jsonify({"sent": bool(sent), "sent_at": sent_at if sent else ""})


@app.route("/api/crew/<int:crew_id>", methods=["DELETE"])
def delete_crew(crew_id):
    conn = get_db()
    conn.execute("DELETE FROM crew WHERE id=?", (crew_id,))
    conn.commit()
    conn.close()
    return "", 204


@app.route("/api/profiles")
def profiles():
    conn = get_db()
    rows = conn.execute("SELECT * FROM crew_profiles ORDER BY name COLLATE NOCASE").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["skills"] = json.loads(d.pop("skills_json") or "{}")
        d["flags"] = json.loads(d.pop("flags_json", "{}") or "{}")
        result.append(d)
    return jsonify(result)


@app.route("/api/profiles", methods=["POST"])
def save_profile():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name required"}), 400
    if len(name) > 80:
        return jsonify({"error": "Name is too long"}), 400
    skills = data.get("skills", {}) if isinstance(data.get("skills", {}), dict) else {}
    flags = data.get("flags", {}) if isinstance(data.get("flags", {}), dict) else {}
    notes = str(data.get("notes", ""))[:4000]
    updated = datetime.now().isoformat(timespec="seconds")
    conn = get_db()
    existing = conn.execute("SELECT id, notes, skills_json, flags_json FROM crew_profiles WHERE name=? COLLATE NOCASE", (name,)).fetchone()
    if existing:
        if skills == {} and flags == {} and notes == "":
            profile_id = existing["id"]
        else:
            conn.execute("UPDATE crew_profiles SET name=?, notes=?, skills_json=?, flags_json=?, updated_at=? WHERE id=?",
                         (name, notes, json.dumps(skills), json.dumps(flags), updated, existing["id"]))
            profile_id = existing["id"]
    else:
        cur = conn.execute("INSERT INTO crew_profiles (name, notes, skills_json, flags_json, updated_at) VALUES (?, ?, ?, ?, ?)",
                           (name, notes, json.dumps(skills), json.dumps(flags), updated))
        profile_id = cur.lastrowid
    # Link older shift rows that used the same exact crew name before profile IDs existed.
    conn.execute("UPDATE crew SET profile_id=? WHERE profile_id IS NULL AND name=? COLLATE NOCASE", (profile_id, name))
    conn.commit()
    conn.close()
    return jsonify({"id": profile_id})


@app.route("/api/profiles/<int:profile_id>", methods=["PUT"])
def update_profile(profile_id):
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name required"}), 400
    if len(name) > 80:
        return jsonify({"error": "Name is too long"}), 400
    skills = data.get("skills", {}) if isinstance(data.get("skills", {}), dict) else {}
    flags = data.get("flags", {}) if isinstance(data.get("flags", {}), dict) else {}
    notes = str(data.get("notes", ""))[:4000]
    updated = datetime.now().isoformat(timespec="seconds")
    conn = get_db()
    row = conn.execute("SELECT id FROM crew_profiles WHERE id=?", (profile_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Crew profile not found"}), 404
    clash = conn.execute("SELECT id FROM crew_profiles WHERE name=? COLLATE NOCASE AND id<>?", (name, profile_id)).fetchone()
    if clash:
        conn.close()
        return jsonify({"error": "Another crew profile already uses that name"}), 409
    conn.execute("UPDATE crew_profiles SET name=?, notes=?, skills_json=?, flags_json=?, updated_at=? WHERE id=?",
                 (name, notes, json.dumps(skills), json.dumps(flags), updated, profile_id))
    # Keep linked shift records readable and consistent after a profile rename.
    conn.execute("UPDATE crew SET name=? WHERE profile_id=?", (name, profile_id))
    conn.commit()
    conn.close()
    return "", 204


@app.route("/api/profiles/<int:profile_id>", methods=["DELETE"])
def delete_profile(profile_id):
    conn = get_db()
    conn.execute("DELETE FROM crew_profiles WHERE id=?", (profile_id,))
    conn.commit()
    conn.close()
    return "", 204


@app.errorhandler(404)
def not_found(_):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(sqlite3.OperationalError)
def database_operational_error(err):
    message = str(err)
    app.logger.exception("SQLite operational error: %s", message)
    lower = message.lower()
    if "locked" in lower or "busy" in lower:
        return jsonify({"error": "Database is busy. Please try the change again."}), 503
    if "readonly" in lower or "read-only" in lower:
        return jsonify({"error": "Database is read-only. Check that /mnt/media/spw is writable by Docker."}), 500
    return jsonify({"error": f"Database error: {message}"}), 500


@app.errorhandler(sqlite3.IntegrityError)
def database_constraint_error(err):
    app.logger.warning("Database constraint error: %s", err)
    return jsonify({"error": "That change conflicts with existing SPW data"}), 409


@app.errorhandler(500)
def server_error(err):
    app.logger.exception(err)
    return jsonify({"error": "The server could not complete that request"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, threaded=True)
