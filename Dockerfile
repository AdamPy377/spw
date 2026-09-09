FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py backup.py notifications.py index.html styles.css manifest.json sw.js icon-192.png icon-512.png ./
COPY js ./js

ENV DATA_DIR=/data \
    PYTHONUNBUFFERED=1

EXPOSE 3000

# The live SQLite database is mounted from local host storage. One worker keeps
# SQLite writes within a single process; four threads allow concurrent requests.
# WAL mode in app.py supports concurrent readers while a write is in progress.
CMD ["gunicorn", "--bind", "0.0.0.0:3000", "--worker-class", "gthread", "--workers", "1", "--threads", "4", "--timeout", "60", "--access-logfile", "-", "--error-logfile", "-", "app:app"]
