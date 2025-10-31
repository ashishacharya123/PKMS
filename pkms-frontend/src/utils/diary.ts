import { format, parseISO } from 'date-fns';
import { nepaliDateCache } from './nepaliDateCache';

export const getMoodLabel = (mood: number): string => {
  const labels = {
    1: 'Very Bad',
    2: 'Bad',
    3: 'Neutral',
    4: 'Good',
    5: 'Excellent'
  };
  return labels[mood as keyof typeof labels] || 'Unknown';
};

export const getMoodEmoji = (mood: number): string => {
  const emojis = {
    1: '😢',
    2: '😕',
    3: '😐',
    4: '😊',
    5: '😄'
  };
  return emojis[mood as keyof typeof emojis] || '-';
};

export const getMoodColor = (mood: number): string => {
  const colors = {
    1: 'red',
    2: 'orange',
    3: 'yellow',
    4: 'lime',
    5: 'green'
  };
  return colors[mood as keyof typeof colors] || 'gray';
};

export const convertToNepaliDate = (englishDate: Date | string): string => {
  try {
    const date = typeof englishDate === 'string' ? new Date(englishDate) : englishDate;
    const info = nepaliDateCache.convert(date);
    return info.nepaliDate;
  } catch (error) {
    console.error('Failed to convert to Nepali date:', error);
    return 'N/A';
  }
};

export const formatDate = (dateInput: string | Date | number): string => {
  try {
    let date: Date;
    if (dateInput instanceof Date) {
      date = dateInput;
    } else if (typeof dateInput === 'number') {
      date = new Date(dateInput);
    } else {
      const trimmed = (dateInput || '').toString().trim();
      if (!trimmed) return 'N/A';
      const parsed = parseISO(trimmed);
      date = isNaN(parsed.getTime()) ? new Date(trimmed) : parsed;
    }
    if (isNaN(date.getTime())) return 'N/A';
    return format(date, 'MMM d, yyyy');
  } catch {
    return 'N/A';
  }
};

export const formatDateTime = (dateTime?: string | Date | number): string => {
  try {
    if (dateTime === undefined || dateTime === null) return 'N/A';
    let date: Date;
    if (dateTime instanceof Date) {
      date = dateTime;
    } else if (typeof dateTime === 'number') {
      date = new Date(dateTime);
    } else {
      const trimmed = (dateTime || '').toString().trim();
      if (!trimmed) return 'N/A';
      const parsed = parseISO(trimmed);
      date = isNaN(parsed.getTime()) ? new Date(trimmed) : parsed;
    }
    if (isNaN(date.getTime())) return 'N/A';
    return format(date, 'MMM d, yyyy h:mm a');
  } catch {
    return 'N/A';
  }
};

export const isToday = (date: string): boolean => {
  const today = format(new Date(), 'yyyy-MM-dd');
  return date === today;
}; 