/**
 * Backup Store - Zustand store for database backup and restore operations
 */

import { create } from 'zustand';
import { backupService } from '../services/backupService';

interface BackupState {
  // UI State
  isLoading: boolean;
  isBackingUp: boolean;
  isRestoring: boolean;
  error: string | null;
  
  // Backup Info
  lastBackupDate: string | null;
  backupSize: number | null;
  availableBackups: string[];
  
  // Actions
  createBackup: () => Promise<boolean>;
  restoreBackup: (backupPath: string) => Promise<boolean>;
  listBackups: () => Promise<void>;
  deleteBackup: (backupPath: string) => Promise<boolean>;
  downloadBackup: (backupPath: string) => Promise<void>;
  clearError: () => void;
}

export const useBackupStore = create<BackupState>((set, get) => ({
  // Initial state
  isLoading: false,
  isBackingUp: false,
  isRestoring: false,
  error: null,
  lastBackupDate: null,
  backupSize: null,
  availableBackups: [],

  // Actions
  createBackup: async () => {
    set({ isBackingUp: true, error: null });
    try {
      const result = await backupService.createBackup();
      if (result.success) {
        set({ 
          lastBackupDate: new Date().toISOString(),
          isBackingUp: false 
        });
        // Refresh backup list
        await get().listBackups();
        return true;
      } else {
        set({ 
          error: result.error || 'Backup failed',
          isBackingUp: false 
        });
        return false;
      }
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Backup failed',
        isBackingUp: false 
      });
      return false;
    }
  },

  restoreBackup: async (backupPath: string) => {
    set({ isRestoring: true, error: null });
    try {
      const result = await backupService.restoreBackup(backupPath);
      if (result.success) {
        set({ isRestoring: false });
        return true;
      } else {
        set({ 
          error: result.error || 'Restore failed',
          isRestoring: false 
        });
        return false;
      }
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Restore failed',
        isRestoring: false 
      });
      return false;
    }
  },

  listBackups: async () => {
    set({ isLoading: true, error: null });
    try {
      const backups = await backupService.listBackups();
      set({ 
        availableBackups: backups,
        isLoading: false 
      });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to list backups',
        isLoading: false 
      });
    }
  },

  deleteBackup: async (backupPath: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await backupService.deleteBackup(backupPath);
      if (result.success) {
        // Refresh backup list
        await get().listBackups();
        set({ isLoading: false });
        return true;
      } else {
        set({ 
          error: result.error || 'Delete failed',
          isLoading: false 
        });
        return false;
      }
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Delete failed',
        isLoading: false 
      });
      return false;
    }
  },

  downloadBackup: async (backupPath: string) => {
    set({ isLoading: true, error: null });
    try {
      await backupService.downloadBackup(backupPath);
      set({ isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Download failed',
        isLoading: false 
      });
    }
  },

  clearError: () => set({ error: null }),
}));
