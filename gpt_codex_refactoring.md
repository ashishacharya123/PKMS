# GPT Codex Refactoring Notes

## Diary Module Overhaul (Daily Metadata, Weather Codes, Templates)

### ✅ Backend – Diary Daily Metadata & Weather Codes
- [x] Rename/replace legacy `metrics_json` usage with structured daily snapshot handling (`DiaryDailyMetadata`).
- [x] Add `from_template_id` column to `DiaryEntry` for template lineage tracking.
- [x] Introduce canonical weather code enum (0 clear … 6 scorching_sun) with validation and defaults.
- [x] Refactor diary create/update routes to upsert `DiaryDailyMetadata`, link via `daily_metadata_id`, and drop legacy metadata fields.
- [x] Expose REST endpoints (`GET/PUT /diary/daily-metadata/{date}`) for dashboard wellness edits and caching.
- [x] Update Pydantic schemas/responses to surface daily metrics, weather code/labels, content length, and template references.
- [x] Confirm mood statistics remain entry-based; note future enhancements (aggregate from snapshots if needed).
- [x] Document router hardened.

#### 🔧 October 2025 Backend Stabilization
- **Documents router**
  - Fixed missing schema imports (`DocumentUpdate`, `CommitDocumentUploadRequest`, `ArchiveDocumentRequest`) so Docker builds don’t crash on import.
  - Removed the duplicated `delete_document` endpoint and cleaned helper fragments that were left from previous refactors.
  - Rebuilt `_handle_document_tags` to normalize tag names, increment counts for reused tags, decrement counts when tags are removed, and reinsert associations atomically.
  - Replaced emoji logging with plain English messages and ensured every SELECT that converts to a response preloads `tag_objs` via `selectinload`.
- **Diary list/search**
  - Batching helper `_get_tags_for_entries` now populates tags for both FTS and non-FTS listing paths.
  - Store/search responses align with `daily_metrics`/`weather_code` fields so frontend chips render correctly.
- **Diary service cleanup**
  - Imported missing `EncryptionSetupRequest`/`EncryptionUnlockRequest` schemas to stop NameErrors during startup.
  - Removed emoji logging throughout the router for grep-friendly output.
  - Fixed indentation in `_cleanup_expired_sessions` loop so background task no longer raises syntax errors at import time.
  - Fixed SlowAPI limiter error on uploads by adding `request: Request` to `upload_chunk` in `uploads.py`.
  - Corrected indentation in diary encryption status endpoint to avoid `expected 'except' or 'finally' block` syntax error.

### ✅ Frontend – Daily Snapshot & Weather Flow
- [x] Add `DiaryDailyMetadata`/`DiaryDailyMetrics` types and shared weather code constants.
- [x] Extend `diaryService` with daily metadata fetch/update helpers.
- [x] Update `diaryStore` to cache daily snapshots with setters/clearers and refresh after entry mutations.
- [x] Build entry modal “Daily Wellness Snapshot” panel with weather dropdown, location, refresh/save actions, and wellness controls.
- [x] Pre-fill diary form from cached snapshot; alert when snapshot missing and allow quick creation.
- [x] Persist `from_template_id` during create/update flows and reflect in summaries.

### ✅ Documentation & Logging
- [x] Backend/frontend work summarized above
- [x] Appended progress to `done_till_now.txt` (2025-10-09 00:00:00 +05:45)
- [x] Appended LOG #19 to `log.txt` with +05:45 timestamp

---

## 🎯 Final Steps to Production-Ready State

### Critical (Must Do Before Using)
1. **Database Migration**
   - [x] Fresh DB created by user (schema auto-created on startup)
   - **Status**: ✅ COMPLETE - User deleted old DB, new schema auto-initialized

2. **Frontend Daily Wellness Panel**
   - [x] Verified DiaryPage renders Daily Wellness Snapshot panel
   - [x] Weather dropdown implemented with weather codes (0-6)
   - [x] Daily metadata cached in store
   - **Status**: ✅ COMPLETE - UI implementation verified

3. **Smoke Test Core Flows**
   - [ ] Create diary entry → verify weather_code, daily_metadata_id, content_length saved
   - [ ] Upload diary media → verify UUID linking works
   - [ ] Search diary → verify tags_text populated and FTS returns results
   - [ ] Document upload/tag → verify tag usage_count increments/decrements correctly
   - **Why**: Ensure no runtime errors after all the refactoring

### Important (Should Do Soon)
4. **Remove Unused/Deprecated Code**
   - [ ] Search for any remaining references to `has_media` in frontend/backend (should be 0)
   - [ ] Remove `DiaryWellnessSnapshot` references if any still exist (renamed to `DiaryDailyMetadata`)
   - [ ] Clean up any commented-out code from refactoring
   - **Why**: Prevent confusion and reduce maintenance burden

5. **FTS Weather Column Fix**
   - [x] Updated `pkms-backend/app/services/fts_service_enhanced.py` line 67: changed `'weather'` to `'weather_code'`
   - [x] Updated UNINDEXED list to include `weather_code` and `is_template`
   - **Done**: DiaryEntry FTS now matches the actual model schema

6. **Tag Batching Verification**
   - [ ] Test diary/document/note/todo tag updates to ensure `_get_tags_for_entries` batching works
   - [ ] Verify tag autocomplete still functions across all modules
   - **Why**: Recent tag refactoring changed how tags are fetched

### Nice-to-Have (Polish)
7. **Error Handling & UX**
   - [ ] Add loading states for daily metadata fetch/save
   - [ ] Show user-friendly error messages if daily metadata fetch fails
   - [ ] Add "Create Daily Snapshot" quick action if missing when creating entry

8. **Performance Optimization**
   - [ ] Add index on `diary_daily_metadata(user_id, date)` if not already exists (should be from UNIQUE constraint)
   - [ ] Consider caching daily metadata on frontend for current day

9. **Documentation**
   - [ ] Update `tables_schema.sql` if not already done with final schema
   - [ ] Add API documentation for `/diary/daily-metadata` endpoints
   - [ ] Document weather code enum (0-6) for future reference

---

## 📊 Database Access & Management

### Why Docker Volume for Database?

**🚨 CRITICAL DESIGN DECISION**: The database is stored in a **Docker volume**, NOT a Windows filesystem bind mount.

This is a deliberate architectural choice to avoid **well-known SQLite + Docker + Windows issues**:

**Problems with SQLite on Windows Bind Mounts:**
- ❌ **File locking conflicts**: Windows NTFS locking ≠ Linux file locking
- ❌ **WAL mode failures**: No proper `mmap()` support through bind mount layers
- ❌ **Performance degradation**: 10-100x slower I/O (3 layers: Windows → WSL2 → Docker)
- ❌ **Database corruption**: Atomic writes not guaranteed on bind mounts
- ❌ **"database is locked" errors**: Under concurrent access

**Our Solution (Industry Best Practice):**
- ✅ **Database**: Docker volume (`pkms_db_data`) → Fast, reliable, proper locking
- ✅ **File storage**: Windows bind mount (`./PKMS_Data`) → Accessible for backups, media, user files
- ✅ **Separation of concerns**: Hot data (DB) vs. cold data (files)

### Accessing the Database

**Database Location:**
- **Inside Docker**: `/app/data/pkm_metadata.db`
- **Docker Volume**: `pkms_db_data:/app/data` (Linux ext4 filesystem)
- **File Storage**: `./PKMS_Data:/app/PKMS_Data` (Windows NTFS bind mount)

**Checking Users:**
```bash
# Use the helper script
python scripts/list_users.py

# Or copy database from Docker and inspect
docker compose cp pkms-backend:/app/data/pkm_metadata.db PKMS_Data/temp_db.db
python scripts/check_docker_db.py
```

**Current Status (2025-10-09 00:30 NPT):**
- Total tables: 66
- Users: 0 (fresh state - ready for first-time setup)
- All new tables present: `diary_daily_metadata`, FTS5 tables, etc.

**Deleting/Resetting Users:**
```bash
# Use the reset script (creates backup first)
python scripts/reset_user.py

# Or delete Docker volume and restart
docker compose down
docker volume rm pkms_db_data
docker compose up -d
```

**Backing Up the Database:**
```bash
# Method 1: Use the automated backup script (RECOMMENDED)
scripts\backup_db.bat

# Creates timestamped backup: pkm_metadata_backup_YYYYMMDD_HHMMSS.db
# Stored in: PKMS_Data/backups/

# Method 2: Manual backup using Docker CLI
docker compose cp pkms-backend:/app/data/pkm_metadata.db PKMS_Data/backups/manual_backup.db

# Verify backup integrity
python scripts/verify_backup.py pkm_metadata_backup_20251009_004113.db
```

**Restoring from Backup:**
```bash
# Method 1: Use the automated restore script (RECOMMENDED)
scripts\restore_db.bat pkm_metadata_backup_20251009_004113.db

# Script will:
# 1. Ask for confirmation (destructive operation!)
# 2. Stop Docker services
# 3. Replace database with backup
# 4. Restart Docker services

# Method 2: Manual restore (NOT RECOMMENDED - use script instead)
docker compose down
docker compose cp PKMS_Data/backups/your_backup.db pkms-backend:/app/data/pkm_metadata.db
docker compose up -d
```

**Backup System Status (2025-10-09):**
- ✅ **Backup scripts**: Fixed and working
- ✅ **Restore scripts**: Fixed and working  
- ✅ **Backend API**: `/api/v1/backup/*` endpoints available
- ✅ **Verification**: `scripts/verify_backup.py` validates backups
- ✅ **Storage**: Backups saved to `PKMS_Data/backups/` (Windows-accessible)
- ✅ **Issue Fixed**: Scripts now use `docker compose cp` instead of volume mounting

**References:**
- SQLite on Docker issues: https://github.com/docker/for-win/issues/445
- Best practices: https://docs.docker.com/storage/volumes/#use-a-volume-with-docker-compose

---

## 🚫 NOT Needed (Already Done or Not Applicable)

- ❌ Backward compatibility for legacy clients → **NOT NEEDED** (you confirmed this is a raw design phase)
- ❌ More emoji removal → **DONE** (cleaned main.py, fts_service_enhanced.py, documents.py, diary.py)
- ❌ Fix SlowAPI errors → **DONE** (uploads.py fixed)
- ❌ Fix diary syntax errors → **DONE** (diary.py indentation fixed)
- ❌ Document tag usage tracking → **DONE** (_handle_document_tags refactored)
- ❌ Diary tag batching → **DONE** (_get_tags_for_entries implemented)

---

## 📋 Suggested Immediate Next Steps (In Order)

1. **Fix FTS weather column** (2 min)
   ```python
   # pkms-backend/app/services/fts_service_enhanced.py line 67
   'columns': ['id', 'uuid', 'title', 'tags_text', 'mood', 'weather_code', 'location', ...]
   ```

2. **Create/run DB migration** (10 min)
   - Backup current `PKMS_Data/pkms.db`
   - Either write migration script OR restart with fresh DB for testing

3. **Restart backend, verify health** (1 min)
   ```bash
   docker compose restart pkms-backend
   docker compose logs pkms-backend --tail=20
   ```

4. **Test one diary entry end-to-end** (5 min)
   - Create entry with weather, location, daily metrics
   - Verify it saves and displays correctly
   - Check database to confirm schema matches

5. **If all works, mark app as "production-ready for personal use"** ✅

---

## 💡 Post-Launch Enhancements (Future)

- Add mood correlation analytics (daily metrics vs mood scores)
- Template gallery with preview
- Bulk diary export with daily snapshots
- Weather auto-population from IP/location API
- Nepali date picker UI component
- Daily snapshot reminders/notifications

### October 2025 Frontend Build Stabilization

#### ✅ Unified Search Refresh
- Removed legacy hybrid toggle; UI now exposes only FTS5 and fuzzy search modes.
- Renamed `EnhancedSearchFilters` → `UnifiedSearchFilters` with Mantine v7–compatible controls.
- Consolidated `searchService` into two public methods (`searchFTS`, `searchFuzzy`) with shared caching helpers.
- Updated `SearchSuggestions` component to the simplified API and keyboard handling.

#### ✅ Diary Search / Store Alignment
- `DiarySearch` now reuses `UnifiedSearchFilters` and the new search service types.
- `diaryStore` **CRITICAL BUGS FIXED**:
  1. **Store Deletion Bug**: Store was accidentally gutted (removed `isUnlocked`, `encryptionKey`, CRUD ops, calendar, mood stats).
     - **Fix**: Restored from git, then added ONLY `dailyMetadataCache`, `setDailyMetadata` without touching existing functionality.
     - **Why Critical**: Diary is the only encrypted module - session management must remain intact.
  2. **loadEntry UUID Ignored Bug**: Function accepted `uuid` parameter but fetched first entry instead.
     - **Previous Code**: `getEntries({ limit: 1, offset: 0 })` → always returned WRONG entry!
     - **Fix**: Now properly calls `diaryService.getEntry(uuid)` to fetch the correct entry by UUID.
     - **Why Critical**: Users would open entry A but see content from entry B (data corruption risk).
  3. **Type Fixes**: Changed `NodeJS.Timeout` → `ReturnType<typeof setInterval>` for browser compatibility.
- Diary entry form loads weather/location from snapshot metrics and persists them correctly.

#### ✅ Testing / Calendar Cleanup
- `TestingInterface` state setters renamed to match hook API (removed deprecated FTS helpers).
- Calendar/todo view components pruned of unused imports and Mantine v7 breaking props.

#### 🔄 Next Frontend Tasks
1. **Auth Recovery UX polish** (completed separately).
2. **Documentation** – ensure logs + instructions match unified search terminology (in progress).
3. **Run `npm run build`** after finishing remaining TypeScript fixes (ongoing: auth setup modal, timeline view, logger guards, etc.).
