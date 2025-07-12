# FTS5 & Fuzzy Search Refactor, Advanced Search UI, and Nepal Timezone Consistency

## Overview
This document summarizes the major changes and best practices implemented in the PKMS project, based on the recent refactor and feature additions:
- Migration to FTS5 for all text search in diary and archive modules
- Advanced fuzzy search across all modules using RapidFuzz
- Tag autocomplete with typo-tolerant fuzzy search
- Consistent use of Nepal timezone for all timestamps
- UI/UX improvements for search and filtering

---

## 1. FTS5 Search Refactor (Diary & Archive)
- **FTS5 virtual tables** and triggers were created for diary entries and archive folders.
- All text search (title, tags, metadata, description, mime type) in diary and archive modules now uses FTS5.
- Backend search endpoints for diary and archive were updated to leverage FTS5.
- **Frontend:** Folder tree UI now includes an FTS5-powered search bar with typo-tolerant search.

### Technical Details
- FTS5 tables and triggers ensure fast, typo-tolerant, and relevant search results.
- Search queries are now more robust and support partial/approximate matches.

---

## 2. Advanced Fuzzy Search (All Modules)
- **Backend:** New `/advanced-fuzzy-search` endpoint in a dedicated router, registered in `main.py`.
  - Supports a `modules` parameter for backend-side filtering (diary, archive, notes, documents, todos, projects).
  - Uses RapidFuzz for advanced fuzzy matching.
- **Frontend:**
  - Profile menu includes an “Advanced Fuzzy Search” option, opening a dedicated page.
  - Page features:
    - Search bar
    - Module checkboxes (backend filtering)
    - Excel-like filter cone for module column UI filtering
    - Sort dropdown (relevance, title, date)
  - Backend only searches selected modules; frontend allows further filtering and sorting.

### Best Practices
- Backend filtering reduces data transfer and improves performance.
- Frontend filtering/sorting enhances user experience.
- RapidFuzz provides typo-tolerance and high performance.

---

## 3. Tag Autocomplete Fuzzy Search
- **Backend:** `/tags/autocomplete` endpoint uses RapidFuzz for typo-tolerant tag suggestions.
- **Frontend:**
  - Advised to fetch suggestions from this endpoint for `<TagsInput />` components (TODO: implement in frontend).

---

## 4. Nepal Timezone Consistency
- All timestamps now use Nepal time (`NEPAL_TZ`).
- All instances of `datetime.now()` and `datetime.utcnow()` in backend and utility scripts were updated to `datetime.now(NEPAL_TZ)`.
- Ensures consistent, correct time display and file naming across backend, frontend, and scripts.

---

## 5. UI/UX and Implementation Best Practices
- Backend and frontend filtering/sorting are both supported for flexibility and performance.
- FTS5 and RapidFuzz are used for robust, typo-tolerant search.
- All changes are logged and documented as per project rules.
- Linter errors are fixed promptly.
- No major implementation changes or code deletions are made without user confirmation.

---

## 6. Outstanding TODOs
- [ ] Verify all debug and testing interface timestamps now show Nepal time.
- [ ] Update testing interface table to reflect the correct number of tables.
- [ ] Implement frontend tag autocomplete using `/tags/autocomplete` endpoint.

---

## 7. Files Affected
- Backend: `app/routers/diary.py`, `app/routers/archive.py`, `app/routers/advanced_fuzzy_search.py`, `app/routers/tags.py`, `app/main.py`, `app/services/fts_service.py`, `app/services/chunk_service.py`, `app/utils/diary_encryption.py`, `app/utils/security.py`, `app/scripts/reset_user.py`, `app/scripts/delete_test_user.py`
- Frontend: `src/components/archive/FolderTree.tsx`, `src/pages/AdvancedFuzzySearchPage.tsx`, `src/services/testingService.ts`, `src/components/shared/TestingInterface.tsx`, `src/components/shared/TagsInput.tsx` (planned)
- Documentation: `log.txt`, `Implementation.txt`, `done_till_now.txt`

---

## 8. References & Further Reading
- [FTS5 Documentation](https://sqlite.org/fts5.html)
- [RapidFuzz Documentation](https://maxbachmann.github.io/RapidFuzz/)
- [Nepal Timezone Handling in Python](https://pytz.sourceforge.net/)

---

*This document was generated based on the implementation and discussion history as of July 2025.* 