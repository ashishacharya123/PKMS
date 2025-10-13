# 🚀 Implementation Plan - Streamlined

**AI: Nova (GPT-5)**  
**Date:** 2025-10-13

---

## 📝 Simplified Daily Metadata Schema

```json
{
  // Existing wellness fields (keep as-is)
  "sleep_hours": 7.5,
  "exercise_minutes": 30,
  "screen_time_hours": 4.2,
  "energy_level": 4,        // 1-5
  "stress_level": 2,        // 1-5
  "water_intake_liters": 2.5,
  "meditation_minutes": 15,
  "gratitude_count": 3,
  "social_interaction": true,
  
  // NEW: Financial (simple)
  "daily_income": 5000.00,     // NPR
  "daily_expense": 1200.50,    // NPR
  
  // NEW: Context
  "is_office_day": true,       // Was it a work day?
  
  // OPTIONAL: Quick notes
  "notes": "Good day overall"
}
```

**Removed:** Categories, sources, Nepali-specific, health overload, productivity overload

---

## 🎯 Features to Implement

### 1. **Diary Enhancements**
- ✅ Backdating (backend done, add UI date picker)
- ✅ Financial tracking (daily_income, daily_expense)
- ✅ Office day flag (is_office_day)
- ✅ Weekly highlights (wellness + financial + project progress)

### 2. **Storage Management**
- ✅ Add `size_bytes` to Notes table
- ✅ Update size on create/edit
- ✅ Dashboard storage breakdown by module

### 3. **Favorites**
- ✅ Show favorites at top (use existing `is_favorite`)
- ✅ Dashboard favorites section

### 4. **Project Dashboard**
- ✅ Visual circular progress
- ✅ Todo status breakdown
- ✅ Metrics cards

### 5. **Main Dashboard**
- ✅ Individual project cards with completion %

---

## 📦 Implementation Order

### **Phase 1: Database Changes**
1. Add `size_bytes` column to `notes` table
2. Migration script to backfill sizes

### **Phase 2: Diary Financial + Office Day**
1. Update backend schema to accept new fields
2. Update frontend form with:
   - Income input (NPR)
   - Expense input (NPR)
   - Office day checkbox
   - Entry date selector (for backdating)

### **Phase 3: Storage Tracking**
1. Update Notes router to track size on create/update
2. Add storage breakdown to dashboard stats endpoint
3. Add storage chart to dashboard UI

### **Phase 4: Favorites**
1. Add sort by `is_favorite` DESC to all list endpoints
2. Add favorite toggle buttons to all lists
3. Add favorites section to main dashboard

### **Phase 5: Weekly Highlights**
1. Create `/diary/weekly-highlights` endpoint:
   - Wellness summary (mood, sleep, exercise avg)
   - Financial summary (total income/expense, net)
   - Project progress (todos completed)
   - Diary streak
2. Create WeeklyHighlights component
3. Add to diary page and dashboard

### **Phase 6: Project Dashboard**
1. Add progress calculation endpoint
2. Build circular progress component
3. Add todo status breakdown cards
4. Add metrics (avg completion time, etc.)

### **Phase 7: Dashboard Project Cards**
1. Fetch active projects with completion %
2. Create ProjectCard component
3. Add to main dashboard

---

## 🔧 Starting Implementation Now...

Let's do this! 🚀

