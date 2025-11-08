# final_fix_4 — Frontend fixes plan (detailed, rule-aligned)

Author: GPT-5
Date: 2025-10-28
Scope: Frontend test, components, pages, and API hygiene

## Principles and alignment
- Follow ARCHITECTURAL_RULES.md: security-first (HttpOnly cookies, optional Bearer), no brittle tests, small atomic edits, explicit commits, no hidden side effects.
- Follow DEVELOPMENTAL_COMMENTS.md: symmetry and clarity in data flows, avoid class-name coupling, respect async patterns.
- Track changes in ERROR_FIX_DOCUMENTATION.md with GPT-5 attribution and list any removed functionality/files (none planned here).

## Summary of issues to fix
1) Tests assert Mantine internal CSS class names (brittle) in `Button.test.tsx`.
2) Missing `itemType` in `DeletionImpactDialog` effect deps; fetch uses localStorage token unconditionally and lacks credentials.
3) `HabitDashboard` refreshes only on visibility change; data can go stale during long active views.
4) `SessionTimeoutWarning` defaults were reduced in an unrelated PR (scope creep); restore or parameterize sensible defaults.
5) `DashboardPage` fetches RecentActivityTimeline but does not render it (dead code) — either render or remove.
6) `DiaryPage` lifecycle effect lists a stable action in deps; should be mount/unmount only.
7) `RecycleBinPage` effect doesn't depend on `showAll`; action buttons not gated by `deletedAt` in View All.
8) `api.ts` session-status uses duplicate `/api/v1` prefix (baseURL already includes it).

## Detailed implementation steps

### 1) Tests: Button variants should not assert internal CSS classes
- File: `pkms-frontend/src/components/__tests__/common/Button.test.tsx`
- Rationale: Avoid testing implementation details; assert behavior instead.
- Edits:
  - Replace `.toHaveClass('mantine-Button-filled')` and `.toHaveClass('mantine-Button-outline')` with presence/enablement assertions.
  - Keep click, disabled, and custom class tests intact.
- After:
  - Render with `variant="filled"`, expect button present and enabled; rerender with `variant="outline"`, expect present and enabled.
- Tests: Existing test file runs under Vitest; no snapshot changes.

### 2) DeletionImpactDialog: effect deps and auth headers
- File: `pkms-frontend/src/components/common/DeletionImpactDialog.tsx`
- Rationale: Ensure impact reloads when `itemType` changes; align fetch with cookie-first auth and optional Bearer.
- Edits:
  - Add `itemType` to the dependency array in the `useEffect` that calls `loadDeletionImpact`.
  - Change delete fetch:
    - Compute `token = localStorage.getItem('token')`.
    - Build headers with `Content-Type`, add `Authorization` only if token exists.
    - Add `credentials: 'include'` to send HttpOnly cookies.
- Tests: Manually verify that switching item type while the dialog is open reloads impact; deletion works with cookie auth.

### 3) HabitDashboard: visibility-aware periodic refresh
- File: `pkms-frontend/src/components/diary/HabitDashboard.tsx`
- Rationale: Avoid stale data during long active sessions.
- Edits:
  - In the visibility effect, retain the visibilitychange listener.
  - Add a `setInterval` (5 minutes) that calls `loadDashboardData()` when `document.hidden === false`.
  - Cleanup: clear interval and remove listener on unmount.
- Tests: Keep tab open >5 minutes and observe periodic refresh; verify no rapid loops when tab hidden.

### 4) SessionTimeoutWarning: restore defaults or parameterize
- File: `pkms-frontend/src/components/diary/SessionTimeoutWarning.tsx`
- Rationale: Prior defaults were 15m/2m; change during Recycle Bin PR was out-of-scope.
- Edits:
  - Set default props back to `sessionTimeoutSeconds = 900` and `warningThresholdSeconds = 120`.
  - Note: Component already accepts props for configurability.
- Tests: Verify warning appears ~2 minutes before lock; locking at 15 minutes if not extended.

### 5) DashboardPage: wire Recent Activity timeline or remove dead code
- File: `pkms-frontend/src/pages/DashboardPage.tsx`
- Rationale: Avoid unused imports/state; better to surface the timeline.
- Edits (Option A - render timeline):
  - Keep `activityTimeline` state.
  - Render a `Container` that shows a `Card` with `ActivityTimeline` when `activityTimeline` exists, above `MainDashboard`.
  - Add a refresh action icon to reload.
- Tests: UI shows a Recent Activity card when data present; clicking refresh reloads.

### 6) DiaryPage: mount/unmount effect deps
- File: `pkms-frontend/src/pages/DiaryPage.tsx`
- Rationale: Track diary page lifecycle only; Zustand action is stable.
- Edits:
  - Change dependency array from `[setOnDiaryPage]` to `[]`.
- Tests: Entering page sets onDiaryPage true; leaving sets it false; no extra re-runs.

### 7) RecycleBinPage: effect dependency and action gating in View All
- File: `pkms-frontend/src/pages/RecycleBinPage.tsx`
- Rationale: Reload list when `showAll` changes; prevent actions on active items in View All.
- Edits:
  - Change dependency array of `useEffect(loadItems)` to `[activeTab, showAll]`.
  - In `renderItemCard`, derive `isDeleted = Boolean(item.deletedAt)` and disable restore/hard-delete if not deleted.
  - Apply same gating in any other action blocks (e.g., 336-360 if duplicated).
- Tests: Toggling View All updates lists; buttons disabled for active items.

### 8) API service: fix duplicate prefix in session-status
- File: `pkms-frontend/src/services/api.ts`
- Rationale: Base URL already includes `/api/v1`; duplicated path breaks request.
- Edits:
  - Change `this.instance.get('/api/v1/auth/session-status')` to `this.instance.get('/auth/session-status')`.
- Tests: Call returns valid status; no 404 due to wrong path.

## Code quality checks
- Lint: `pnpm lint` or `npm run lint` (depending on project) — ensure no unused vars after refactors.
- Tests: Run Vitest/Jest suite for Button tests and any affected files.
- Typecheck: `tsc --noEmit` to confirm interface changes (none expected beyond props defaults).

## Security and UX notes
- Cookie-first auth reinforced; optional Bearer remains for local dev.
- Dashboard UI gains a periodic refresh to keep data relevant without heavy polling.
- Recycle Bin actions protected against misuse in View All mode.

## Rollback strategy
- Each change is isolated per file; revert individual files if issues arise.
- For Dashboard timeline, if layout issues occur, temporarily hide the card while retaining data fetch.

## Documentation updates
- ERROR_FIX_DOCUMENTATION.md: Log each fix with before/after summary; attribute to GPT-5.
- No file removals in this batch; note “none” in Removed Files section for this plan.

## Execution checklist
- [ ] Update Button.test.tsx (behavior-based assertions)
- [ ] DeletionImpactDialog: deps + credentials/include + optional Authorization header
- [ ] HabitDashboard: visibility-aware periodic refresh (5m)
- [ ] SessionTimeoutWarning: restore 15m/2m defaults
- [ ] DashboardPage: render ActivityTimeline card with refresh
- [ ] DiaryPage: mount/unmount-only useEffect
- [ ] RecycleBinPage: add showAll dep; gate actions by deletedAt
- [ ] api.ts: fix session-status path
- [ ] Lint, test, and typecheck
- [ ] Update ERROR_FIX_DOCUMENTATION.md (include GPT-5 and no removals)
