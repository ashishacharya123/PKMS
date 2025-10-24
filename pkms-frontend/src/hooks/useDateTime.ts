/**
 * DateTime Hook
 * 
 * Provides current time, formatted time, and Nepali date/day information.
 * Optimized for static date/day values with 60-second update frequency.
 * Used in Layout component for time display and date information.
 */

import { useState, useEffect } from 'react';
import NepaliDate from 'nepali-date-converter';
import { NEPALI_MONTH_NAMES, NEPALI_DAY_NAMES, convertToDevanagari } from '../utils/nepaliConstants';

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
        // Convert to Nepali date
        const nepDate = new NepaliDate(now);
        
        // Basic format
        setNepaliDate(nepDate.format('YYYY/MM/DD'));
        
        // Get components
        const nepYear = nepDate.getYear();
        const nepMonth = nepDate.getMonth(); // 0-indexed
        const nepDay = nepDate.getDate();
        
        // Format with Nepali month name and Devanagari numerals
        const nepaliMonthName = NEPALI_MONTH_NAMES[nepMonth] || 'अज्ञात';
        const devanagariDay = convertToDevanagari(nepDay.toString());
        const devanagariYear = convertToDevanagari(nepYear.toString());
        setNepaliDateFormatted(`${nepaliMonthName} ${devanagariDay}, ${devanagariYear}`);
        
        // Get Nepali day name
        const englishDayName = now.toLocaleDateString('en-US', { weekday: 'long' });
        setNepaliDay(NEPALI_DAY_NAMES[englishDayName] || 'अज्ञात');
        
      } catch (error) {
        console.warn('Failed to convert to Nepali date:', error);
        setNepaliDate('--/--/----');
        setNepaliDateFormatted('अज्ञात मिति');
        setNepaliDay('अज्ञात दिन');
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