/**
 * Utility functions for file operations
 */

import { IconPhoto, IconFileText, IconFileDescription, IconFileZip, IconMusic, IconVideo, IconCode, IconFile } from '@tabler/icons-react';

/**
 * File type configuration with icons and colors
 */
export const FILE_TYPE_CONFIG = {
  // PDF Documents
  'application/pdf': {
    icon: IconFileText,
    color: 'red',
    label: 'PDF Document',
    category: 'document'
  },

  // Microsoft Office Documents
  'application/msword': {
    icon: IconFileDescription,
    color: 'blue',
    label: 'Word Document',
    category: 'document'
  },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    icon: IconFileDescription,
    color: 'blue',
    label: 'Word Document',
    category: 'document'
  },
  'application/vnd.ms-excel': {
    icon: IconFileDescription,
    color: 'green',
    label: 'Excel Spreadsheet',
    category: 'spreadsheet'
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    icon: IconFileDescription,
    color: 'green',
    label: 'Excel Spreadsheet',
    category: 'spreadsheet'
  },
  'application/vnd.ms-powerpoint': {
    icon: IconFileDescription,
    color: 'orange',
    label: 'PowerPoint Presentation',
    category: 'presentation'
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    icon: IconFileDescription,
    color: 'orange',
    label: 'PowerPoint Presentation',
    category: 'presentation'
  },

  // Images
  'image/jpeg': {
    icon: IconPhoto,
    color: 'green',
    label: 'JPEG Image',
    category: 'image'
  },
  'image/jpg': {
    icon: IconPhoto,
    color: 'green',
    label: 'JPEG Image',
    category: 'image'
  },
  'image/png': {
    icon: IconPhoto,
    color: 'blue',
    label: 'PNG Image',
    category: 'image'
  },
  'image/gif': {
    icon: IconPhoto,
    color: 'purple',
    label: 'GIF Image',
    category: 'image'
  },
  'image/webp': {
    icon: IconPhoto,
    color: 'cyan',
    label: 'WebP Image',
    category: 'image'
  },
  'image/bmp': {
    icon: IconPhoto,
    color: 'gray',
    label: 'BMP Image',
    category: 'image'
  },
  'image/tiff': {
    icon: IconPhoto,
    color: 'indigo',
    label: 'TIFF Image',
    category: 'image'
  },
  'image/svg+xml': {
    icon: IconPhoto,
    color: 'pink',
    label: 'SVG Vector',
    category: 'image'
  },

  // Videos
  'video/mp4': {
    icon: IconVideo,
    color: 'red',
    label: 'MP4 Video',
    category: 'video'
  },
  'video/webm': {
    icon: IconVideo,
    color: 'blue',
    label: 'WebM Video',
    category: 'video'
  },
  'video/quicktime': {
    icon: IconVideo,
    color: 'orange',
    label: 'QuickTime Video',
    category: 'video'
  },
  'video/x-msvideo': {
    icon: IconVideo,
    color: 'purple',
    label: 'AVI Video',
    category: 'video'
  },

  // Audio
  'audio/mpeg': {
    icon: IconMusic,
    color: 'green',
    label: 'MP3 Audio',
    category: 'audio'
  },
  'audio/mp3': {
    icon: IconMusic,
    color: 'green',
    label: 'MP3 Audio',
    category: 'audio'
  },
  'audio/wav': {
    icon: IconMusic,
    color: 'blue',
    label: 'WAV Audio',
    category: 'audio'
  },
  'audio/ogg': {
    icon: IconMusic,
    color: 'purple',
    label: 'OGG Audio',
    category: 'audio'
  },

  // Archives
  'application/zip': {
    icon: IconFileZip,
    color: 'yellow',
    label: 'ZIP Archive',
    category: 'archive'
  },
  'application/x-rar-compressed': {
    icon: IconFileZip,
    color: 'orange',
    label: 'RAR Archive',
    category: 'archive'
  },
  'application/x-7z-compressed': {
    icon: IconFileZip,
    color: 'red',
    label: '7Z Archive',
    category: 'archive'
  },
  'application/gzip': {
    icon: IconFileZip,
    color: 'cyan',
    label: 'GZIP Archive',
    category: 'archive'
  },
  'application/x-tar': {
    icon: IconFileZip,
    color: 'gray',
    label: 'TAR Archive',
    category: 'archive'
  },

  // Text Files
  'text/plain': {
    icon: IconFileText,
    color: 'blue',
    label: 'Plain Text',
    category: 'text'
  },
  'text/csv': {
    icon: IconFileDescription,
    color: 'green',
    label: 'CSV File',
    category: 'spreadsheet'
  },
  'text/html': {
    icon: IconCode,
    color: 'orange',
    label: 'HTML File',
    category: 'code'
  },
  'text/css': {
    icon: IconCode,
    color: 'blue',
    label: 'CSS Stylesheet',
    category: 'code'
  },
  'text/javascript': {
    icon: IconCode,
    color: 'yellow',
    label: 'JavaScript',
    category: 'code'
  },
  'application/json': {
    icon: IconCode,
    color: 'yellow',
    label: 'JSON File',
    category: 'code'
  },
  'application/xml': {
    icon: IconCode,
    color: 'cyan',
    label: 'XML File',
    category: 'code'
  },

  // Code Files
  'application/x-python': {
    icon: IconCode,
    color: 'blue',
    label: 'Python Script',
    category: 'code'
  },
  'application/x-java': {
    icon: IconCode,
    color: 'red',
    label: 'Java Source',
    category: 'code'
  },
  'text/x-c': {
    icon: IconCode,
    color: 'gray',
    label: 'C Source',
    category: 'code'
  },
  'text/x-c++': {
    icon: IconCode,
    color: 'blue',
    label: 'C++ Source',
    category: 'code'
  }
} as const;

/**
 * Get file type configuration by MIME type
 */
export const getFileTypeConfig = (mimeType: string) => {
  return FILE_TYPE_CONFIG[mimeType] || {
    icon: IconFile,
    color: 'gray',
    label: 'Unknown File',
    category: 'unknown'
  };
};

/**
 * Get file type configuration by file extension
 */
export const getFileTypeConfigByExtension = (filename: string) => {
  const extension = filename.toLowerCase().split('.').pop();

  const extensionMap: { [key: string]: string } = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'tiff': 'image/tiff',
    'svg': 'image/svg+xml',
    'mp4': 'video/mp4',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'json': 'application/json',
    'xml': 'application/xml',
    'py': 'application/x-python',
    'java': 'application/x-java',
    'c': 'text/x-c',
    'cpp': 'text/x-c++'
  };

  const mimeType = extensionMap[extension] || 'application/octet-stream';
  return getFileTypeConfig(mimeType);
};

/**
 * Format file size in bytes to human-readable string
 * @param bytes - File size in bytes (can be undefined/null/invalid)
 * @returns Formatted string like "1.5 KB" or "N/A" for invalid values
 */
export const formatFileSize = (bytes: number | undefined): string => {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes) || bytes < 0) {
    return 'N/A';
  }
  if (bytes === 0) return '0 B';

  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const clampedIndex = Math.min(i, sizes.length - 1);
  return `${(bytes / Math.pow(1024, clampedIndex)).toFixed(1)} ${sizes[clampedIndex]}`;
};