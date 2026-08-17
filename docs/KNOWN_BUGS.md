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
| 1 | 2026-08-17 | Bug sweep | The product-features picker in the workflow step editor is switched off by a hardcoded `false` in `WorkflowBuilder.tsx:2334`, so it can never appear | Anyone building a workflow — **if** it was meant to be available | No | Needs a yes/no answer from the product owner: was this retired on purpose, or disabled during debugging and never turned back on? Until we know, we cannot tell whether this is dead code or missing functionality |
| 2 | 2026-08-17 | Bug sweep | The `xlsx` spreadsheet library has two published security holes and **no fix exists** — the makers stopped publishing it to the usual place | Anyone importing a spreadsheet someone else sent them | No | Three ways out: install it from the makers' own site, swap it for a different library, or accept the risk and limit where files can be imported. Needs a decision |
| 3 | 2026-08-17 | Bug sweep | Every signed-in user can retrieve **every issue in the whole system**, with no filter by project or office | All users — anyone signed in sees more than they should | No | Scheduled to be fixed in stage S6. Recorded here so it is not forgotten if S6 slips |
| 4 | 2026-08-17 | Bug sweep | The office list (country and city) is readable by anyone, without signing in | Nobody directly — it is company information, not customer data | No | May well be deliberate, to fill the office dropdown on the login page. Needs confirming rather than assuming |
| 5 | 2026-08-17 | Bug sweep | When something goes wrong on the server, the app can get five different shapes of error message back, so it often cannot tell the user what actually happened | Any user hitting an error | No | Scheduled for stage S5 |

## Fixed

| # | Found | Fixed | What was wrong | Where |
|---|---|---|---|---|
| A | 2026-08-17 | 2026-08-17 | The staging web app on `localhost:5174` looked for the server on the wrong port and could not reach it | PR #193 |
| B | 2026-08-17 | 2026-08-17 | The iPhone project would not build from a fresh copy of the code, because file paths had been saved in Windows format | PR #196 |
| C | 2026-08-17 | 2026-08-17 | Cancelled downloads were being reported as app crashes, filling up the fault log with noise | PR #197 |
