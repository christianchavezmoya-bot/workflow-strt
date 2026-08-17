# The safety net: visual and performance baselines

This is stage **S0** of [`EXCELLENCE_PROGRAMME.md`](./EXCELLENCE_PROGRAMME.md), and it exists to
answer one question automatically:

> **Did the app change for the person using it?**

Everything else in the programme is a tidy-up. This is the thing that proves the tidy-up did no harm.

---

## Why it was needed

Before this existed, the automated checks could tell us:

- the code compiles
- the tests pass
- the app is not slower than a fixed limit
- a handful of screens still load

They could **not** tell us that a screen still *looks* the same, or that something got noticeably
slower while staying inside its limit. There were five screens covered out of roughly thirty-one, and
nothing at all watching layout.

Two new tools close that gap.

---

## Tool 1 — the visual baseline

Takes a photograph of every screen, at computer width and phone width, and keeps it. Next time it
runs, it takes fresh photographs and compares. If anything moved, it says so and shows you both
pictures side by side.

### The reference photographs

They have to be taken against a **real, running app with real data**, so they are produced on the
staging machine, not in the cloud. That is why they are not in the repository yet — they get created
the first time someone runs the command below and are then committed.

### Taking the first set

```bash
# 1. Start staging so there is a real app to photograph
./scripts/standup-staging.sh --build-web

# 2. Take the reference photographs
npm run test:e2e:visual -- --update-snapshots

# 3. Look through them, then keep them
open e2e/visual-baseline/            # macOS
git add e2e/visual-baseline && git commit -m "Record visual baseline"
```

**Look at them before committing.** A photograph of a broken screen becomes the definition of
"correct", and every later run will compare against that mistake.

### Checking for changes later

```bash
./scripts/standup-staging.sh --build-web
npm run test:e2e:visual
```

Passing means nothing moved. Failing means something did — open the report to see what:

```bash
open e2e-results/visual-report/index.html
```

You get three images for each difference: how it was, how it is now, and the two overlaid with the
changed pixels highlighted.

### When a change is intentional

If we deliberately changed a screen and everyone agreed to it, the reference photographs need
updating in the same pull request:

```bash
npm run test:e2e:visual -- --update-snapshots
```

The pull request must then say **why** the pictures changed, and the change must be written into the
divergence register in `EXCELLENCE_PROGRAMME.md`. Updating the pictures without explaining why
defeats the whole point.

### What it deliberately ignores

Some things on screen are supposed to change every time — clocks, "2 minutes ago", loading spinners.
Those areas are blanked out before comparing, so they do not cause false alarms, while any movement
*around* them is still caught.

If you add something new that changes on every render, mark it with `data-visual-volatile` and it
will be ignored too.

### Screens not covered, and why

| Screen | Reason |
|---|---|
| Any screen needing a record id (a specific project, asset or inspection) | The id differs on every machine, so the photograph would never match |
| The customer signing page and shared report links | Need a one-time link that is generated fresh each time |
| The phone upload page | Reached by scanning a QR code with a session code in it |
| The password reset page | Needs a link from an email |

These are listed in the test file itself with the same reasons, so nobody has to guess whether a
screen was forgotten or excluded on purpose.

---

## Tool 2 — the performance baseline

The existing speed checks are **limits**: fail if login takes more than X. Useful, but they cannot
notice that something got 30% slower while staying under the limit — which is exactly what a large
tidy-up tends to do.

This records the actual measured numbers so a later run can be compared to them.

### What it measures

- **How big each part of the app is when downloaded** (135 pieces, about 1.9 MB compressed in total)
- **How long login takes**, and how long the assets screen takes to show content — but only if a
  speed test has been run first

### Using it

```bash
npm run build
npm run perf:baseline:compare
```

It prints what changed and stops with an error if anything grew too much:

- any single piece of the app growing more than **10%**
- the whole app growing more than **5%**
- login or the assets screen getting more than **25%** slower

Small movements are printed as information, not failures, because some noise is normal.

### To include speed numbers

```bash
npm run test:e2e:web-perf     # measures and saves the numbers
npm run perf:baseline:record  # records them into the baseline
```

**One caveat.** Download sizes are the same on every machine, so they are committed and compared
anywhere. Speed numbers depend on the computer that measured them, so only compare those against a
baseline recorded on **that same computer**. The committed baseline has no speed numbers in it for
this reason, and speed comparison is simply skipped until someone records them locally.

### When growth is intentional

Adding a genuine feature makes the app bigger, and that is fine. Re-record in the same pull request
and say why:

```bash
npm run perf:baseline:record
git add e2e/perf-baseline.json
```

---

## Which file is which

| File | Committed? | What it is |
|---|---|---|
| `e2e/visual-baseline/*.png` | Yes | The reference photographs |
| `e2e/perf-baseline.json` | Yes | Recorded download sizes |
| `e2e-results/` | No | Throwaway output from the last run |

---

## Quick reference

| I want to… | Command |
|---|---|
| Check nothing changed visually | `npm run test:e2e:visual` |
| See what changed | `open e2e-results/visual-report/index.html` |
| Accept an intended visual change | `npm run test:e2e:visual -- --update-snapshots` |
| Check nothing got bigger or slower | `npm run build && npm run perf:baseline:compare` |
| Accept an intended size change | `npm run perf:baseline:record` |
| Take the very first photographs | `npm run test:e2e:visual -- --update-snapshots` |
