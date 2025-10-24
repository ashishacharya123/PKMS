/**
 * Smart Nepali date caching system with LRU eviction
 * Provides both sortable and display formats for efficient filtering and UI
 */

import NepaliDate from 'nepali-date-converter';
import { NEPALI_DAY_NAMES, NEPALI_MONTH_NAMES, convertToDevanagari } from './nepaliConstants';

export interface NepaliDateInfo {
  nepaliDate: string;           // "2080/10/01" - sortable, for filtering
  nepaliDateDisplay: string;    // "बैशाख १५, २०८०" - Devanagari formatted for display
  dayOfWeek: string;            // "आइतबार" - Nepali day name
  dayOfWeekEn: string;          // "Sunday" - English day name
}

class NepaliDateCache {
  private cache = new Map<string, NepaliDateInfo>();
  private readonly MAX_SIZE = 20; // LRU cache size
  
  /**
   * Convert a date to Nepali date information with caching
   * @param date - Date object or ISO string
   * @returns NepaliDateInfo with both sortable and display formats
   */
  convert(date: Date | string): NepaliDateInfo {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const key = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD key
    
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    
    const nepDate = new NepaliDate(dateObj);
    const nepaliDate = nepDate.format('YYYY/MM/DD') ?? '0000/00/00'; // Sortable format
    
    const nepMonth = NEPALI_MONTH_NAMES[nepDate.getMonth()];
    const nepDay = convertToDevanagari(nepDate.getDate().toString());
    const nepYear = convertToDevanagari(nepDate.getYear().toString());
    const nepaliDateDisplay = `${nepMonth} ${nepDay}, ${nepYear}`;
    
    const dayOfWeekEn = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const dayOfWeek = NEPALI_DAY_NAMES[dayOfWeekEn] ?? 'अज्ञात';
    
    const info: NepaliDateInfo = {
      nepaliDate,
      nepaliDateDisplay,
      dayOfWeek,
      dayOfWeekEn
    };
    
    // LRU eviction
    if (this.cache.size >= this.MAX_SIZE) {
      const first = this.cache.keys().next().value;
      if (first) {
        this.cache.delete(first);
      }
    }
    
    this.cache.set(key, info);
    return info;
  }
  
  /**
   * Pre-cache dates for dashboard (past 7 days + today + next 3 days)
   * Called on dashboard mount for optimal performance
   */
  preCacheDashboard() {
    const today = new Date();
    for (let i = -7; i <= 3; i++) { // Past 7 days + today + next 3 days
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      this.convert(d);
    }
  }
  
  /**
   * Clear the cache (useful for testing or memory management)
   */
  clear() {
    this.cache.clear();
  }
  
  /**
   * Get cache size for debugging
   */
  get size() {
    return this.cache.size;
  }
}

export const nepaliDateCache = new NepaliDateCache();
