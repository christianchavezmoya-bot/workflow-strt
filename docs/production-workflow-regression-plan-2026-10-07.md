# Production workflow/report regressions — 2026-10-07

Draft implementation plan for six production findings.

1. Report identity: use workflow type as authoritative report type; filename `<REPORT_TYPE>_<PROJECT_NUMBER>_<ASSET_TAG>_<WORKFLOW_NAME>.pdf`; apply consistently to every report export surface.
2. Optional media: omit uncaptured optional photo/video blocks; retain missing placeholder only for required media; render optional media when captured.
3. Issues/report layout: remove Type, Impact and Note from report table; give Description and Step/Item more width. Add shared numbering formatter: steps 1,2,3... and direct items 1.a,1.b...; never guess item when issue has only step reference. Remove on-screen Issues Board Type column without changing issue data/filter semantics.
4. Technician signature: trace signature-event fetch through every export path; render the actual installer signature image/data, never synthesize one; test customer-signed and customer-waived paths.
5. Blocking CTA: derive only from unresolved High/Blocking issues. Never use generic open-issue state as fallback. Resolved blocking + open Medium issues must not show Resolve Blocking Issue; preserve Closed status and other issue indicators.
6. Closed & Signed: use one final-signoff predicate: Closed + installer signed + customer signed OR valid authorized customer waiver/skip. Waiver must retain audit evidence and report as waived, never as a fabricated signature.

Tests: filename/header, optional media, issue columns/numbering, technician signature, blocking-state matrix, waived-signature eligibility. Require all seven protected-main checks and manual staging acceptance before merge/promotion.

Non-goals: no severity-policy redesign, no workflow-status redesign, no historical migration unless investigation proves waiver state was never persisted.
