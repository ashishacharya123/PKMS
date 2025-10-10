# Wellness Analytics - Feature Summary
**Date:** 2025-10-10 02:00:00 +05:45

---

## 📊 What You Now Have

A comprehensive **Wellness Analytics Dashboard** that transforms your diary from simple mood tracking into a holistic wellness monitoring system!

---

## 🎛️ Controls (Always Visible)

### 1. **Chart Type Dropdown** (8 Options)
Select which aspect of your wellness to visualize:

- 📊 **Mood Trend** - See how your mood changes over time
- 😴 **Sleep Analysis** - Track your sleep patterns (color-coded: green = 7+ hrs)
- 🏃 **Exercise Frequency** - Visualize your workout consistency
- 📱 **Screen Time Trend** - Monitor digital wellness
- ⚡ **Energy & Stress Levels** - Compare energy vs stress patterns
- 💧 **Hydration Tracking** - Water intake with 8-glass target
- 🔗 **Mood vs Sleep Correlation** - Discover relationships between sleep and mood
- 📈 **Wellness Score Breakdown** - Multi-dimensional wellness radar chart

### 2. **Period Dropdown** (5 Options)
Choose your analysis timeframe:

- **1 Week** (7 days)
- **1 Month** (30 days)
- **3 Months** (90 days)
- **6 Months** (180 days)
- **1 Year** (365 days)

### 3. **Refresh Button**
Manually reload data to see latest updates

---

## 📈 What Gets Displayed

### When You Have Data:

1. **3 Summary Cards** at the top:
   - Wellness Score (0-100 with color badge: Green/Yellow/Red)
   - Average Mood (out of 5 ⭐)
   - Average Sleep (hours 😴)

2. **Interactive Chart** showing the selected metric:
   - Line charts for trends (Mood, Screen Time, Energy/Stress)
   - Bar charts for daily metrics (Sleep, Exercise, Hydration)
   - Scatter plot for correlations (Mood vs Sleep)
   - Radar chart for wellness score breakdown

3. **Contextual Insight** below the chart:
   - Positive insights: "Great job! You exercised 5 days this week"
   - Areas for improvement: "You're averaging only 5.8 hours of sleep"
   - Correlations: "Strong positive link: Better sleep improves your mood (r=0.67)"

4. **Data Summary** at the bottom:
   - Shows how many days have data vs total days analyzed
   - Date range being analyzed

### When You Have NO Data Yet:

- Dropdowns are still visible (you can change settings)
- Empty state message appears where chart would be:
  - 📊 Icon
  - "No wellness data yet"
  - Helpful message: "Go to 'Daily Wellness Tracker' above and fill in your metrics"

---

## 🎯 How Wellness Score Works (0-100)

Your overall wellness score is calculated from **6 weighted components**:

1. **Sleep Quality (25%)** - Based on sleep duration (8 hrs = 100%)
2. **Exercise (20%)** - Based on frequency (4+ days/week = 100%)
3. **Mental Wellness (20%)** - Based on energy and stress levels
4. **Healthy Habits (15%)** - Based on water intake (8 glasses = 100%)
5. **Low Screen Time (10%)** - Less screen time = higher score
6. **Mindfulness (10%)** - Based on meditation/gratitude practice

**Score Ranges:**
- 🌟 **90-100:** Excellent
- ✅ **75-89:** Good
- 🔔 **60-74:** Fair
- ⚠️ **40-59:** Needs Attention
- 🚨 **0-39:** Poor

---

## 🔍 What Data Is Analyzed

The backend analyzes:
- **From Diary Entries:** Mood ratings
- **From Daily Wellness Tracker:** All wellness metrics
  - Sleep duration
  - Exercise (did_exercise + minutes)
  - Screen time
  - Energy level (1-5)
  - Stress level (1-5)
  - Water intake
  - Meditation days
  - Gratitude practice
  - Social interaction
  - Time outside
  - Reading time

---

## 📊 Chart Types Explained

### 1. Mood Trend (Line Chart)
- **X-axis:** Dates
- **Y-axis:** Mood (1-5 scale)
- **Shows:** How your mood fluctuates over time
- **Insight Example:** "Your mood has improved 12% this month"

### 2. Sleep Analysis (Bar Chart)
- **X-axis:** Dates
- **Y-axis:** Hours of sleep
- **Color Coding:**
  - Green bars: 7+ hours (quality sleep)
  - Red bars: Less than 7 hours
- **Insight Example:** "You're averaging 7.2 hours of sleep. Excellent!"

### 3. Exercise Frequency (Bar Chart)
- **X-axis:** Dates
- **Y-axis:** Minutes exercised
- **Shows:** Exercise duration per day
- **Insight Example:** "You exercised 4.2 days per week on average"

### 4. Screen Time Trend (Line Chart)
- **X-axis:** Dates
- **Y-axis:** Hours on screens
- **Shows:** Digital device usage patterns
- **Insight Example:** "High screen time (6.5 hrs/day). Consider reducing it."

### 5. Energy & Stress (Dual Line Chart)
- **X-axis:** Dates
- **Y-axis:** Level (1-5 scale)
- **Two lines:**
  - Yellow line: Energy levels
  - Red line: Stress levels
- **Insight Example:** "Your stress is highest on days with less sleep"

### 6. Hydration (Bar Chart)
- **X-axis:** Dates
- **Y-axis:** Glasses of water
- **Color Coding:**
  - Blue bars: 8+ glasses (target met)
  - Yellow bars: Less than 8 glasses
- **Insight Example:** "You're averaging 7.5 glasses per day"

### 7. Mood vs Sleep Correlation (Scatter Plot)
- **X-axis:** Sleep hours
- **Y-axis:** Mood (1-5)
- **Each dot:** One day's data point
- **Shows:** Relationship between sleep and mood
- **Insight Example:** "Strong correlation (r=0.67): Better sleep = better mood"
- **Pearson r coefficient:**
  - r > 0.5: Strong positive correlation
  - r < -0.5: Strong negative correlation
  - r ≈ 0: No correlation

### 8. Wellness Score Breakdown (Radar Chart)
- **Shows:** All 6 wellness components on a spider web
- **Each axis:** One component (0-100 scale)
- **Larger area:** Better overall wellness
- **Helps identify:** Which areas need improvement

---

## 💡 Sample Insights You'll See

### Positive (Green):
- "Excellent sleep quality! Averaging 7.8 hours per night."
- "Great job! You exercised 5.0 days per week."
- "Wonderful mindfulness practice! 18 meditation days."

### Areas for Improvement (Red):
- "You're averaging only 5.8 hours of sleep. Aim for 7-8 hours."
- "High screen time detected (7.2 hrs/day). Consider reducing it."

### Patterns/Neutral (Blue):
- "Only 1.5 exercise days per week. Try to increase activity."
- "Strong positive link: Better sleep improves your mood (r=0.67)."

---

## 🚀 How to Use

1. **Track your daily wellness** in "Daily Wellness Tracker" (above this section)
2. **Add diary entries with mood ratings** regularly
3. **Wait a few days** to accumulate data
4. **Open "Wellness Analytics"** accordion
5. **Select chart type** from dropdown (e.g., "Mood Trend")
6. **Select period** (e.g., "1 Month")
7. **View insights** and track your progress!
8. **Change selections** to explore different aspects
9. **Use insights** to improve your wellness habits

---

## 🎨 Visual Design

- **Colors:** Meaningful color coding throughout
  - Blue: Mood-related
  - Purple: Sleep
  - Green: Exercise/Activity
  - Red: Screen time/Stress
  - Yellow: Energy
  - Cyan: Hydration

- **Responsive:** Charts adapt to screen size
- **Tooltips:** Hover over data points for details
- **Legends:** Clear labeling on all charts

---

## 🔄 How It Works (Technical)

1. **Frontend** calls `/api/v1/diary/stats/wellness?days=30`
2. **Backend** queries:
   - All diary entries (for mood)
   - All daily metadata (for wellness metrics)
3. **Backend** calculates:
   - Trends for all 7 metrics
   - Averages and aggregates
   - Pearson correlation (mood vs sleep)
   - Wellness score from 6 components
   - Auto-generates insights
4. **Frontend** receives structured data
5. **Recharts library** renders selected chart
6. **Insight** displays based on chart type

---

## 📝 Next Steps for You

1. **Start tracking today:** Fill in "Daily Wellness Tracker"
2. **Be consistent:** Track for at least 7 days to see patterns
3. **Explore different charts:** Each reveals different insights
4. **Act on insights:** Use data to improve your habits
5. **Track long-term:** Change period to "1 Year" to see big picture

---

## ✨ Key Benefits

- **Holistic View:** All wellness metrics in one place
- **Actionable Insights:** Data-driven recommendations
- **Motivation:** See your progress visually
- **Pattern Recognition:** Discover what affects your mood
- **Better Decisions:** Understand what works for you
- **Gamification:** Wellness score motivates improvement

---

**Remember:** The more consistently you track, the more valuable the insights become! 🎯


