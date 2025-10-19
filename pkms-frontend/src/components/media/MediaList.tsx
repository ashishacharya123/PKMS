import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Trash2, Image, FileText, Mic, Video } from 'lucide-react';
import { apiService } from '../../services/api';

interface MediaFile {
  uuid: string;
  filename: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  description?: string;
  display_order: number;
  created_at: string;
  media_type?: string;
}

interface MediaListProps {
  files: MediaFile[];
  onDelete: (fileId: string) => void;
  module: 'notes' | 'diary' | 'documents' | 'archive';
  className?: string;
}

export const MediaList: React.FC<MediaListProps> = ({
  files,
  onDelete,
  module,
  className = ''
}) => {
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  const getDownloadUrl = (currentModule: string, fileUuid: string): string => {
    // Documents module has a different download route structure
    if (currentModule === 'documents') {
      return `/${currentModule}/${fileUuid}/download`;
    }
    // Notes and Diary now use the same consistent structure
    return `/${currentModule}/files/${fileUuid}/download`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string, mediaType?: string) => {
    if (mediaType === 'voice' || mimeType.startsWith('audio/')) {
      return <Mic className="w-5 h-5 text-green-500" />;
    }
    if (mimeType.startsWith('image/')) {
      return <Image className="w-5 h-5 text-blue-500" />;
    }
    if (mimeType.startsWith('video/')) {
      return <Video className="w-5 h-5 text-purple-500" />;
    }
    return <FileText className="w-5 h-5 text-gray-500" />;
  };

  const isAudioFile = (mimeType: string, mediaType?: string) => {
    return mediaType === 'voice' || mimeType.startsWith('audio/');
  };

  const cleanupAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setPlayingAudio(null);
  };

  const handlePlayAudio = async (file: MediaFile) => {
    if (playingAudio === file.uuid) {
      cleanupAudio();
      return;
    }

    cleanupAudio();

    try {
      const downloadUrl = getDownloadUrl(module, file.uuid);
      const response = await apiService.get(downloadUrl, {
        responseType: 'blob',
      });

      const audioBlob = response.data as Blob;
      const audioUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = audioUrl;

      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.onended = cleanupAudio;
        audioRef.current.onerror = () => {
          console.error('Error playing audio file.');
          alert('Failed to play audio file');
          cleanupAudio();
        };
        await audioRef.current.play();
        setPlayingAudio(file.uuid);
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      alert('Failed to play audio file');
      cleanupAudio();
    }
  };

  const handleDownload = async (file: MediaFile) => {
    try {
      const downloadUrl = getDownloadUrl(module, file.uuid);
      const response = await apiService.get(downloadUrl, {
        responseType: 'blob',
      });

      const blob = response.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.original_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download file');
    }
  };

  const handleDelete = async (fileId: string) => {
    if (window.confirm('Are you sure you want to delete this file?')) {
      try {
        // Note: The delete URL might also be inconsistent, assuming /files/ for now
        const deleteUrl = `/${module}/files/${fileId}`;
        await apiService.delete(deleteUrl);
        onDelete(fileId);
      } catch (error) {
        console.error('Delete error:', error);
        alert('Failed to delete file');
      }
    }
  };

  const sortedFiles = [...files].sort((a, b) => a.display_order - b.display_order);

  if (sortedFiles.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <p className="text-sm">No attachments yet</p>
        <p className="text-xs mt-1">Click "Add Media" to upload files or record audio</p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {sortedFiles.map((file) => (
        <div
          key={file.uuid}
          className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center flex-1 min-w-0">
            {getFileIcon(file.mime_type, file.media_type)}
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {file.original_name}
              </p>
              <div className="flex items-center space-x-2 text-xs text-gray-500">
                <span>{formatFileSize(file.file_size)}</span>
                {file.description && (
                  <>
                    <span>•</span>
                    <span className="truncate">{file.description}</span>
                  </>
                )}
                <span>•</span>
                <span>{new Date(file.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 ml-3">
            {isAudioFile(file.mime_type, file.media_type) && (
              <button
                onClick={() => handlePlayAudio(file)}
                className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                title={playingAudio === file.uuid ? 'Pause' : 'Play'}
              >
                {playingAudio === file.uuid ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
            )}

            <button
              onClick={() => handleDownload(file)}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
            
            <button
              onClick={() => handleDelete(file.uuid)}
              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}

      <audio ref={audioRef} style={{ display: 'none' }} preload="none" />
    </div>
  );
};

export default MediaList;
