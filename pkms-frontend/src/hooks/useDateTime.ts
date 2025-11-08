/**
 * DateTime Hook
 * 
 * Provides current time, formatted time, and Nepali date/day information.
 * Optimized for static date/day values with 60-second update frequency.
 * Used in Layout component for time display and date information.
 */

import { useState, useEffect } from 'react';
import { nepaliDateCache } from '../utils/nepaliDateCache';

export interface DateTimeInfo {
  currentTime: Date;
  formattedTime: string;
  formattedDate: string;
  nepaliDate: string;
  nepaliDateFormatted: string;
  nepaliDay: string;
  isLoading: boolean;
}

/**
 * Custom hook for date/time management with Nepali calendar support.
 * Returns current time, formatted time, and Nepali date information.
 */
export function useDateTime(): DateTimeInfo {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [nepaliDate, setNepaliDate] = useState('');
  const [nepaliDateFormatted, setNepaliDateFormatted] = useState('');
  const [nepaliDay, setNepaliDay] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now);
      
      try {
        const info = nepaliDateCache.convert(now);
        setNepaliDate(info.nepaliDate);
        setNepaliDateFormatted(info.nepaliDateDisplay);
        setNepaliDay(info.dayOfWeek);
      } catch (_e) {
        setNepaliDate('N/A');
        setNepaliDateFormatted('N/A');
        setNepaliDay('N/A');
      }
      
      setIsLoading(false);
    };

    updateTime(); // Initial update
    const interval = setInterval(updateTime, 60_000); // Update every 60 seconds; UI only needs minute/day changes

    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return {
    currentTime,
    formattedTime: formatTime(currentTime),
    formattedDate: formatDate(currentTime),
    nepaliDate,
    nepaliDateFormatted,
    nepaliDay,
    isLoading
  };
} 