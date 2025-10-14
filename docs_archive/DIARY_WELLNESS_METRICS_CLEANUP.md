# Diary Wellness Metrics Cleanup Analysis
**Date:** 2025-10-10 00:30:00 +05:45

## 🔍 Problem Summary

The daily wellness tracking system has **significant duplication and confusion** between legacy and modern fields, leading to:
1. **Redundant Data** - Two sets of overlapping fields being stored
2. **UI Confusion** - Legacy fields still shown with "(legacy)" labels  
3. **Inefficient Storage** - Storing duplicate information
4. **Logical Inconsistency** - `did_exercise` boolean doesn't control `exercise_minutes`

---

## 📊 Current State Analysis

### Database Schema
**Location:** `pkms-backend/app/models/diary.py`

```python
class DiaryDailyMetadata(Base):
    __tablename__ = "diary_daily_metadata"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(DateTime(timezone=True), nullable=False)
    nepali_date = Column(String(20), nullable=True)
    metrics_json = Column(Text, nullable=False, default='{}')  # ⚠️ Stores ALL metrics as JSON
```

**Key Point:** All wellness metrics are stored as flexible JSON, so there's **no schema enforcement** on the database side.

---

### Frontend Type Definition
**Location:** `pkms-frontend/src/types/diary.ts`

```typescript
export interface DiaryDailyMetrics {
  // ❌ LEGACY FIELDS (Redundant)
  sleep_hours?: number;           // Duplicates sleep_duration
  exercise_minutes?: number;      // Should be controlled by did_exercise
  phone_hours?: number;           // Duplicates screen_time
  activity_level?: number;        // Rendered but unclear purpose
  
  // ✅ MODERN FIELDS (Actively Used)
  did_exercise?: boolean;
  did_meditation?: boolean;
  sleep_duration?: number;
  screen_time?: number;
  water_intake?: number;
  time_outside?: number;
  social_interaction?: boolean;
  gratitude_practice?: boolean;
  reading_time?: number;
  energy_level?: number;
  stress_level?: number;
  
  custom_fields?: Record<string, any>;
}
```

---

### Frontend Implementation Issues
**Location:** `pkms-frontend/src/components/diary/DailyMetricsPanel.tsx`

#### Issue 1: Duplicate Fields Rendered
```tsx
// Lines 152-169: Both sleep_duration AND sleep_hours shown
<NumberInput
  label="Sleep Duration (hours)"  // ✅ Modern field
  value={dailyMetrics.sleep_duration}
/>
<NumberInput
  label="Sleep Hours (legacy)"   // ❌ Legacy field still shown!
  value={dailyMetrics.sleep_hours}
/>

// Lines 282-297: Both screen_time AND phone_hours shown
<NumberInput
  label="Screen Time (hours)"    // ✅ Modern field
  value={dailyMetrics.screen_time}
/>
<NumberInput
  label="Phone Hours (legacy)"   // ❌ Legacy field still shown!
  value={dailyMetrics.phone_hours}
/>
```

#### Issue 2: Independent Fields (No Logic)
```tsx
// Lines 176-188: did_exercise and exercise_minutes are INDEPENDENT
<Switch
  label="Did Exercise Today"
  checked={dailyMetrics.did_exercise}  // ✅ Boolean flag
/>
<NumberInput
  label="Exercise Minutes"
  value={dailyMetrics.exercise_minutes}  // ❌ Not linked to did_exercise!
/>
```

**User can:** Check "Did Exercise" but enter 0 minutes, or uncheck but enter 60 minutes. **Logically inconsistent!**

#### Issue 3: InitialDailyMetrics Sets All Fields
```tsx
// Lines 23-40: Initializes BOTH legacy and modern fields
const initialDailyMetrics: DiaryDailyMetrics = {
  sleep_hours: 0,        // ❌ Legacy
  exercise_minutes: 0,   // ❌ Legacy (should be derived)
  phone_hours: 0,        // ❌ Legacy
  activity_level: 0,     // ❌ Legacy
  
  did_exercise: false,   // ✅ Modern
  did_meditation: false, // ✅ Modern
  sleep_duration: 8,     // ✅ Modern
  screen_time: 0,        // ✅ Modern
  water_intake: 8,       // ✅ Modern
  time_outside: 0,       // ✅ Modern
  // ... etc
};
```

---

## 🎯 Proposed Solution

### Step 1: Clean Up Type Definition

**Remove legacy fields entirely:**

```typescript
// pkms-frontend/src/types/diary.ts
export interface DiaryDailyMetrics {
  // Physical Activity
  did_exercise?: boolean;
  exercise_minutes?: number;     // ✅ Keep, but make conditional on did_exercise
  time_outside?: number;
  
  // Sleep
  sleep_duration?: number;       // ✅ Single source of truth
  
  // Mental Wellness
  did_meditation?: boolean;
  energy_level?: number;         // 1-5 scale
  stress_level?: number;         // 1-5 scale
  gratitude_practice?: boolean;
  
  // Daily Habits
  water_intake?: number;         // glasses
  screen_time?: number;          // ✅ Single source of truth (hours)
  reading_time?: number;         // minutes
  social_interaction?: boolean;
  
  custom_fields?: Record<string, any>;
}
```

**REMOVED:**
- ❌ `sleep_hours` (use `sleep_duration`)
- ❌ `phone_hours` (use `screen_time`)
- ❌ `activity_level` (vague, use `did_exercise` + `exercise_minutes` + `time_outside`)

---

### Step 2: Add Logic for Conditional Fields

**In `DailyMetricsPanel.tsx`:**

```tsx
// When did_exercise changes, reset exercise_minutes if false
const handleExerciseToggle = (checked: boolean) => {
  setDailyMetrics(prev => ({
    ...prev,
    did_exercise: checked,
    exercise_minutes: checked ? (prev.exercise_minutes || 0) : 0  // Reset to 0 if not exercising
  }));
};

// Only show exercise_minutes input if did_exercise is true
{dailyMetrics.did_exercise && (
  <NumberInput
    label="Exercise Minutes"
    placeholder="30"
    min={0}
    max={1440}
    value={dailyMetrics.exercise_minutes || 0}
    onChange={(value) => updateMetric('exercise_minutes', typeof value === 'string' ? parseInt(value) || 0 : value)}
  />
)}
```

---

### Step 3: Update Initial Metrics

```tsx
const initialDailyMetrics: DiaryDailyMetrics = {
  // Physical Activity
  did_exercise: false,
  exercise_minutes: 0,
  time_outside: 0,
  
  // Sleep
  sleep_duration: 8,
  
  // Mental Wellness
  did_meditation: false,
  energy_level: 3,
  stress_level: 3,
  gratitude_practice: false,
  
  // Daily Habits
  water_intake: 8,
  screen_time: 0,
  reading_time: 0,
  social_interaction: false,
  
  custom_fields: {}
};
```

---

### Step 4: Backend Migration (Optional)

Since backend stores everything as JSON (`metrics_json`), **no database migration needed!**

Old data with legacy fields will still load, but:
- Frontend will ignore `sleep_hours`, `phone_hours`, `activity_level`
- New data will only save modern fields
- Natural migration over time

**If you want to clean old data:**

```python
# pkms-backend/scripts/migrate_legacy_metrics.py
from sqlalchemy import select
from app.database import get_db_session
from app.models.diary import DiaryDailyMetadata
import json

async def migrate_legacy_metrics():
    async with get_db_session() as db:
        result = await db.execute(select(DiaryDailyMetadata))
        all_metadata = result.scalars().all()
        
        for metadata in all_metadata:
            metrics = json.loads(metadata.metrics_json)
            
            # Migrate legacy fields to modern equivalents
            if 'sleep_hours' in metrics and 'sleep_duration' not in metrics:
                metrics['sleep_duration'] = metrics.pop('sleep_hours')
            
            if 'phone_hours' in metrics and 'screen_time' not in metrics:
                metrics['screen_time'] = metrics.pop('phone_hours')
            
            # Remove activity_level (replaced by did_exercise + exercise_minutes)
            metrics.pop('activity_level', None)
            
            metadata.metrics_json = json.dumps(metrics)
        
        await db.commit()
```

---

## 📋 Implementation Checklist

### High Priority (Fix Immediately)
- [ ] Remove legacy field UI from `DailyMetricsPanel.tsx` (sleep_hours, phone_hours)
- [ ] Add conditional rendering for `exercise_minutes` (only show if `did_exercise` is true)
- [ ] Update `initialDailyMetrics` to remove legacy fields
- [ ] Add logic to reset `exercise_minutes` to 0 when `did_exercise` is unchecked
- [ ] Update TypeScript types to remove deprecated fields

### Medium Priority (Nice to Have)
- [ ] Add data migration script to clean up old legacy data
- [ ] Add validation: if `did_exercise` is false, ensure `exercise_minutes` is 0 before save
- [ ] Consider similar pattern for `did_meditation` (could track meditation_minutes)

### Low Priority (Optional)
- [ ] Add analytics to show how many users have legacy data
- [ ] Add admin tool to bulk migrate old wellness data
- [ ] Add "smart defaults" (e.g., if exercise_minutes > 0, auto-check did_exercise)

---

## 🎨 Improved UI Structure

### Recommended Layout

```
📊 Daily Wellness Tracker
├─ 🌙 Sleep & Rest
│  └─ Sleep Duration (8 hours)
│
├─ 🏃 Physical Activity
│  ├─ Did Exercise Today [✓]
│  ├─ → Exercise Minutes (45 min)    [Only if checked]
│  └─ Time Outside (30 min)
│
├─ 🧘 Mental Wellness
│  ├─ Did Meditation [✓]
│  ├─ Gratitude Practice [ ]
│  ├─ Energy Level ▓▓▓░░ (3/5)
│  └─ Stress Level ▓▓░░░ (2/5)
│
└─ 🎯 Daily Habits
   ├─ Water Intake (8 glasses)
   ├─ Reading Time (30 min)
   ├─ Screen Time (4 hours)
   └─ Social Interaction [✓]
```

---

## 📊 Data Impact Analysis

### Current Data Size (Estimate)
```json
{
  "sleep_hours": 7,         // ❌ 16 bytes
  "sleep_duration": 7.5,    // ✅ 22 bytes
  "phone_hours": 4,         // ❌ 18 bytes
  "screen_time": 4.5,       // ✅ 20 bytes
  "activity_level": 5,      // ❌ 22 bytes
  "exercise_minutes": 45,   // ✅ 24 bytes
  "did_exercise": true,     // ✅ 20 bytes
  // ... 8 more modern fields
}
```

**Duplication:** ~56 bytes per daily snapshot (legacy fields)  
**Annual waste:** 56 bytes × 365 days = **20.4 KB per user/year** (negligible)

**Real impact:** Code complexity and user confusion >> storage cost

---

## ⚠️ Breaking Changes

### None! (Backward Compatible)

- Old data with legacy fields will still load
- Frontend will simply ignore legacy fields
- New saves will only include modern fields
- Database schema unchanged (JSON storage)

---

## 🧪 Testing Strategy

1. **Load old data:** Verify legacy fields are ignored
2. **Save new data:** Verify only modern fields are saved
3. **Toggle did_exercise:** Verify exercise_minutes resets to 0 when unchecked
4. **Mixed data:** Load snapshot with both legacy and modern fields
5. **Empty state:** Verify sensible defaults (8 hours sleep, 8 glasses water, etc.)

---

## 📝 Summary

**Current State:**
- ❌ 4 duplicate/redundant fields taking up UI space
- ❌ No logic linking `did_exercise` and `exercise_minutes`
- ❌ User confusion with "(legacy)" labels
- ❌ Inefficient initialization of unused fields

**After Cleanup:**
- ✅ Single source of truth for each metric
- ✅ Conditional UI (exercise minutes only if exercised)
- ✅ Cleaner, more intuitive interface
- ✅ Reduced cognitive load on users
- ✅ Backward compatible with existing data

---

**Recommendation:** Implement High Priority items immediately. Medium/Low priority can be done incrementally.

**Estimated Effort:**
- High Priority: 1-2 hours
- Medium Priority: 2-3 hours
- Low Priority: 4-6 hours (optional)


