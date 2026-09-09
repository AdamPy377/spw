# SPW v15.8

This release keeps the working storage/runtime setup from v15.7:

- Live SQLite database: `/home/adam/docker/spw/shifts.db`
- Network backups: `/mnt/media/spw/backups/`
- Gunicorn: 1 worker, 4 threads
- SQLite busy timeout: 5 seconds

## Changes in v15.8

- Removed the entire **Next steps** list from Live SPW. The single **Next action** card in the command centre remains.
- Simplified area coverage detail to only show `Target X · Preferred Y`.
- Drawer counts can now be **edited or deleted** individually.
- Safe counts are now stored as count history and can be **edited or deleted** individually. Existing safe count/recount data is migrated in the frontend automatically when the shift is loaded.
- Added **Waste Count** as a standard check-off task on Day, Night and Overnight shifts.
- Added optional **break push notifications**, sent once approximately 5 minutes before each scheduled meal/rest break.
- Added a dedicated `position-board-notifications` worker container. It checks the local SQLite database every 30 seconds and only sends break reminders.

## Break notification setup

SPW generates and stores its own persistent VAPID Web Push key pair in:

- `/home/adam/docker/spw/vapid_private.pem`
- `/home/adam/docker/spw/vapid_public.txt`

No manual key generation is required.

Open the **Break Dashboard** and press **Enable** under Break notifications on each device that should receive reminders.

### HTTPS requirement

Browser/Web Push requires a secure HTTPS origin (except `localhost`). If you currently open SPW as `http://SERVER-IP:3000`, the rest of SPW will work normally, but push notifications cannot be enabled from that URL. You will need to expose SPW through HTTPS before device push notifications can work.

On iPhone/iPad, Web Push is intended for an installed Home Screen PWA. Install SPW to the Home Screen, open it from there, then enable notifications.

## Updating from v15.7

Replace the files in your local Git repository with this release, then run:

```bash
git add -A
git commit -m "SPW v15.8 - cash editing, waste count and break notifications"
git push
```

Then in Portainer:

1. Open **Stacks**.
2. Open the SPW stack.
3. Choose **Pull and redeploy**.
4. Confirm these containers are running:
   - `position-board`
   - `position-board-notifications`
   - `position-board-backup`
5. Close and reopen the SPW PWA/browser tab once so service-worker cache v15.8 is active.

There is no manual database move and the live database path must remain `/home/adam/docker/spw`.
