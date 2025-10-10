/**
 * Backup Service for PKMS Frontend
 * 
 * Provides database backup and restore capabilities using dedicated API endpoints.
 * This service handles all backup operations independently from testing functionality.
 */

import { apiService } from './api';

// Type definitions for backup operations
export interface BackupFile {
  filename: string;
  full_path: string;
  relative_path: string;
  file_size_bytes: number;
  file_size_kb: number;
  file_size_mb: number;
  created_at: string;
  modified_at: string;
  is_recent: boolean;
}

export interface BackupListResponse {
  status: string;
  message: string;
  backups: BackupFile[];
  backup_count: number;
  backup_directory: string;
  timestamp: string;
}

export interface BackupCreateResponse {
  status: string;
  message: string;
  backup_filename?: string;
  backup_path?: string;
  file_size_bytes?: number;
  file_size_kb?: number;
  file_size_mb?: number;
  created_by?: string;
  error?: string;
  note?: string;
  timestamp: string;
}

export interface BackupRestoreResponse {
  status: string;
  message: string;
  backup_filename?: string;
  backup_info?: {
    filename: string;
    size_bytes: number;
    size_mb: number;
    created_at: string;
  };
  warning?: string;
  restored_by?: string;
  note?: string;
  error?: string;
  timestamp: string;
}

export interface BackupDeleteResponse {
  status: string;
  message: string;
  backup_filename?: string;
  deleted_backup?: {
    filename: string;
    size_bytes: number;
    size_mb: number;
    created_at: string;
  };
  deleted_by?: string;
  error?: string;
  timestamp: string;
}

export interface BackupInfoResponse {
  status: string;
  backup_system: {
    backup_directory: string;
    directory_exists: boolean;
    backup_count: number;
    total_backup_size_bytes: number;
    total_backup_size_mb: number;
    database_location: string;
    backup_location: string;
    file_types_backed_up: string[];
    file_types_not_backed_up: string[];
  };
  file_storage_info: {
    database: string;
    user_content: string;
    content_folders: string[];
  };
  current_limitations: string[];
  timestamp: string;
}

class BackupService {
  /**
   * Format file size in human-readable format
   */
  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * Format date string in user-friendly format
   */
  formatDateTime(isoString: string): string {
    return new Date(isoString).toLocaleString();
  }

  /**
   * Create a new database backup
   */
  async createBackup(backupMethod: 'checkpoint' | 'all_files' | 'vacuum' = 'checkpoint'): Promise<BackupCreateResponse> {
    const formData = new FormData();
    formData.append('backup_method', backupMethod);
    
    // Use axios directly for form data
    const axios = apiService.getAxiosInstance();
         const response = await axios.post('/backup/create', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  }

  /**
   * List all available database backup files
   */
  async listBackups(): Promise<BackupListResponse> {
    const response = await apiService.get('/backup/list');
    return response.data as BackupListResponse;
  }

  /**
   * Restore database from a backup file
   */
  async restoreBackup(backupFilename: string, confirmRestore: boolean = false): Promise<BackupRestoreResponse> {
    const formData = new FormData();
    formData.append('backup_filename', backupFilename);
    formData.append('confirm_restore', confirmRestore.toString());

    const response = await apiService.post('/backup/restore', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data as BackupRestoreResponse;
  }

  /**
   * Delete a specific backup file
   */
  async deleteBackup(backupFilename: string, confirmDelete: boolean = false): Promise<BackupDeleteResponse> {
    const response = await apiService.delete(
      `/backup/delete/${encodeURIComponent(backupFilename)}?confirm_delete=${confirmDelete}`
    );
    return response.data as BackupDeleteResponse;
  }

  /**
   * Get information about the backup system
   */
  async getBackupInfo(): Promise<BackupInfoResponse> {
    const response = await apiService.get('/backup/info');
    return response.data as BackupInfoResponse;
  }

  /**
   * Check if backup operations are currently functional
   */
  async isBackupSystemWorking(): Promise<boolean> {
    try {
      const info = await this.getBackupInfo();
      return info.status === 'success' && !info.current_limitations.length;
    } catch {
      return false;
    }
  }

  /**
   * Get backup statistics
   */
  async getBackupStats(): Promise<{
    totalBackups: number;
    totalSize: number;
    oldestBackup?: BackupFile;
    newestBackup?: BackupFile;
    recentBackups: number;
  } | null> {
    try {
      const listResponse = await this.listBackups();
      if (listResponse.status !== 'success' || !listResponse.backups.length) {
        return null;
      }

      const backups = listResponse.backups;
      const totalSize = backups.reduce((sum, backup) => sum + backup.file_size_bytes, 0);
      const recentBackups = backups.filter(backup => backup.is_recent).length;

      // Sort by creation date for oldest/newest
      const sortedByDate = [...backups].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      return {
        totalBackups: backups.length,
        totalSize,
        oldestBackup: sortedByDate[0],
        newestBackup: sortedByDate[sortedByDate.length - 1],
        recentBackups,
      };
    } catch {
      return null;
    }
  }

  /**
   * Validate backup filename
   */
  isValidBackupFilename(filename: string): boolean {
    // Check for valid backup filename pattern
    const backupPattern = /^pkm_metadata_backup_\d{8}_\d{6}\.db$/;
    return backupPattern.test(filename);
  }

  /**
   * Generate backup filename from timestamp
   */
  generateBackupFilename(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `pkm_metadata_backup_${year}${month}${day}_${hours}${minutes}${seconds}.db`;
  }

  /**
   * Get current WAL file status and analysis
   */
  async getWalStatus(): Promise<any> {
    const response = await apiService.get('/backup/wal-status');
    return response.data;
  }

  /**
   * Manually trigger WAL checkpoint (advanced feature)
   */
  async manualCheckpoint(checkpointMode: 'PASSIVE' | 'FULL' | 'RESTART' = 'FULL'): Promise<any> {
    const formData = new FormData();
    formData.append('checkpoint_mode', checkpointMode);
    
    const axios = apiService.getAxiosInstance();
    const response = await axios.post('/backup/manual-checkpoint', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  }

  /**
   * Format WAL status for display
   */
  formatWalStatus(walStatus: any): string {
    if (!walStatus?.wal_analysis) return 'Unknown';
    
    const { current_size_mb, percentage_of_threshold, recommendation } = walStatus.wal_analysis;
    
    return `${current_size_mb}MB (${percentage_of_threshold.toFixed(1)}% of threshold) - ${recommendation}`;
  }

  /**
   * Check if manual checkpoint is recommended
   */
  isManualCheckpointRecommended(walStatus: any): boolean {
    if (!walStatus?.wal_analysis) return false;
    
    const { status } = walStatus.wal_analysis;
    return status === 'approaching_limit' || status === 'should_auto_checkpoint';
  }
}

export const backupService = new BackupService(); 