FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py backup.py index.html styles.css manifest.json sw.js icon-192.png icon-512.png ./
COPY js ./js

ENV DATA_DIR=/data \
    PYTHONUNBUFFERED=1

EXPOSE 3000

# SQLite is the application's shared datastore. One Gunicorn worker with
# a single request thread serialises SQLite writes and avoids lock contention
# on mounted storage. Gunicorn still provides production process supervision. If you later move to PostgreSQL, increase workers.
CMD ["gunicorn", "--bind", "0.0.0.0:3000", "--workers", "1", "--threads", "1", "--timeout", "60", "--access-logfile", "-", "--error-logfile", "-", "app:app"]
