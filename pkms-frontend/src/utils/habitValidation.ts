/**
 * HabitValidation - Input validation utilities for habit data
 * 
 * PURPOSE:
 * ========
 * Validates habit data before submission to prevent bad requests and improve UX.
 * 
 * FEATURES:
 * =========
 * - Type validation (numbers only)
 * - Range validation (non-negative values)
 * - NaN detection
 * - Comprehensive error messages
 * 
 * @author AI Agent
 * @date 2025-01-XX
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate habit data before saving
 * @param defaultData Default habits data (e.g., sleep, exercise, etc.)
 * @param definedData User-defined custom habits data
 * @returns Validation result with errors if any
 */
export const validateHabitData = (
  defaultData: Record<string, number>,
  definedData: Record<string, number>
): ValidationResult => {
  const errors: string[] = [];

  // Validate default habits values
  for (const [key, value] of Object.entries(defaultData)) {
    if (typeof value !== 'number' || isNaN(value)) {
      errors.push(`Invalid value for habit "${key}": must be a number`);
    } else if (value < 0) {
      errors.push(`Value for "${key}" cannot be negative`);
    }
    // Add specific validations per habit type if needed
    // For example, sleep should be between 0-24 hours
    if (key === 'sleep' && value > 24) {
      errors.push(`Sleep value for "${key}" cannot exceed 24 hours`);
    }
  }

  // Validate defined habits values
  for (const [key, value] of Object.entries(definedData)) {
    if (typeof value !== 'number' || isNaN(value)) {
      errors.push(`Invalid value for habit "${key}": must be a number`);
    } else if (value < 0) {
      errors.push(`Value for "${key}" cannot be negative`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate a single habit value
 * @param habitKey Habit identifier
 * @param value Value to validate
 * @returns Error message if invalid, null if valid
 */
export const validateSingleHabitValue = (
  habitKey: string,
  value: number
): string | null => {
  if (typeof value !== 'number' || isNaN(value)) {
    return `Invalid value for habit "${habitKey}": must be a number`;
  }
  if (value < 0) {
    return `Value for "${habitKey}" cannot be negative`;
  }
  if (habitKey === 'sleep' && value > 24) {
    return `Sleep value cannot exceed 24 hours`;
  }
  return null;
};

