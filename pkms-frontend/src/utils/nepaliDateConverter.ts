/**
 * Nepali Date Converter
 *
 * Converts Gregorian (AD) dates to Bikram Sambat (BS) using calendar data
 * for accurate day calculations.
 */

import { NEPALI_DAY_NAMES, NEPALI_MONTH_NAMES, convertToDevanagari } from './nepaliConstants';

export interface NepaliDateInfo {
  nepaliDate: string;           // "2080/10/01" - sortable format
  nepaliDateDisplay: string;    // "बैशाख १५, २०८०" - display format
  dayOfWeek: string;            // "आइतबार" - Nepali day name
  dayOfWeekEn: string;          // "Sunday" - English day name
}

// Reference date for conversion is 2075/01/01 BS and 2018/4/14 AD
// Note: REFERENCE_EN_DATE uses 1-indexed month (4 = April)
const NP_INITIAL_YEAR = 2075;
const REFERENCE_EN_DATE: [number, number, number] = [2018, 4, 14]; // [year, month (1-indexed), day]

// English month constant data (will never change)
const EN_MONTHS: number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const EN_LEAP_YEAR_MONTHS: number[] = [
    31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
];

// Nepali months data for the range (2075-2090 BS ≈ 2018-2033 AD)
const NP_MONTHS_DATA: Array<[number[], number]> = [
    [[31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], 366], // 2075 BS - 2018/2019 AD
    [[30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], 365], // 2076 BS
    [[31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], 365], // 2077 BS
    [[31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], 365], // 2078 BS
    [[31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], 366], // 2079 BS
    [[30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], 365], // 2080 BS
    [[31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], 365], // 2081 BS
    [[31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], 365], // 2082 BS
    [[31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], 366], // 2083 BS
    [[31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31], 365], // 2084 BS
    [[31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], 365], // 2085 BS
    [[31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], 365], // 2086 BS
    [[31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], 366], // 2087 BS
    [[31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], 365], // 2088 BS
    [[31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], 365], // 2089 BS
    [[31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], 365], // 2090 BS - 2033/2034 AD
];

/**
 * Check if a year is a leap year in English calendar
 */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Calculate days from reference date to given English date
 * Reference: April 14, 2018 (month index 3, day 14) = Baishakh 1, 2075 BS
 * Input: JavaScript Date month is 0-indexed (0=Jan, 10=Nov)
 */
function calculateDaysFromReference(year: number, month: number, date: number): number {
  // Convert reference month from 1-indexed to 0-indexed
  const refYear = REFERENCE_EN_DATE[0];
  const refMonth = REFERENCE_EN_DATE[1] - 1; // Convert 4 (April) to 3 (0-indexed)
  const refDay = REFERENCE_EN_DATE[2];

  // Calculate days from reference date to target date
  let days = 0;

  // If same year, calculate directly
  if (year === refYear) {
    const enMonths = isLeapYear(year) ? EN_LEAP_YEAR_MONTHS : EN_MONTHS;
    if (month === refMonth) {
      // Same month: just day difference
      days = date - refDay;
    } else if (month > refMonth) {
      // Later month: add remaining days in ref month + full months + days in target month
      days = enMonths[refMonth] - refDay; // Days remaining in reference month
      for (let m = refMonth + 1; m < month; m++) {
        days += enMonths[m]; // Full months between
      }
      days += date; // Days in target month
    } else {
      // Earlier month: negative days (shouldn't happen for our use case)
      for (let m = month; m < refMonth; m++) {
        days -= enMonths[m];
      }
      days += date - refDay;
    }
    return days;
  }

  // Different year: calculate days from reference to end of ref year, then add full years, then add target year days
  const refYearMonths = isLeapYear(refYear) ? EN_LEAP_YEAR_MONTHS : EN_MONTHS;
  
  // Days from reference date to end of reference year
  days = refYearMonths[refMonth] - refDay; // Remaining days in reference month
  for (let m = refMonth + 1; m < 12; m++) {
    days += refYearMonths[m]; // Remaining months in reference year
  }

  // Add full years between reference year and target year
  for (let y = refYear + 1; y < year; y++) {
    days += isLeapYear(y) ? 366 : 365;
  }

  // Add days from start of target year to target date
  const targetYearMonths = isLeapYear(year) ? EN_LEAP_YEAR_MONTHS : EN_MONTHS;
  for (let m = 0; m < month; m++) {
    days += targetYearMonths[m]; // Full months before target month
  }
  days += date; // Days in target month

  return days;
}

/**
 * Convert Gregorian date to Bikram Sambat using calendar data calculation
 */
export function convertADtoBS(year: number, month: number, date: number): NepaliDateInfo {
  // Calculate days from reference date (April 14, 1943 = January 1, 2000 BS)
  const daysFromReference = calculateDaysFromReference(year, month, date);

  // Convert to BS date by counting through Nepali years
  let bsYear = NP_INITIAL_YEAR;
  let remainingDays = daysFromReference;

  // Find the BS year
  for (let yearIndex = 0; yearIndex < NP_MONTHS_DATA.length; yearIndex++) {
    const [_, totalDays] = NP_MONTHS_DATA[yearIndex];

    if (remainingDays < totalDays) {
      bsYear = NP_INITIAL_YEAR + yearIndex;
      break;
    }

    remainingDays -= totalDays;
  }

  // Find the BS month and day
  const yearIndex = bsYear - NP_INITIAL_YEAR;
  const [monthData] = NP_MONTHS_DATA[yearIndex];

  let bsMonth = 0;
  let bsDay = 0;

  for (let monthIndex = 0; monthIndex < monthData.length; monthIndex++) {
    const monthDays = monthData[monthIndex];

    if (remainingDays < monthDays) {
      bsMonth = monthIndex;
      bsDay = remainingDays + 1;
      break;
    }

    remainingDays -= monthDays;
  }

  // Create the input date object for day of week calculation
  const inputDate = new Date(year, month, date);

  // Get day names
  const dayOfWeekEn = inputDate.toLocaleDateString('en-US', { weekday: 'long' });
  const dayOfWeekNepali = NEPALI_DAY_NAMES[dayOfWeekEn] || 'अज्ञात';

  // Format the sortable date (YYYY/MM/DD)
  const sortableMonth = String(bsMonth + 1).padStart(2, '0');
  const sortableDay = String(bsDay).padStart(2, '0');
  const nepaliDateSortable = `${bsYear}/${sortableMonth}/${sortableDay}`;

  // Format the display date with Devanagari numbers
  const monthName = NEPALI_MONTH_NAMES[bsMonth];
  const dayDevanagari = convertToDevanagari(bsDay.toString());
  const yearDevanagari = convertToDevanagari(bsYear.toString());
  const nepaliDateDisplay = `${monthName} ${dayDevanagari}, ${yearDevanagari}`;

  return {
    nepaliDate: nepaliDateSortable,
    nepaliDateDisplay,
    dayOfWeek: dayOfWeekNepali,
    dayOfWeekEn
  };
}

/**
 * Convenience function that accepts a Date object
 */
export function convertToNepali(date: Date): NepaliDateInfo {
  return convertADtoBS(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}