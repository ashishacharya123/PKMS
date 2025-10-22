/**
 * Single source of truth for Nepali date constants
 * Extracted from useDateTime.ts to eliminate duplication
 * Used by nepaliDateCache.ts and other date utilities
 */

export const NEPALI_DAY_NAMES: Record<string, string> = {
  'Sunday': 'आइतबार',
  'Monday': 'सोमबार',
  'Tuesday': 'मंगलबार',
  'Wednesday': 'बुधबार',
  'Thursday': 'बिहिबार',
  'Friday': 'शुक्रबार',
  'Saturday': 'शनिबार'
};

export const NEPALI_MONTH_NAMES = [
  'बैशाख', 'जेठ', 'असार', 'साउन',
  'भदौ', 'असोज', 'कार्तिक', 'मंसिर',
  'पौष', 'माघ', 'फाल्गुन', 'चैत'
];

export const ENGLISH_TO_DEVANAGARI: Record<string, string> = {
  '0': '०', '1': '१', '2': '२', '3': '३', '4': '४',
  '5': '५', '6': '६', '7': '७', '8': '८', '9': '९'
};

/**
 * Convert English digits to Devanagari script
 * @param text - Text containing English digits
 * @returns Text with Devanagari digits
 */
export function convertToDevanagari(text: string): string {
  return text.replace(/[0-9]/g, d => ENGLISH_TO_DEVANAGARI[d] || d);
}
