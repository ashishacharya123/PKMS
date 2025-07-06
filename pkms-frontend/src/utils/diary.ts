import { format } from 'date-fns';

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

export const getMoodColor = (mood: number): string => {
  const colors = {
    1: '#F44336', // Red
    2: '#FF9800', // Orange
    3: '#757575', // Gray
    4: '#4CAF50', // Green
    5: '#2196F3'  // Blue
  };
  return colors[mood as keyof typeof colors] || '#757575';
};

export const getMoodEmoji = (mood: number): string => {
  const emojis = {
    1: '😢',
    2: '😞',
    3: '😐',
    4: '😊',
    5: '😄'
  };
  return emojis[mood as keyof typeof emojis] || '😐';
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