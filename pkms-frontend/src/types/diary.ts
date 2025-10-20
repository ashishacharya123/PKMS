export interface DiaryDailyMetrics {
  // Physical Activity
  did_exercise?: boolean;
  exercise_minutes?: number;  // Only if did_exercise is true
  time_outside?: number;
  
  // Sleep
  sleep_duration?: number;
  
  // Mental Wellness
  did_meditation?: boolean;
  energy_level?: number;      // 1-5 scale
  stress_level?: number;       // 1-5 scale
  gratitude_practice?: boolean;
  
  // Daily Habits
  water_intake?: number;       // glasses
  screen_time?: number;        // hours
  reading_time?: number;       // minutes
  social_interaction?: boolean;
  
  // Financial (simple, NPR)
  daily_income?: number;
  daily_expense?: number;
  
  // Context
  is_office_day?: boolean;
  
  custom_fields?: Record<string, any>;
}

export interface DiaryDailyMetadata {
  date: string;
  nepali_date?: string;
  metrics: DiaryDailyMetrics;
  created_at: string;
  updated_at: string;
}

export const WEATHER_CODES = [
  { value: 0, label: 'Clear' },
  { value: 1, label: 'Partly Cloudy' },
  { value: 2, label: 'Cloudy' },
  { value: 3, label: 'Rain' },
  { value: 4, label: 'Storm' },
  { value: 5, label: 'Snow' },
  { value: 6, label: 'Scorching Sun' },
] as const;

export type WeatherCode = typeof WEATHER_CODES[number]['value'];

export interface DiaryEntry {
  uuid: string;
  date: string;
  nepali_date?: string;
  title?: string;
  encrypted_blob: string;
  encryption_iv: string;
  mood?: number;
  weather_code?: WeatherCode;
  weather_label?: string;
  location?: string;
  daily_metrics: DiaryDailyMetrics;
  is_template?: boolean;
  from_template_id?: string | null;
  created_at: string;
  updated_at: string;
  media_count: number;
  tags: string[];
  content_length?: number;
}

export interface DiaryEntrySummary {
  uuid: string;
  date: string;
  nepali_date?: string;
  title?: string;
  mood?: number;
  weather_code?: WeatherCode;
  weather_label?: string;
  location?: string;
  daily_metrics: DiaryDailyMetrics;
  is_template?: boolean;
  from_template_id?: string | null;
  created_at: string;
  media_count: number;
  encrypted_blob: string;
  encryption_iv: string;
  tags: string[];
  content_length?: number;
  is_favorite?: boolean;
}

export interface DiaryFormValues {
  uuid: string | null;
  date: Date;
  title: string;
  content: string;
  mood: number;
  weather_code?: WeatherCode;
  location?: string;
  daily_metrics: DiaryDailyMetrics;
  nepali_date?: string;
  tags: string[];
  is_template?: boolean;
  template_uuid?: string | null;
  from_template_id?: string | null;
}

export interface DiaryEntryCreatePayload {
  date: string;
  title?: string;
  encrypted_blob: string;
  encryption_iv: string;
  mood?: number;
  weather_code?: WeatherCode;
  location?: string;
  content_length?: number;
  daily_metrics?: DiaryDailyMetrics;
  nepali_date?: string;
  tags?: string[];
  is_template?: boolean;
  from_template_id?: string | null;
}

export interface DiaryEntryUpdatePayload extends DiaryEntryCreatePayload {
  uuid: string;
}

export interface DiaryCalendarData {
  date: string;
  has_entry: boolean;
  mood?: number;
  media_count: number;
}

export interface MoodStats {
  total_entries: number;
  average_mood: number;
  mood_distribution: Record<number, number>;
}

export interface WellnessTrendPoint {
  date: string;
  value: number | null;
  label?: string;
}

export interface FinancialPoint {
  date?: string;
  income: number;
  expense: number;
  cumulativeSavings: number;
}

export interface WellnessStats {
  // Period info
  periodStart: string;
  periodEnd: string;
  totalDays: number;
  daysWithData: number;
  
  // Summary metrics
  wellnessScore: number | null;
  averageMood: number | null;
  averageSleep: number | null;
  
  // Mood data
  moodTrend: WellnessTrendPoint[];
  moodDistribution: Record<number, number>;
  
  // Sleep data
  sleepTrend: WellnessTrendPoint[];
  sleepQualityDays: number;
  
  // Exercise data
  exerciseTrend: WellnessTrendPoint[];
  daysExercised: number;
  exerciseFrequencyPerWeek: number;
  averageExerciseMinutes: number | null;
  
  // Screen time
  screenTimeTrend: WellnessTrendPoint[];
  averageScreenTime: number | null;
  
  // Energy & Stress
  energyTrend: WellnessTrendPoint[];
  stressTrend: WellnessTrendPoint[];
  averageEnergy: number | null;
  averageStress: number | null;
  
  // Hydration
  hydrationTrend: WellnessTrendPoint[];
  averageWaterIntake: number | null;
  
  // Mental wellness habits
  meditationDays: number;
  gratitudeDays: number;
  socialInteractionDays: number;
  
  // Correlations
  moodSleepCorrelation: Array<{ mood: number | null; sleep: number | null }>;
  correlationCoefficient: number | null;
  
  // Wellness score breakdown
  wellnessComponents: Record<string, number>;
  
  // Financial data
  financialTrend: FinancialPoint[];
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  averageDailyIncome: number | null;
  averageDailyExpense: number | null;
  
  // Insights
  insights: Array<{
    type: 'positive' | 'negative' | 'neutral';
    message: string;
    metric: string;
  }>;
}

export interface WeeklyHighlights {
  periodStart: string;
  periodEnd: string;
  notesCreated: number;
  documentsUploaded: number;
  todosCompleted: number;
  diaryEntries: number;
  archiveItemsAdded: number;
  projectsCreated: number;
  projectsCompleted: number;
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
}

// Habit Tracking Types
export interface HabitData {
  [habitName: string]: {
    value: number | string;
    unit?: string;
    streak?: number;
  };
}

export interface HabitAnalytics {
  periodStart: string;
  periodEnd: string;
  totalDays: number;
  daysWithData: number;
  habits: Array<{
    name: string;
    unit: string;
    totalValue: number;
    averageValue: number;
    daysCompleted: number;
    completionRate: number;
    currentStreak: number;
    longestStreak: number;
    trend: Array<{
      date: string;
      value: number | string;
      streak: number;
    }>;
  }>;
}

export interface HabitInsight {
  type: 'positive' | 'negative' | 'neutral';
  habit: string;
  message: string;
  data?: any;
}

export interface HabitInsights {
  periodStart: string;
  periodEnd: string;
  insights: HabitInsight[];
  summary: {
    totalHabits: number;
    activeHabits: number;
    topPerformingHabit?: string;
    mostConsistentHabit?: string;
    needsAttentionHabits: string[];
  };
}

export type SortField = 'date' | 'created_at' | 'mood';
export type SortOrder = 'asc' | 'desc'; 