import { useState, useEffect } from 'react';
import { ViewMode } from '../components/common/ViewMenu';

type ViewPreferences = {
  documents: ViewMode;
  notes: ViewMode;
  diary: ViewMode;
  archive: ViewMode;
  todos: ViewMode;
};

const DEFAULT_PREFERENCES: ViewPreferences = {
  documents: 'medium-icons',
  notes: 'medium-icons',
  diary: 'medium-icons',
  archive: 'medium-icons',
  todos: 'medium-icons',
};

const STORAGE_KEY = 'pkms-view-preferences';

export function useViewPreferences() {
  const [preferences, setPreferences] = useState<ViewPreferences>(DEFAULT_PREFERENCES);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
      }
    } catch (error) {
      console.warn('Failed to load view preferences from localStorage:', error);
    }
  }, []);

  // Save preferences to localStorage when they change
  const updatePreference = (module: keyof ViewPreferences, viewMode: ViewMode) => {
    const newPreferences = { ...preferences, [module]: viewMode };
    setPreferences(newPreferences);
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPreferences));
    } catch (error) {
      console.warn('Failed to save view preferences to localStorage:', error);
    }
  };

  return {
    preferences,
    updatePreference,
    getPreference: (module: keyof ViewPreferences) => preferences[module],
  };
}
