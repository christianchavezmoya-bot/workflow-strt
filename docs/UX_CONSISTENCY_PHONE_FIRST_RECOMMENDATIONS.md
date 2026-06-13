# Commtrac UX Consistency Recommendations

## Scope

This document provides product and UX recommendations only. It does not propose code changes. The focus is phone-first usability, with web browser behavior aligned to the same workflow model.

The goal is to make paused runs, issues, high observation issues, missing media, and signatures:

- consistent across screens
- easy to find
- easy to fix
- intuitive on phone first

## Executive Summary

The dashboard layer is relatively consistent today. It already uses repeated patterns such as counts, chips, attention cards, and grouped workflow signals. This is especially true in the dashboard treatment of:

- paused runs
- blocking issues
- pending signatures
- high observations
- missing media alerts

The inconsistency starts after the user leaves the dashboard and tries to take action on a specific asset or run. The app often tells the user that a problem exists, but the repair path is split across multiple screens:

- dashboard
- asset list
- run history
- workflow runner
- project chevron
- issues board

That fragmentation is the main UX problem.

## Important Confirmation

The dashboard is more consistent than the rest of the app.

This is supported by the current code:

- paused runs are consistently counted and labeled on the dashboard
- blocking issues are elevated into dedicated attention widgets
- high-severity non-blocking observations are already tracked as their own dashboard signal
- pending signatures are grouped into visible attention areas

The dashboard therefore already points toward the right product direction. The rest of the app should be brought up to the same standard.

## Implemented Model

The current implementation now uses a permission-based field workflow model.

This means:

- users still keep one primary role
- users do not need a second role such as `Installer + Engineer`
- field workflow behavior is controlled by role permission
- the relevant permission is `Assets > Field User Workflow`
- assigned users with that permission can behave like field technicians on their assets

Examples:

- an `Engineer` with `Assets > Field User Workflow` can act as a field user on assigned assets
- a `Supervisor` with that permission can do the same
- a `Project Manager` can also do this if the role is configured that way

This is now the recommended product model for field execution.

## Phone-First Design Principle

The phone app should be treated as the primary workflow experience, not as a smaller version of the web app.

For field users, the phone experience should optimize for:

- fastest path to next required action
- minimal navigation depth
- large, obvious action buttons
- one-screen repair flows
- status plus action shown together

The browser can expose more detail and oversight, but it should not use a different mental model.

## Core UX Principle

For every asset, every screen should answer two questions immediately:

1. What is wrong or pending?
2. What is the next action?

A professional app does not only show status. It pairs status with the exact repair action.

## Recommended Universal State Model

Every asset should use the same operational states everywhere in the app.

### Primary states

- Not Started
- In Progress
- Paused
- Complete
- Issue
- Awaiting Signature
- Missing Media

### Attention states

- Blocking Issue
- High Observation Issue
- Non-Blocking Issue
- Missing Media
- Pending Installer Signature
- Pending Customer Signature

### Definitions

- Blocking Issue
  Prevents completion and must be closed before the run can be locked.

- High Observation Issue
  Does not block completion, but is still high importance and should be elevated in UX. This already exists conceptually on the dashboard and should remain a distinct state everywhere else.

- Non-Blocking Issue
  Observation or lower-severity attention item that should be visible but should not interrupt the workflow unless the user chooses to review it.

- Missing Media
  Required photo or video evidence was not captured, but the run may still have completed. The app must make repair straightforward.

## Recommended Universal Action Model

For every asset, use one primary action and up to two secondary actions. The labels must be identical on phone and web.

### Priority order

1. Paused -> `Resume Run`
2. Blocking issue open -> `Resolve Blocking Issue`
3. Missing media -> `Add Missing Photos`
4. Pending installer signature -> `Installer Sign Off`
5. Pending customer signature -> `Send or Capture Signature`
6. High observation issue open -> `Review High Observation`
7. In progress -> `Continue Run`
8. Not started -> `Start Run`

This same priority logic should be reused on:

- dashboard quick actions
- asset cards
- asset detail page
- run history header
- mobile home widgets

## Standard Labels

The app should standardize labels everywhere.

### Recommended labels

- `Resume Run`
- `Pause Run`
- `Resolve Blocking Issue`
- `Review High Observation`
- `Review Issues`
- `Add Missing Photos`
- `Field Sign Off`
- `Customer Signature`
- `Send Signature Link`
- `View Run Details`

### Labels to avoid mixing

- `Continue` when the real intent is `Resume Run`
- `Review` when the real intent is `Resolve Issue`
- `Upload Media` in one place and `Add Missing Photos` in another
- `Awaiting Sig` in some places and `Pending Customer` in others unless space-constrained

## Recommended Shared UI Pattern

Every asset surface should include the same structural elements.

### Asset status block

- one main status chip
- one sub-status chip if needed
- one short condition sentence
- one primary action button
- one secondary details button

### Example

Asset: `RC-TEST-001`

- Main status: `Paused`
- Attention chips: `1 Blocking Issue`, `2 Photos Missing`
- Summary line: `Paused at Step 2 · 1 blocking issue · 2 missing photos`
- Primary action: `Resolve Blocking Issue`
- Secondary action: `Resume Run`

That is much more intuitive than forcing the user to inspect several unrelated pages.

## Page-by-Page Recommendations

## 1. Dashboard

### Assessment

The dashboard is one of the strongest UX areas today.

### Keep

- overview counts
- grouped attention cards
- workload chips
- paused indicators
- high observation visibility
- pending signature visibility

### Improve

- every dashboard attention item should deep-link to one exact repair screen
- dashboard should never be the only place where a repair action exists
- phone dashboard should summarize and route, not become the only operational surface

### Recommendation

Use dashboard as the summary layer, but move the actual repair workflow into asset and run screens.

### Implemented direction

Dashboard attention items should deep-link to the exact repair surface for the selected asset and run, not only to broad pages such as `Issues` or `Assets`.

## 2. Asset List / Installations Page

### Assessment

This should become the main action hub for both phone and browser.

### Why it matters

This is where users already think about assets, assignment, progress, and status.

### Recommended changes

Each asset row or card should show:

- main status
- attention badges
- one-line operational summary
- one dominant CTA based on the highest-priority need

### Required phone-first behavior

If an asset has missing media:

- show badge: `Missing Photos`
- show primary button: `Add Missing Photos`
- open directly into the missing-photo repair flow for that asset and run

If an asset has a blocking issue:

- show badge: `Blocking Issue`
- show primary button: `Resolve Blocking Issue`

If an asset has a high observation issue:

- show badge: `High Observation`
- show primary button: `Review High Observation`

If an asset is paused:

- show badge: `Paused`
- show primary button: `Resume Run`

If an asset is awaiting customer signature:

- show badge: `Pending Customer Signature`
- show primary button: `Send or Capture Signature`

### Professional-app expectation

The asset list should not only describe the problem. It should be the fastest place to fix it.

### Implemented direction

The installations asset page is now the main deep-link repair surface for:

- issue review
- pending sign-off
- missing-photo recovery
- run history access

Other pages should route into this exact asset-level repair flow.

## 3. Asset Detail Page

### Recommendation

Introduce a single action panel near the top of the asset detail experience.

### Contents

- current run status
- open issues summary
- missing media summary
- signature summary
- next action button

### Example actions

- `Resume Run`
- `Resolve 2 Issues`
- `Add 3 Missing Photos`
- `Send Customer Signature Link`

### Why

This gives users a predictable place to go whenever the asset is not complete.

## 4. Workflow Run History

### Assessment

Run history currently shows useful status, but it should become the canonical run recovery page.

### Recommended changes

At the selected run level, show a dedicated action bar:

- `Resume Run`
- `Resolve Issues`
- `Add Missing Photos`
- `Installer Sign Off`
- `Customer Signature`

### Why

If users open run history, they are already in troubleshooting or continuation mode. The next actions should be obvious.

### Phone-first rule

Do not force the user to leave run history and hunt elsewhere for the repair path.

## 5. Workflow Runner

### Assessment

The runner is strong for active step-by-step execution, but weaker for recovery and cross-step repair awareness.

### Recommended changes

Add a persistent top strip during execution:

- run state
- issues count
- blocking issue count
- high observation count
- missing media warning for current step

### Recommended behavior

- `Pause Run` should always be called `Pause Run`
- resuming the workflow should always be called `Resume Run`
- time tracking terms like `Resume Productive` should stay inside time-tracking UI, not replace workflow language

### High observation issues

High observation issues should not be treated like ordinary low-severity observations in UX. They should:

- remain non-blocking
- get elevated color and icon treatment
- appear above low/medium observations
- be visible in summaries and asset action panels

## 6. Issues Board

### Assessment

The Issues Board is useful and should remain, especially for PM/Admin and browser users.

### Recommendation

Treat it as a cross-project oversight and batch-management tool, not the primary repair flow for field users.

### Phone-first rule

Field users should be able to resolve issues directly from:

- asset card
- asset detail
- active run

The Issues Board should be optional, not mandatory, for core work.

## 7. Missing Media Flow

### Assessment

This is the weakest experience today.

### Product problem

Users can detect missing media, but the repair flow is not centered around the asset where the user is working.

### Professional-app behavior

If an asset is missing pictures, the app should show:

- exact count of missing photos
- exact step names
- exact required capture labels
- one clear repair button

### Recommended phone flow

Tap asset card -> `Add Missing Photos` -> open missing-photo sheet

The sheet should show:

- Step 1 - `Nameplate Photo`
- Step 2 - `Cable Termination Photo`
- Step 3 - `Final Install Photo`

Each row should have:

- status
- thumbnail if already captured
- `Add Photo` button

### Rule

Do not make users find this through dashboard-only reminders.

## 8. Signature Flow

### Assessment

Signatures are visible, but action entry points are spread across too many locations.

### Recommendation

Unify signatures into one standard model:

- Pending Installer Signature -> `Installer Sign Off`
- Pending Customer Signature -> `Send or Capture Signature`
- Signed -> `Signed`
- Waived -> `Waived`

### Phone-first recommendation

On phone, the asset and run screens should make signatures feel like the last step of the same workflow, not a separate subsystem.

### Best practice

When a run completes:

- immediately show next sign-off step
- if incomplete later, asset page still shows the same next signature action
- browser and phone use the same labels and same flow order

## 9. High Observation Issues

### Why they matter

High observations are operationally important even if they do not block completion. The UX should reflect that.

### Recommended treatment

High observations should:

- be shown separately from low and medium observations
- use amber or orange warning styling
- appear in asset summaries and attention panels
- have a direct review action

### Recommended labels

- `High Observation`
- `Review High Observation`
- `1 High Observation Open`

### Recommended behavior

They should not block completion, but they should remain visible until reviewed or closed. They should never disappear into the same visual bucket as minor observations.

## Phone-First Navigation Recommendations

### Bottom tab and primary paths

Phone users should be able to reach all operational repair flows within 2 taps from:

- Home
- Assets
- Issues

### Recommended phone journey

#### For paused run

Home or Assets -> asset card -> `Resume Run`

#### For blocking issue

Home or Assets -> asset card -> `Resolve Blocking Issue`

#### For high observation

Home or Assets -> asset card -> `Review High Observation`

#### For missing photos

Home or Assets -> asset card -> `Add Missing Photos`

#### For signatures

Home or Assets -> asset card -> `Installer Sign Off` or `Send or Capture Signature`

### Rule

Users should not need to remember whether a problem is fixed from dashboard, history, project panel, or workflow runner.

## Consistency Rules for Web and Phone

The web browser and phone app should differ in layout only, not in workflow meaning.

### Must be the same

- state names
- icon meaning
- color meaning
- action labels
- action priority
- repair destination

### May differ

- density
- number of columns
- drawer vs dialog vs full page
- gesture support

### Example

Web may show a side panel.
Phone may show a bottom sheet.
But both should say:

- `Blocking Issue`
- `Resolve Blocking Issue`

not two different labels and two different mental models.

## Recommended Product Pattern

Create one conceptual `Asset Action Center`.

This can appear as:

- a card section on web
- a sticky action panel on phone

### It should always show

- current asset state
- current run state
- critical attention items
- next recommended action

This would unify:

- paused runs
- blocking issues
- high observations
- missing media
- signatures

into one predictable experience.

## Priority Recommendations

### Highest priority

1. Make asset screens the main repair surface
2. Add direct `Add Missing Photos` action on assets
3. Add direct `Resolve Blocking Issue` action on assets
4. Add direct `Review High Observation` action on assets
5. Standardize `Resume Run` naming everywhere

### Second priority

6. Make run history a complete repair screen
7. Align web and phone labels
8. Keep dashboard as summary and routing layer

### Third priority

9. Consolidate signature actions into one standard repair path
10. Improve issue and media repair discoverability from the workflow runner

## Ideal Future User Experience

For a phone field user:

- open app
- see assigned assets
- asset card clearly shows what needs attention
- tap one obvious button
- fix the issue without changing screens multiple times
- return to asset list with updated status

For a browser PM/Admin user:

- dashboard summarizes operational health
- click into asset or run
- see the same state model and same actions the field user sees
- manage oversight without learning a different system

## Final Recommendation

Use the dashboard as the model for consistency, then bring asset pages, run history, the workflow runner, and signature/media repair flows into the same design language.

The biggest design principle should be:

Status and action must always appear together.

If the app says:

- paused
- blocking issue
- high observation
- missing media
- pending signature

then the same screen should also present the exact next action the user should take.

That is the clearest path to a professional, intuitive, phone-first experience.
