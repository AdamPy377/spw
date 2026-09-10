# SPW v16.1

## v16.1 Live positioning fix

- Fixed upcoming Live previews filtering every crew member out because the real current time was used against a future shift.
- Upcoming previews now show the positioning at the first crew clock-on for that shift.
- Active shifts continue to show only crew who are genuinely on duty, preserving direct-relief swaps.
- Live area coverage scores now use the same displayed crew set as the positioning cards.

## v16.0 direct-relief handovers

- Detects direct relief when an incoming crew member starts within 15 minutes of the outgoing crew member finishing in the same area and position.
- Live mode now shows only crew who are actually on duty.
- During a short overlap, the outgoing crew member remains the single active position card and displays the incoming relief.
- Shows the handover from 30 minutes before clock-off and a completed-relief message for 15 minutes after the incoming crew member starts.
- Adds a Whole shift/time snapshot selector to Build/Edit. Snapshot views show only crew working at that time while preserving every roster record.
- Timed position assignments are respected when detecting relief and rendering snapshots.

## v15.9 break and crew-flow update

- Rebuilt break optimisation as a shift-wide plan instead of scheduling each crew member in isolation.
- Prevents meal/rest overlap between crew working in the same operational area.
- Prioritises first rest breaks as early as coverage allows and recognises same-area clock-ons as direct relief (for example, a 4:00–8:00 crew member can be sent at 5:00 when their relief starts).
- Uses actual/projected sales and peak avoidance only after coverage, timing rules and early-rest priority.
- Respects timed position assignments when determining which area a crew member belongs to at the proposed break time.

This release keeps the working storage/runtime setup from v15.7:

- Live SQLite database: `/home/adam/docker/spw/shifts.db`
- Network backups: `/mnt/media/spw/backups/`
- Gunicorn: 1 worker, 4 threads
- SQLite busy timeout: 5 seconds

## Changes carried forward from v15.8

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

## Updating from v15.9

Replace the files in your local Git repository with this release, then run:

```bash
git add -A
git commit -m "SPW v16.0 - direct-relief handovers"
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
5. Close and reopen the SPW PWA/browser tab once so service-worker cache v16.0 is active.

## Recommended crew handover workflow

Keep both the outgoing and incoming crew records in Build/Edit so their actual hours remain correct. Give them the same operational area/position when the incoming crew member is a direct replacement. Live mode is already time-aware: the outgoing person disappears at clock-off and the incoming person appears at clock-on, so a direct 8:00 handover does not require two permanent rows on the operating view. Use a timed position block only when the incoming person changes position after the handover.

There is no manual database move and the live database path must remain `/home/adam/docker/spw`.
