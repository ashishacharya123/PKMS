# 📔 Diary Enhancements Specification

**AI: Nova (GPT-5)**  
**Date:** 2025-10-13

---

## 🎯 Overview

Comprehensive enhancements to the diary module to support:
1. **Backdating entries** with full metadata support
2. **Financial tracking** (income & expenses)
3. **Enhanced daily metadata** with additional useful fields
4. **Storage breakdown** visualization on dashboard

---

## 1. 📅 Backdating Support

### Current State
- Diary entries use `date` field for the entry date
- Entries can technically be created for any date
- No explicit UI/UX for backdating

### Enhancement
**Already supported in backend!** Just needs frontend UX improvements:
- Add "Entry Date" selector in diary creation form
- Default to today, but allow selecting past dates
- Show visual indicator when viewing backdated entries
- Ensure `daily_metadata` is properly associated with the entry date (not creation date)

**No schema changes needed** ✅

---

## 2. 💰 Financial Tracking

### Proposed Fields (added to `daily_metrics` JSON)

```json
{
  // Existing wellness fields
  "sleep_hours": 7.5,
  "exercise_minutes": 30,
  "screen_time_hours": 4.2,
  "energy_level": 4,
  "stress_level": 2,
  "water_intake_liters": 2.5,
  "meditation_minutes": 15,
  "gratitude_count": 3,
  "social_interaction": true,
  
  // NEW: Financial tracking
  "daily_income": 5000.00,              // Daily income (NPR or user currency)
  "daily_expense": 1200.50,             // Daily expenses (NPR or user currency)
  "expense_categories": {               // Breakdown by category
    "food": 400,
    "transport": 200,
    "bills": 300,
    "entertainment": 150,
    "health": 100,
    "other": 50.50
  },
  "income_sources": {                   // Breakdown by source
    "salary": 5000,
    "freelance": 0,
    "investment": 0,
    "other": 0
  },
  
  // NEW: Additional wellness/productivity
  "productive_hours": 6.5,              // Hours spent on productive work
  "deep_work_hours": 3.0,               // Hours of focused, uninterrupted work
  "reading_minutes": 45,                // Reading time
  "learning_minutes": 60,               // Learning/skill development
  "creative_time_minutes": 30,          // Creative activities
  
  // NEW: Health tracking
  "weight_kg": 70.5,                    // Daily weight
  "steps_count": 8500,                  // Steps walked
  "calories_intake": 2200,              // Calories consumed
  "caffeine_mg": 200,                   // Caffeine intake
  
  // NEW: Habit tracking (boolean flags)
  "woke_up_early": true,                // Before 6 AM
  "exercised": true,
  "meditated": true,
  "read_book": true,
  "journaled": true,
  "called_family": false,
  "helped_someone": true,
  
  // NEW: Mood details
  "mood_triggers": ["work_stress", "good_conversation"],  // What affected mood
  "highlights": ["Completed project", "Had coffee with friend"],  // Day highlights (3 max)
  "lowlights": ["Missed deadline"],     // Day lowlights
  
  // NEW: Weather/environment (user-reported)
  "temperature_celsius": 25,
  "air_quality_index": 85,
  
  // NEW: Nepali-specific
  "nepali_date_verified": true,         // User confirmed nepali date
  "festival_name": "Dashain",           // If it's a festival day
  "holiday": true,                      // Public holiday flag
  
  // NEW: Notes
  "notes": "Felt great today after morning run"  // Quick metadata notes
}
```

### Financial Dashboard View
Add a new section to dashboard showing:
- **Monthly Financial Summary:**
  - Total Income
  - Total Expenses
  - Net Savings
  - Savings Rate %
- **Expense Breakdown** (pie chart by category)
- **Income vs Expense Trend** (line chart)
- **Daily Average** comparisons

---

## 3. 🗂️ Storage Breakdown

### Current Database Columns

**Documents:**
- `size_bytes` ✅ (already used in quick-stats)

**Archive Items:**
- `file_size` ✅ (already used in quick-stats)

**Diary Media:**
- `file_size` ✅

**Notes:**
- No file storage column ❌ (notes are text-only)

**Diary Entries:**
- `content_length` (character count, not bytes)
- We can calculate file size from `content_file_path` ✅

### Implementation
1. Add storage breakdown by module to `/dashboard/stats` endpoint
2. Calculate:
   - Documents storage
   - Archive storage
   - Diary content storage (files)
   - Diary media storage
   - Total storage
3. Display on dashboard with visual chart

---

## 4. ⭐ Favorites & Pinning

### Current State
All content models have `is_favorite` column:
- ✅ Notes (`is_favorite`)
- ✅ Documents (`is_favorite`)
- ✅ Todos (`is_favorite`)
- ✅ Diary Entries (`is_favorite`)
- ✅ Projects (`is_favorite`)

### Implementation Needed
1. **Frontend:**
   - Add favorite toggle button (star icon) to all list views
   - Filter/sort by favorites
   - Pin favorites to top of lists
2. **Dashboard:**
   - "Favorites" section showing starred items from all modules
3. **Backend:**
   - Already supported! Just expose in responses ✅

---

## 5. 📊 Weekly Highlights

### Proposed Features
Auto-generated weekly summary showing:
- **Productivity:**
  - Total productive hours
  - Top 3 most productive days
  - Average deep work time
- **Wellness:**
  - Average mood
  - Sleep quality score
  - Exercise consistency
  - Hydration average
- **Financial:**
  - Total income/expense
  - Top expense category
  - Savings rate
- **Content Created:**
  - Notes created
  - Documents uploaded
  - Todos completed
  - Diary entries written
- **Highlights:**
  - Most common mood triggers
  - Top 3 day highlights (from daily_metrics)
  - Longest streak maintained

### Implementation
1. Add `/diary/weekly-summary` endpoint
2. Query data for last 7 days
3. Calculate aggregate statistics
4. Display on dashboard in dedicated card

---

## 6. 🎨 Project Dashboard Enhancements

### Current ProjectDashboardPage Issues
(Need to check current implementation)

### Proposed Enhancements
1. **Visual Progress:**
   - Large circular progress indicator
   - Color-coded by completion %
   - Completion percentage calculation from todos
2. **Todo Breakdown:**
   - Kanban board view by status
   - Priority distribution chart
   - Overdue warnings
3. **Activity Timeline:**
   - Recent updates to project
   - Todo completions
   - Note/doc associations
4. **Detailed Metrics:**
   - Total todos vs completed
   - Average completion time
   - Most active contributors (if multi-user)
   - Tag cloud for project
5. **Quick Actions:**
   - Add todo
   - Create note
   - Upload document
   - Archive/complete project

---

## 🚀 Implementation Plan

### Phase 1: Color Accessibility ✅ (COMPLETED)
- [x] Update color scheme for colorblind-friendly palette

### Phase 2: Financial Tracking (HIGH PRIORITY)
- [ ] Update `DiaryEntryCreate` schema to accept new financial fields
- [ ] Update frontend diary form to include financial inputs
- [ ] Add financial summary cards to dashboard
- [ ] Add financial trends visualization

### Phase 3: Enhanced Daily Metadata
- [ ] Update diary form with all new metadata fields
- [ ] Create tabs/sections for different metadata categories
- [ ] Add validation for new fields

### Phase 4: Storage Breakdown
- [ ] Add storage calculation to dashboard stats endpoint
- [ ] Create storage breakdown chart component
- [ ] Display on dashboard

### Phase 5: Favorites & Pinning
- [ ] Add favorite toggle to all module list views
- [ ] Add favorites filter/sort
- [ ] Create dashboard favorites section

### Phase 6: Weekly Highlights
- [ ] Create weekly summary endpoint
- [ ] Build weekly highlights card component
- [ ] Add to dashboard

### Phase 7: Project Dashboard Redesign
- [ ] Audit current ProjectDashboardPage
- [ ] Implement visual progress indicator
- [ ] Add todo breakdown view
- [ ] Add activity timeline
- [ ] Add detailed metrics cards

---

## 💡 Additional Suggestions

### 1. **Diary Templates**
- Pre-filled metadata templates for different day types
- "Workday", "Weekend", "Travel", "Sick Day" templates

### 2. **Metadata Quick Entry**
- Swipe shortcuts for common values
- Voice input for quick logging
- Siri/Alexa-style: "Log 30 minutes exercise"

### 3. **Gamification**
- Streak tracking for habits
- Badges for milestones
- Monthly challenges

### 4. **Export & Reporting**
- PDF export of monthly summaries
- CSV export of financial data
- Charts for wellness trends

### 5. **Correlations & Insights**
- "You sleep better when you exercise"
- "Your mood is lowest on Mondays"
- "You spend 2x more on weekends"

---

## ❓ Questions for User

1. **Currency:** Should we support multiple currencies or stick to NPR?
2. **Expense Categories:** Are the suggested categories good, or do you want custom categories?
3. **Privacy:** Financial data is sensitive - should it have separate encryption?
4. **Reminder System:** Do you want daily reminders to log metadata?
5. **Autopopulate:** Should we fetch weather data automatically from API?

---

Let me know which phases to prioritize!

