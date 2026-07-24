# Installer offline quick reference

One-page handout for field installers. Full detail: [`OFFLINE_FIRST_UX.md`](./OFFLINE_FIRST_UX.md).

---

## Before you leave coverage

- Log in on the **phone app** with Wi‑Fi or strong cellular
- Wait until the sync badge shows **Synced** (field download runs in the background)
- Open each new assignment once, or confirm it appears under **My Jobs Today**
- Optional: open **Sync Center → Offline readiness** and tap **Download now** if data looks stale

---

## In the field (offline is OK)

- **Resume** workflows from Dashboard or Assets — you do not need signal for cached jobs
- Orange **Offline · ↑N** is normal — your work is saved on the phone
- Take all photos and complete steps; they upload when you reconnect
- **Work offline** toggle in Sync Center forces offline mode even on good signal (saves battery/data)

---

## Back online

- Open the app — sync starts automatically
- If the badge stays orange more than ~5 minutes, open **Sync Center**
- **Conflicts** (someone else edited the same record): choose **Keep my change** or **Accept server version**
- Customer **email** sign-off still needs a connection

---

## Never works offline

- First login on a new device
- Workflows not downloaded yet (see “hasn't been downloaded to this device” message)
- Customer email signature links
- Admin setup, user management, global search
- Document files not prefetched during field download

---

## When something looks wrong

1. Sync Center → check pending queue and conflicts  
2. Connect and tap **Download now** under Offline readiness  
3. Contact support with app version + screenshot of Sync Center

Related QA: [`FIELD_RUN_QA_CHECKLIST.md`](./FIELD_RUN_QA_CHECKLIST.md) · Release: [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md)
