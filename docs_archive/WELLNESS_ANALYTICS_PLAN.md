# Wellness Analytics Enhancement Plan
**Date:** 2025-10-10 01:15:00 +05:45

## 🎯 Goal

Transform "Detailed Mood Analysis" into comprehensive "Wellness Analytics" showing correlations and trends across ALL wellness metrics, not just mood.

---

## 📊 Current State

**MoodStatsWidget shows:**
- Average mood score
- Mood distribution (pie chart style)
- Dominant mood
- Total entries

**Problem:** Only focuses on mood, ignoring all other wellness data (sleep, exercise, screen time, etc.)

---

## 🚀 Proposed: Wellness Analytics Dashboard

### Chart Categories

#### 1. **Mood & Energy Overview**
- Average mood over time (line chart)
- Energy levels trend
- Stress levels trend
- **Correlation:** Mood vs Energy/Stress

#### 2. **Sleep Analysis**
- Average sleep duration per week
- Sleep trend over last 30 days
- **Correlation:** Sleep vs Mood (scatter plot)
- **Insight:** "You feel 20% better on days with 7+ hours sleep"

#### 3. **Activity & Exercise**
- Exercise frequency (days per week)
- Exercise minutes trend
- Time outside correlation with mood
- **Insight:** "You exercise 3.5 days/week on average"

#### 4. **Screen Time & Habits**
- Daily screen time average
- Screen time vs mood correlation
- Reading time trends
- **Insight:** "Lower screen time = better mood"

#### 5. **Wellness Score**
- Composite wellness score (0-100) based on:
  - Sleep quality (8hrs = 100%)
  - Exercise frequency (4+ days/week = 100%)
  - Low screen time (<4hrs = 100%)
  - High energy (4-5 = 100%)
  - Low stress (1-2 = 100%)
  - Social interaction
  - Meditation/gratitude practice

---

## 🎨 UI Design (UPDATED - Simple Dropdown Selector)

### Layout (Clean Single Chart with Dropdown)

```
┌─────────────────────────────────────────────────────┐
│  📊 Wellness Analytics                              │
├─────────────────────────────────────────────────────┤
│  Chart: [Mood Trend ▼]  Period: [30 Days ▼] [↻]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ Wellness    │  │ Mood Avg    │  │ Sleep Avg  │ │
│  │ Score: 78   │  │ 3.8/5 ⭐    │  │ 7.2 hrs    │ │
│  └─────────────┘  └─────────────┘  └────────────┘ │
│                                                     │
│  📈 Mood Trend Over Time                           │
│  ┌─────────────────────────────────────────────┐  │
│  │         ●─●                                  │  │
│  │    ●─●       ●─●─●                          │  │
│  │  ●               ●─●                        │  │
│  │●                       ●                    │  │
│  └─────────────────────────────────────────────┘  │
│  Insight: Your mood has improved 12% this month   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Dropdown Options:**
- 📊 Mood Trend
- 😴 Sleep Analysis
- 🏃 Exercise Frequency
- 📱 Screen Time Trend
- ⚡ Energy & Stress Levels
- 💧 Hydration Tracking
- 🔗 Mood vs Sleep Correlation
- 📈 Wellness Score Breakdown

---

## 🔧 Implementation Plan

### Phase 1: Backend API Enhancement

**New Endpoint:** `/api/v1/diary/stats/wellness`

```python
@router.get("/stats/wellness")
async def get_wellness_stats(
    days: int = 30,  # Last 30 days by default
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get comprehensive wellness analytics including:
    - Sleep patterns
    - Exercise trends
    - Screen time averages
    - Mood correlations
    - Wellness score
    """
    # Query all daily_metadata for user in date range
    # Calculate aggregates and correlations
    # Return structured analytics data
```

**Response Structure:**

```typescript
interface WellnessStats {
  period: {
    start_date: string;
    end_date: string;
    total_days: number;
    days_with_data: number;
  };
  
  // Mood (existing)
  mood: {
    average: number;
    distribution: Record<number, number>;
    trend: Array<{date: string, value: number}>;
  };
  
  // Sleep
  sleep: {
    average_hours: number;
    trend: Array<{date: string, hours: number}>;
    quality_days: number;  // Days with 7+ hours
  };
  
  // Exercise
  exercise: {
    days_exercised: number;
    frequency_per_week: number;
    average_minutes: number;
    trend: Array<{date: string, did_exercise: boolean, minutes: number}>;
  };
  
  // Screen Time
  screen_time: {
    average_hours: number;
    trend: Array<{date: string, hours: number}>;
  };
  
  // Energy & Stress
  mental_wellness: {
    average_energy: number;
    average_stress: number;
    meditation_days: number;
    gratitude_days: number;
  };
  
  // Correlations
  correlations: {
    sleep_vs_mood: number;      // Correlation coefficient (-1 to 1)
    exercise_vs_mood: number;
    screen_time_vs_mood: number;
    energy_vs_mood: number;
  };
  
  // Wellness Score (composite metric)
  wellness_score: {
    overall: number;  // 0-100
    components: {
      sleep: number;
      exercise: number;
      mental: number;
      habits: number;
    };
  };
  
  // Insights (generated from data)
  insights: Array<{
    type: 'positive' | 'negative' | 'neutral';
    message: string;
    metric: string;
  }>;
}
```

---

### Phase 2: Frontend Component (UPDATED - Clean Dropdown Approach)

**New Component:** `WellnessAnalytics.tsx`

**Features:**
1. ✅ **Dropdown selector** to choose chart type (no clutter!)
2. ✅ **Single chart area** that changes based on selection
3. ✅ **Summary cards** at top (3 key metrics)
4. ✅ **Insight text** below chart (one actionable insight)
5. ✅ **Time period selector** (7d, 30d, 90d, all time)
6. ✅ **Refresh button**

**Chart Types (User Selects):**
1. 📊 **Mood Trend** - Line chart over time
2. 😴 **Sleep Analysis** - Bar chart showing sleep hours per day
3. 🏃 **Exercise Frequency** - Bar chart with exercise days
4. 📱 **Screen Time** - Line chart showing daily screen usage
5. ⚡ **Energy & Stress** - Dual line chart (energy vs stress)
6. 💧 **Hydration** - Bar chart for water intake
7. 🔗 **Mood vs Sleep** - Scatter plot showing correlation
8. 📈 **Wellness Score** - Radial/spider chart breakdown

**Layout:**
```tsx
<Stack>
  {/* Controls */}
  <Group justify="space-between">
    <Select label="Chart" data={chartOptions} />
    <Select label="Period" data={periodOptions} />
    <ActionIcon onClick={refresh}><IconRefresh /></ActionIcon>
  </Group>
  
  {/* Summary Cards */}
  <SimpleGrid cols={3}>
    <StatCard title="Wellness Score" value="78" />
    <StatCard title="Avg Mood" value="3.8/5" />
    <StatCard title="Avg Sleep" value="7.2hrs" />
  </SimpleGrid>
  
  {/* Single Chart Area */}
  <Paper>
    {selectedChart === 'mood' && <MoodTrendChart />}
    {selectedChart === 'sleep' && <SleepAnalysisChart />}
    {/* ... etc ... */}
  </Paper>
  
  {/* Insight */}
  <Alert>
    <Text>{generateInsight()}</Text>
  </Alert>
</Stack>
```

---

### Phase 3: Integration

**Update DiaryPage.tsx:**

```tsx
// Replace this:
<Accordion.Item value="mood-details">
  <Accordion.Control>
    <Text fw={600} size="md">📈 Detailed Mood Analysis</Text>
  </Accordion.Control>
  <Accordion.Panel>
    <MoodStatsWidget />
  </Accordion.Panel>
</Accordion.Item>

// With this:
<Accordion.Item value="wellness-analytics">
  <Accordion.Control>
    <Text fw={600} size="md">📊 Wellness Analytics</Text>
  </Accordion.Control>
  <Accordion.Panel>
    <WellnessAnalytics />
  </Accordion.Panel>
</Accordion.Item>
```

---

## 📈 Sample Insights

Based on data analysis, show insights like:

### Positive Insights ✅
- "Great job! You exercised 5 days this week (target: 4)"
- "Your sleep quality is excellent - averaging 7.8 hours"
- "You meditated 15 days this month - keep it up!"

### Areas for Improvement ⚠️
- "You feel 23% better on days with less than 4 hours screen time"
- "Consider increasing outdoor time - only 18 minutes average"
- "Your stress is highest on days with less than 6 hours sleep"

### Patterns Detected 📊
- "Your mood peaks on Wednesdays (4.2 avg) and dips on Mondays (3.1 avg)"
- "Strong correlation between exercise and mood (r=0.67)"
- "You're 40% more likely to exercise on days with social interaction"

---

## 🎯 Wellness Score Calculation

**Formula:**
```
Wellness Score = weighted average of:
- Sleep Quality (25%): (actual_hours / 8) * 100
- Exercise (20%): (days_exercised / 4 per week) * 100
- Mental Wellness (20%): ((energy + (6 - stress)) / 10) * 100
- Healthy Habits (15%): (water_intake / 8) * 100
- Low Screen Time (10%): max(0, 100 - (screen_time / 8) * 100)
- Mindfulness (10%): (meditation_days / 7 per week) * 100
```

**Score Ranges:**
- 90-100: 🌟 Excellent
- 75-89: ✅ Good
- 60-74: 🔔 Fair
- 40-59: ⚠️ Needs Attention
- 0-39: 🚨 Poor

---

## 🛠️ Dependencies

**Chart Library Options:**
1. **Recharts** (Recommended - React native, good for analytics)
2. **Chart.js with react-chartjs-2** (More features but heavier)
3. **Nivo** (Beautiful but learning curve)

**Install:**
```bash
npm install recharts
```

---

## 📝 Implementation Steps

### Step 1: Backend (Priority 1)
1. Create `/stats/wellness` endpoint
2. Implement data aggregation queries
3. Calculate correlations using basic statistics
4. Generate insights based on thresholds

### Step 2: Frontend Components (Priority 2) - UPDATED
1. Create `WellnessAnalytics.tsx` with dropdown selector
2. Create chart rendering logic inside single component (no separate files)
3. Use switch/case to render selected chart type
4. Keep it simple - one file, one component, dropdown to switch views

### Step 3: Integration (Priority 3)
1. Update `DiaryPage.tsx` to use new component
2. Keep `MoodStatsWidget` for backward compatibility
3. Add loading states and error handling
4. Add refresh button

### Step 4: Polish (Priority 4)
1. Add animations
2. Add export to CSV feature
3. Add comparison view (this week vs last week)
4. Add goals/targets feature

---

## 🔍 Sample Backend Query Logic

```python
# Pseudocode for correlation calculation
def calculate_sleep_mood_correlation(user_id, days=30):
    """Calculate Pearson correlation between sleep and mood"""
    
    # Get entries with both sleep_duration and mood
    query = """
        SELECT 
            de.mood,
            json_extract(ddm.metrics_json, '$.sleep_duration') as sleep
        FROM diary_entries de
        JOIN diary_daily_metadata ddm ON date(de.date) = date(ddm.date)
        WHERE de.user_id = ? 
          AND de.mood IS NOT NULL
          AND ddm.date >= date('now', '-{days} days')
    """
    
    # Calculate Pearson r
    # r = 1: perfect positive correlation
    # r = 0: no correlation
    # r = -1: perfect negative correlation
    
    return correlation_coefficient
```

---

## 📊 Expected Impact

**Benefits:**
1. **Holistic View:** See all wellness metrics in one place
2. **Actionable Insights:** Data-driven recommendations
3. **Motivation:** Wellness score gamification
4. **Pattern Recognition:** Spot trends and correlations
5. **Better Decisions:** Understand what improves mood/energy

**User Value:**
- "I never realized exercise improves my mood so much!"
- "I should reduce screen time before bed - I sleep better"
- "My wellness score went from 62 to 81 in a month!"

---

## 🎨 Visual Design Ideas

**Color Coding:**
- 🔵 Blue: Sleep-related metrics
- 🟢 Green: Exercise & activity
- 🟣 Purple: Mental wellness
- 🟠 Orange: Habits & lifestyle
- 🔴 Red: Areas needing attention

**Icons:**
- 🌙 Sleep
- 🏃 Exercise
- 🧘 Mental wellness
- 📱 Screen time
- 💧 Water intake
- 📖 Reading
- 🤝 Social interaction

---

## ⏱️ Estimated Timeline

- **Backend API:** 3-4 hours
- **Frontend Components:** 4-5 hours
- **Charts Integration:** 2-3 hours
- **Testing & Polish:** 2 hours
- **Total:** ~12-14 hours

---

## 🚀 Next Steps

1. Review this plan with user
2. Confirm desired features
3. Choose chart library (Recharts recommended)
4. Implement backend endpoint first
5. Build frontend components incrementally
6. Test with real data
7. Gather feedback and iterate

---

**Note:** This is a significant enhancement that transforms simple mood tracking into comprehensive wellness analytics. Start with MVP (basic charts + correlations) and iterate based on usage.


