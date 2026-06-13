# Field Run QA Checklist

## Purpose

Use this checklist to verify the permission-based field workflow model.

The key rule is:

- users do not need a second role
- users act as field users when:
  - their role has `Assets > Field User Workflow` enabled
  - and they are assigned to the asset

## Admin Setup

1. Open `Admin > Roles`.
2. Edit a test role such as `Engineer`, `Supervisor`, or `Project Manager`.
3. In the `Assets` row, enable:
   - `view`
   - `field user workflow`
4. Save the role.
5. Assign a test user with that role to a test asset.

## Positive Tests

### 1. Dashboard field-user access

Expected:

- assigned user sees the field-user install workspace
- assigned asset appears in `My Jobs Today` or equivalent field-work area
- primary action follows workflow state

Check:

- `Start Run` for not-started asset
- `Resume Run` for paused asset
- `Add Missing Photos` for completed run with missing media
- `Complete Sign-off` for pending sign-off

### 2. Installations page actions

Expected:

- assigned user sees asset workflow actions on `Installations / Assets`
- actions appear even if the user is not literally named `Installer` or `Technician`

Check:

- workflow button visible on asset row
- workflow button visible in status/action popover
- action label matches the highest-priority state

### 3. Project my-work scope

Expected:

- user can use project `My Work` style behavior as a field participant
- assigned-asset projects appear in scoped views

### 4. Missing media flow

Expected:

- mobile/web field-user surfaces use `Add Missing Photos`
- PM/admin reminder action uses `Notify Field User`

Check:

- field user can open missing-photo repair directly
- PM/admin can send reminder from missing-media surfaces

### 5. Signature wording

Expected:

- user-facing signature UI says `Field Sign-off`
- pending signature badge says `Pending Field Sign-off`

## Negative Tests

### 1. Disable field workflow permission

1. Turn off `Assets > Field User Workflow` for the same role.
2. Log in again as the same assigned user.

Expected:

- field-user dashboard workflow surfaces are no longer available
- workflow execution actions are removed from the user-facing field workflow entry points

### 2. Unassigned asset

Expected:

- user should not gain field-user control over assets that are not assigned to them unless broader ownership/scope rules explicitly allow that page view

## Suggested Test Roles

- `Engineer` with permission off, then on
- `Supervisor` with permission on
- `Project Manager` with permission on
- `Installer` with permission on
- `Viewer` as control case

## Expected Outcome

The same field workflow should work for any assigned user whose role has the asset field-workflow permission, without requiring a secondary role or a hardcoded `Installer` / `Technician` check.
