import { useState, useEffect } from 'react';
import NepaliDate from 'nepali-date-converter';

// Nepali month names in Devanagari
const nepaliMonths = [
  'बैशाख', 'जेठ', 'असार', 'साउन', 
  'भदौ', 'असोज', 'कार्तिक', 'मंसिर', 
  'पौष', 'माघ', 'फाल्गुन', 'चैत'
];

// Nepali day names in Devanagari  
const nepaliDays = [
  'आइतबार',    // Sunday
  'सोमबार',     // Monday  
  'मंगलबार',    // Tuesday
  'बुधबार',     // Wednesday
  'बिहिबार',    // Thursday
  'शुक्रबार',   // Friday
  'शनिबार'     // Saturday
];

// English to Nepali day mapping 
const englishToNepaliDay = {
  'Sunday': 'आइतबार',
  'Monday': 'सोमबार', 
  'Tuesday': 'मंगलबार',
  'Wednesday': 'बुधबार',
  'Thursday': 'बिहिबार',
  'Friday': 'शुक्रबार',
  'Saturday': 'शनिबार'
};

// English to Devanagari numeral mapping
const englishToDevanagariDigits = {
  '0': '०', '1': '१', '2': '२', '3': '३', '4': '४',
  '5': '५', '6': '६', '7': '७', '8': '८', '9': '९'
};

// Convert English numerals to Devanagari
const convertToDevanagariNumerals = (text: string): string => {
  return text.replace(/[0-9]/g, (digit) => englishToDevanagariDigits[digit as keyof typeof englishToDevanagariDigits] || digit);
};

export interface DateTimeInfo {
  currentTime: Date;
  formattedTime: string;
  formattedDate: string;
  nepaliDate: string;
  nepaliDateFormatted: string;
  nepaliDay: string;
  isLoading: boolean;
}

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
        const nepaliMonthName = nepaliMonths[nepMonth] || 'अज्ञात';
        const devanagariDay = convertToDevanagariNumerals(nepDay.toString());
        const devanagariYear = convertToDevanagariNumerals(nepYear.toString());
        setNepaliDateFormatted(`${nepaliMonthName} ${devanagariDay}, ${devanagariYear}`);
        
        // Get Nepali day name
        const englishDayName = now.toLocaleDateString('en-US', { weekday: 'long' });
        setNepaliDay(englishToNepaliDay[englishDayName as keyof typeof englishToNepaliDay] || 'अज्ञात');
        
      } catch (error) {
        console.warn('Failed to convert to Nepali date:', error);
        setNepaliDate('--/--/----');
        setNepaliDateFormatted('अज्ञात मिति');
        setNepaliDay('अज्ञात दिन');
      }
      
      setIsLoading(false);
    };

    updateTime(); // Initial update
    const interval = setInterval(updateTime, 10000); // Update every 10 seconds (changed from 60000)

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