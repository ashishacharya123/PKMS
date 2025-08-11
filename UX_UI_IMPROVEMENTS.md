# UX/UI Improvements Log

- Date: 2025-08-09
- AI Agent: GPT-5 (via Cursor)

## Notes Module
- View/Edit Separation: Added `NoteViewPage` at `/notes/:id` and kept editor at `/notes/:id/edit`.
- Post-Create Flow: After creating a note, navigate to `/notes` with brief highlight of the new card.
- Delete UX: Replaced `window.confirm` with Mantine confirm modal; added success/error toasts.
- Archive UX: Archive/unarchive with toasts and cache invalidation.
- Productivity: Ctrl/Cmd+S to save in editor; 2s debounce autosave for edits.
- List UX: Restores scroll position when navigating back from view/edit.

Files: `src/pages/NoteViewPage.tsx`, `src/pages/NoteEditorPage.tsx`, `src/pages/NotesPage.tsx`, `src/App.tsx`, `src/main.tsx`, `src/styles/mantine-override.css`

## Todos Module
- Delete UX: Replaced `window.confirm` with Mantine confirm modal; added success/error toasts.

Files: `src/pages/TodosPage.tsx`

## Shared Infrastructure
- Modals Provider: Wrapped app with `ModalsProvider` to enable confirm modals.
- Styling: Added `.newly-created-highlight` animation.

Files: `src/main.tsx`, `src/styles/mantine-override.css`

## Future Consistency Targets
- Documents: Replace `window.confirm` with confirm modal and add toasts on delete; preserve scroll and highlight on upload.
- Diary: Introduce a `DiaryViewPage` for read-only content once decrypted; reuse shared components for header/actions.
- Shared Components: Extract reusable `ContentHeader`, `TagBadges`, and `ConfirmDeleteAction` components to standardize across modules.
