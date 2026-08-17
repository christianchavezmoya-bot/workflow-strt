# Known bugs

A running list of problems found while working through
[`EXCELLENCE_PROGRAMME.md`](./EXCELLENCE_PROGRAMME.md).

**The rule:** if a bug stops the programme, we fix it immediately and then carry on. If it does not,
it gets written down here and fixed after the programme is complete. This keeps small problems from
derailing the plan while making sure none of them are quietly forgotten.

Add a row when a bug is found. Move it to [Fixed](#fixed) when it is resolved — do not delete it, so
there is a record.

## Open

| # | Found | Stage | What is wrong | Who it affects | Blocking? | Notes |
|---|---|---|---|---|---|---|
| 3 | 2026-08-17 | Bug sweep | Every signed-in user can retrieve **every issue in the whole system**, with no filter by project or office | All users — anyone signed in sees more than they should | No | Scheduled to be fixed in stage S6. Recorded here so it is not forgotten if S6 slips |
| 4 | 2026-08-17 | Bug sweep | The office list (country and city) is readable by anyone, without signing in | Nobody directly — it is company information, not customer data | No | **S2 verdict:** intentional — see [`S2_PRODUCT_DECISIONS.md`](./S2_PRODUCT_DECISIONS.md). Optional auth hardening deferred to S6 |
| 5 | 2026-08-17 | Bug sweep | When something goes wrong on the server, the app can get five different shapes of error message back, so it often cannot tell the user what actually happened | Any user hitting an error | No | Scheduled for stage S5 |

## Fixed

| # | Found | Fixed | What was wrong | Where |
|---|---|---|---|---|
| A | 2026-08-17 | 2026-08-17 | The staging web app on `localhost:5174` looked for the server on the wrong port and could not reach it | PR #193 |
| B | 2026-08-17 | 2026-08-17 | The iPhone project would not build from a fresh copy of the code, because file paths had been saved in Windows format | PR #196 |
| C | 2026-08-17 | 2026-08-17 | Cancelled downloads were being reported as app crashes, filling up the fault log with noise. Confirmed live: report `FR-TFC685` on staging is exactly this — an `AbortError` logged as a fault | PR #197 |
| D | 2026-08-17 | 2026-08-17 | The Android app icon pointed at a background image that does not exist, so the icon rendered without its background | PR #201 |
| E | 2026-08-17 | 2026-08-17 | Opening a fault report crashed the admin screen (unguarded breadcrumb JSON parse). Fixed by the Fault Reports page rewrite with staircase history | PRs #192, #198 |
| F | 2026-08-17 | 2026-08-17 | Product-features picker in WorkflowBuilder looked like a bug but was **deliberately retired** when the step-type auto-populate system shipped (commit `661d98a`). Delete dead code in S8 — do not re-enable | [`S2_PRODUCT_DECISIONS.md`](./S2_PRODUCT_DECISIONS.md) |
| G | 2026-08-17 | 2026-08-17 | `xlsx` advisories: **accept contained risk** until S9; only one parse path (`AssetDocumentsDialog`); migrate to `exceljs` in S9 | [`S2_PRODUCT_DECISIONS.md`](./S2_PRODUCT_DECISIONS.md) |
