/**
 * Type declarations for nepali-date-converter package
 * Provides TypeScript support for the Nepali date conversion library
 */

declare module 'nepali-date-converter' {
  export default class NepaliDate {
    constructor(date?: Date | string | number);

    // Date conversion methods
    convertBStoAD(): Date;
    convertADtoBS(): void;

    // Getter methods
    getYear(): number;
    getMonth(): number; // 0-based (0 = Baishakh)
    getDate(): number;
    getDay(): number; // 0-based (0 = Sunday)

    // Formatting methods
    format(format: string): string | null;

    // Static methods
    static convertBStoAD(bsYear: number, bsMonth: number, bsDay: number): Date;
    static convertADtoBS(adDate: Date): { year: number; month: number; day: number };

    // Validation
    isValid(): boolean;
  }

  export namespace NepaliDate {
    // Constants for Nepali calendar
    export const MIN_YEAR: number;
    export const MAX_YEAR: number;

    // Month names (if available)
    export const MONTHS: string[];
    export const DAYS: string[];
  }
}