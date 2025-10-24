/**
 * BackupStore Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBackupStore } from '../backupStore';

// Mock the backupService
vi.mock('../../services/backupService', () => ({
  backupService: {
    createBackup: vi.fn(),
    restoreBackup: vi.fn(),
    listBackups: vi.fn(),
    deleteBackup: vi.fn(),
    downloadBackup: vi.fn()
  }
}));

describe('backupStore', () => {
  beforeEach(() => {
    // Reset store state
    useBackupStore.setState({
      isLoading: false,
      isBackingUp: false,
      isRestoring: false,
      error: null,
      lastBackupDate: null,
      backupSize: null,
      availableBackups: []
    });
  });

  describe('createBackup', () => {
    it('creates backup successfully', async () => {
      const { backupService } = await import('../../services/backupService');
      vi.mocked(backupService.createBackup).mockResolvedValue({
        success: true,
        backup_path: '/backups/backup-2024-01-21.db'
      });

      const { result } = renderHook(() => useBackupStore());

      let success;
      await act(async () => {
        success = await result.current.createBackup();
      });

      expect(success).toBe(true);
      expect(result.current.isBackingUp).toBe(false);
      expect(result.current.lastBackupDate).toBeTruthy();
      expect(result.current.error).toBe(null);
    });

    it('handles backup creation error', async () => {
      const { backupService } = await import('../../services/backupService');
      vi.mocked(backupService.createBackup).mockResolvedValue({
        success: false,
        error: 'Backup failed'
      });

      const { result } = renderHook(() => useBackupStore());

      let success;
      await act(async () => {
        success = await result.current.createBackup();
      });

      expect(success).toBe(false);
      expect(result.current.isBackingUp).toBe(false);
      expect(result.current.error).toBe('Backup failed');
    });

    it('handles backup creation exception', async () => {
      const { backupService } = await import('../../services/backupService');
      vi.mocked(backupService.createBackup).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useBackupStore());

      let success;
      await act(async () => {
        success = await result.current.createBackup();
      });

      expect(success).toBe(false);
      expect(result.current.isBackingUp).toBe(false);
      expect(result.current.error).toBe('Network error');
    });
  });

  describe('restoreBackup', () => {
    it('restores backup successfully', async () => {
      const { backupService } = await import('../../services/backupService');
      vi.mocked(backupService.restoreBackup).mockResolvedValue({
        success: true
      });

      const { result } = renderHook(() => useBackupStore());

      let success;
      await act(async () => {
        success = await result.current.restoreBackup('/backups/backup-2024-01-21.db');
      });

      expect(success).toBe(true);
      expect(result.current.isRestoring).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('handles restore error', async () => {
      const { backupService } = await import('../../services/backupService');
      vi.mocked(backupService.restoreBackup).mockResolvedValue({
        success: false,
        error: 'Restore failed'
      });

      const { result } = renderHook(() => useBackupStore());

      let success;
      await act(async () => {
        success = await result.current.restoreBackup('/backups/backup-2024-01-21.db');
      });

      expect(success).toBe(false);
      expect(result.current.isRestoring).toBe(false);
      expect(result.current.error).toBe('Restore failed');
    });
  });

  describe('listBackups', () => {
    it('lists backups successfully', async () => {
      const mockBackups = [
        '/backups/backup-2024-01-21.db',
        '/backups/backup-2024-01-20.db'
      ];
      const { backupService } = await import('../../services/backupService');
      vi.mocked(backupService.listBackups).mockResolvedValue(mockBackups);

      const { result } = renderHook(() => useBackupStore());

      await act(async () => {
        await result.current.listBackups();
      });

      expect(result.current.availableBackups).toEqual(mockBackups);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('handles list backups error', async () => {
      const { backupService } = await import('../../services/backupService');
      vi.mocked(backupService.listBackups).mockRejectedValue(new Error('List failed'));

      const { result } = renderHook(() => useBackupStore());

      await act(async () => {
        await result.current.listBackups();
      });

      expect(result.current.availableBackups).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe('List failed');
    });
  });

  describe('deleteBackup', () => {
    it('deletes backup successfully', async () => {
      const { backupService } = await import('../../services/backupService');
      vi.mocked(backupService.deleteBackup).mockResolvedValue({
        success: true
      });
      vi.mocked(backupService.listBackups).mockResolvedValue([
        '/backups/backup-2024-01-20.db'
      ]);

      const { result } = renderHook(() => useBackupStore());

      // Set initial backups
      act(() => {
        useBackupStore.setState({
          availableBackups: [
            '/backups/backup-2024-01-21.db',
            '/backups/backup-2024-01-20.db'
          ]
        });
      });

      let success;
      await act(async () => {
        success = await result.current.deleteBackup('/backups/backup-2024-01-21.db');
      });

      expect(success).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('handles delete error', async () => {
      const { backupService } = await import('../../services/backupService');
      vi.mocked(backupService.deleteBackup).mockResolvedValue({
        success: false,
        error: 'Delete failed'
      });

      const { result } = renderHook(() => useBackupStore());

      let success;
      await act(async () => {
        success = await result.current.deleteBackup('/backups/backup-2024-01-21.db');
      });

      expect(success).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe('Delete failed');
    });
  });

  describe('downloadBackup', () => {
    it('downloads backup successfully', async () => {
      const { backupService } = await import('../../services/backupService');
      vi.mocked(backupService.downloadBackup).mockResolvedValue(undefined);

      const { result } = renderHook(() => useBackupStore());

      await act(async () => {
        await result.current.downloadBackup('/backups/backup-2024-01-21.db');
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('handles download error', async () => {
      const { backupService } = await import('../../services/backupService');
      vi.mocked(backupService.downloadBackup).mockRejectedValue(new Error('Download failed'));

      const { result } = renderHook(() => useBackupStore());

      await act(async () => {
        await result.current.downloadBackup('/backups/backup-2024-01-21.db');
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe('Download failed');
    });
  });

  describe('clearError', () => {
    it('clears error state', () => {
      const { result } = renderHook(() => useBackupStore());

      // Set error first
      act(() => {
        useBackupStore.setState({ error: 'Test error' });
      });

      expect(result.current.error).toBe('Test error');

      // Clear error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe(null);
    });
  });

  describe('state management', () => {
    it('sets loading states correctly during operations', async () => {
      const { backupService } = await import('../../services/backupService');
      vi.mocked(backupService.createBackup).mockImplementation(() => {
        // Check loading state during operation
        expect(useBackupStore.getState().isBackingUp).toBe(true);
        return Promise.resolve({ success: true });
      });

      const { result } = renderHook(() => useBackupStore());

      await act(async () => {
        await result.current.createBackup();
      });

      expect(result.current.isBackingUp).toBe(false);
    });

    it('maintains separate loading states for different operations', async () => {
      const { backupService } = await import('../../services/backupService');
      vi.mocked(backupService.createBackup).mockResolvedValue({ success: true });
      vi.mocked(backupService.restoreBackup).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useBackupStore());

      // Start backup
      act(() => {
        result.current.createBackup();
      });

      expect(result.current.isBackingUp).toBe(true);
      expect(result.current.isRestoring).toBe(false);

      // Start restore
      act(() => {
        result.current.restoreBackup('/backups/test.db');
      });

      expect(result.current.isBackingUp).toBe(true);
      expect(result.current.isRestoring).toBe(true);
    });
  });
});
