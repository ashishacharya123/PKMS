import { format } from 'date-fns';
import NepaliDate from 'nepali-date-converter';

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
    const nepaliDate = new NepaliDate(date);
    return nepaliDate.format('YYYY/MM/DD');
  } catch (error) {
    console.error('Failed to convert to Nepali date:', error);
    return '';
  }
};

export const formatDate = (date: string): string => {
  return format(new Date(date), 'MMM d, yyyy');
};

export const formatDateTime = (dateTime: string): string => {
  return format(new Date(dateTime), 'MMM d, yyyy h:mm a');
};

export const isToday = (date: string): boolean => {
  const today = format(new Date(), 'yyyy-MM-dd');
  return date === today;
}; 