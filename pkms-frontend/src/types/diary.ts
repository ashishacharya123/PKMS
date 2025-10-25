export interface DiaryDailyMetrics {
  // Core wellness metrics (matching backend default_habits_json)
  sleepDuration?: number;     // hours
  stressLevel?: number;       // 1-5 scale  
  exerciseMinutes?: number;   // minutes
  meditationMinutes?: number; // minutes
  screenTime?: number;       // hours
  steps?: number;             // step count
  learning?: number;           // learning minutes
  outdoor?: number;           // outdoor hours
  social?: number;            // social interaction hours
  
  // Custom fields for user-defined habits
  customFields?: Record<string, unknown>;
}

export interface DiaryDailyMetadata {
  date: string;
  nepaliDate?: string;
  metrics: DiaryDailyMetrics;
  createdAt: string;
  updatedAt: string;
}

export const WEATHER_CODES = [
  { value: 0, label: 'Freezing (0-5°C)' },
  { value: 1, label: 'Cold (5-10°C)' },
  { value: 2, label: 'Cool (10-15°C)' },
  { value: 3, label: 'Mild (15-20°C)' },
  { value: 4, label: 'Warm (20-25°C)' },
  { value: 5, label: 'Hot (25-35°C)' },
  { value: 6, label: 'Scorching (35°C+)' },
] as const;

export type WeatherCode = typeof WEATHER_CODES[number]['value'];

export interface DiaryEntry {
  uuid: string;
  date: string;
  nepaliDate?: string;
  title?: string;
  encryptedBlob: string;
  encryptionIv: string;
  mood?: number;
  weatherCode?: WeatherCode;
  weatherLabel?: string;
  location?: string;
  dailyMetrics: DiaryDailyMetrics;
  // Top-level financial fields (backend structure)
  dailyIncome?: number;
  dailyExpense?: number;
  isOfficeDay?: boolean;
  isTemplate?: boolean;
  fromTemplateId?: string | null;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  tags: string[];
  contentLength?: number;
}

export interface DiaryEntrySummary {
  uuid: string;
  date: string;
  nepaliDate?: string;
  title?: string;
  mood?: number;
  weatherCode?: WeatherCode;
  weatherLabel?: string;
  location?: string;
  dailyMetrics: DiaryDailyMetrics;
  // Top-level financial fields (backend structure)
  dailyIncome?: number;
  dailyExpense?: number;
  isOfficeDay?: boolean;
  isTemplate?: boolean;
  fromTemplateId?: string | null;
  createdAt: string;
  fileCount: number;
  encryptedBlob: string;
  encryptionIv: string;
  tags: string[];
  contentLength?: number;
  isFavorite?: boolean;
}

export interface DiaryFormValues {
  uuid: string | null;
  date: Date;
  title: string;
  content: string;
  mood: number;
  weatherCode?: WeatherCode;
  location?: string;
  dailyMetrics: DiaryDailyMetrics;
  nepaliDate?: string;
  tags: string[];
  isTemplate?: boolean;
  templateUuid?: string | null;
  fromTemplateId?: string | null;
}

export interface DiaryEntryCreatePayload {
  date: string;
  title?: string;
  encryptedBlob: string;
  encryptionIv: string;
  mood?: number;
  weatherCode?: WeatherCode;
  location?: string;
  contentLength?: number;
  dailyMetrics?: DiaryDailyMetrics;
  nepaliDate?: string;
  tags?: string[];
  isTemplate?: boolean;
  fromTemplateId?: string | null;
}

export interface DiaryEntryUpdatePayload extends DiaryEntryCreatePayload {
  uuid: string;
}

export interface DiaryCalendarData {
  date: string;
  hasEntry: boolean;
  mood?: number;
  fileCount: number;
}

export interface MoodStats {
  totalEntries: number;
  averageMood: number;
  moodDistribution: Record<number, number>;
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
  
  // Stress
  stressTrend: WellnessTrendPoint[];
  averageStress: number | null;
  
  // Meditation
  meditationTrend: WellnessTrendPoint[];
  averageMeditation: number | null;
  
  // Steps
  stepsTrend: WellnessTrendPoint[];
  averageSteps: number | null;
  
  // Learning
  learningTrend: WellnessTrendPoint[];
  averageLearning: number | null;
  
  // Outdoor
  outdoorTrend: WellnessTrendPoint[];
  averageOutdoor: number | null;
  
  // Social
  socialTrend: WellnessTrendPoint[];
  averageSocial: number | null;
  
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

/**
 * URL Query Parameter Values - MUST stay snake_case
 * These values are sent to the backend API as URL query parameters
 * (e.g., ?sort_by=created_at&sort_order=desc)
 * The Pydantic CamelCaseModel only converts JSON request/response bodies, not URL parameters
 */
export type SortField = 'date' | 'created_at' | 'mood';
export type SortOrder = 'asc' | 'desc'; 