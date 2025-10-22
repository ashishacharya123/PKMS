import React, { useState, useRef } from 'react';
import { Plus, Mic, Upload, X, Play, Pause, Square } from 'lucide-react';

interface FileUploadProps {
  module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects';
  onUpload: (file: File, metadata: any) => void;
  defaultFilename?: string;
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  module,
  onUpload,
  defaultFilename = '',
  className = ''
}) => {
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<'type' | 'audio' | 'file'>('type');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState(defaultFilename);
  const [description, setDescription] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const resetModal = () => {
    setShowModal(false);
    setStep('type');
    setIsRecording(false);
    setIsPaused(false);
    setDuration(0);
    setAudioUrl(null);
    setFilename(defaultFilename);
    setDescription('');
    setDragActive(false);
    setSelectedFile(null);
    setError(null);
    audioChunksRef.current = [];
  };

  // Audio Recording Functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);

      intervalRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error starting recording:', error);
      setError('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        intervalRef.current = setInterval(() => {
          setDuration(prev => prev + 1);
        }, 1000);
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      }
    }
  };

  const handleAudioSave = () => {
    if (audioChunksRef.current.length > 0) {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const file = new File([audioBlob], `${filename || 'recording'}.webm`, {
        type: 'audio/webm'
      });

      const metadata = {
        filename: filename || 'recording',
        description: description || `Voice recording (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')})`,
        media_type: 'voice',
        original_name: file.name,
        mime_type: 'audio/webm',
        file_size: file.size
      };

      onUpload(file, metadata);
      resetModal();
    }
  };

  // File Upload Functions
  const handleFileSelect = (file: File) => {
    setError(null);
    setSelectedFile(file);
    
    if (!filename) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setFilename(nameWithoutExt);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleFileSave = () => {
    if (selectedFile && filename.trim()) {
      const metadata = {
        filename: filename.trim(),
        description: description.trim() || undefined,
        media_type: getMediaType(selectedFile.type),
        original_name: selectedFile.name,
        mime_type: selectedFile.type,
        file_size: selectedFile.size
      };

      onUpload(selectedFile, metadata);
      resetModal();
    }
  };

  const getMediaType = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return '🖼️';
    if (file.type.startsWith('video/')) return '🎥';
    if (file.type.startsWith('audio/')) return '🎵';
    return '📄';
  };

  return (
    <>
      {/* Plus Button */}
      <button
        onClick={() => setShowModal(true)}
        className={`inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors ${className}`}
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Media
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {step === 'type' && 'Add Media'}
                  {step === 'audio' && 'Voice Recording'}
                  {step === 'file' && 'File Upload'}
                </h3>
                <button
                  onClick={resetModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Type Selector */}
              {step === 'type' && (
                <div className="space-y-3">
                  <button
                    onClick={() => setStep('audio')}
                    className="w-full flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <Mic className="w-6 h-6 text-blue-600 mr-4" />
                    <div className="text-left">
                      <div className="font-medium text-gray-900">Voice Recording</div>
                      <div className="text-sm text-gray-600">Record audio directly in browser</div>
                    </div>
                  </button>

                  <button
                    onClick={() => setStep('file')}
                    className="w-full flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <Upload className="w-6 h-6 text-blue-600 mr-4" />
                    <div className="text-left">
                      <div className="font-medium text-gray-900">File Upload</div>
                      <div className="text-sm text-gray-600">Upload documents, images, videos</div>
                    </div>
                  </button>
                </div>
              )}

              {/* Audio Recorder */}
              {step === 'audio' && (
                <div className="space-y-4">
                  {/* Filename Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Filename
                    </label>
                    <input
                      type="text"
                      value={filename}
                      onChange={(e) => setFilename(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter filename"
                    />
                  </div>

                  {/* Recording Controls */}
                  {!audioUrl ? (
                    <div className="text-center">
                      {!isRecording ? (
                        <div>
                          <div className="mb-4">
                            <div className="w-20 h-20 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
                              <Mic className="w-8 h-8 text-gray-400" />
                            </div>
                          </div>
                          <button
                            onClick={startRecording}
                            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center mx-auto"
                          >
                            <Mic className="w-5 h-5 mr-2" />
                            Start Recording
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="mb-4">
                            <div className="w-20 h-20 mx-auto bg-red-100 rounded-full flex items-center justify-center animate-pulse">
                              <Mic className="w-8 h-8 text-red-600" />
                            </div>
                            <div className="text-2xl font-mono text-gray-900 mt-2">
                              {formatDuration(duration)}
                            </div>
                            <div className="text-sm text-gray-600">
                              {isPaused ? 'Paused' : 'Recording...'}
                            </div>
                          </div>
                          
                          <div className="flex justify-center space-x-4">
                            <button
                              onClick={pauseRecording}
                              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                            >
                              {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                            </button>
                            <button
                              onClick={stopRecording}
                              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                            >
                              <Square className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Recording Complete */
                    <div className="text-center">
                      <div className="mb-4">
                        <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                          <Mic className="w-8 h-8 text-green-600" />
                        </div>
                        <div className="text-lg font-mono text-gray-900 mt-2">
                          {formatDuration(duration)}
                        </div>
                        <div className="text-sm text-gray-600">
                          Recording Complete
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description (optional)
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter description"
                    />
                  </div>
                </div>
              )}

              {/* File Upload */}
              {step === 'file' && (
                <div className="space-y-4">
                  {/* File Selection */}
                  {!selectedFile ? (
                    <div
                      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                        dragActive 
                          ? 'border-blue-400 bg-blue-50' 
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                    >
                      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 mb-2">
                        Drag and drop your file here, or
                      </p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        browse files
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileInputChange}
                        className="hidden"
                      />
                    </div>
                  ) : (
                    /* Selected File */
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="text-2xl mr-3">{getFileIcon(selectedFile)}</span>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {selectedFile.name}
                            </p>
                            <p className="text-sm text-gray-500">
                              {formatFileSize(selectedFile.size)}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedFile(null)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Metadata Form */}
                  {selectedFile && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Filename
                        </label>
                        <input
                          type="text"
                          value={filename}
                          onChange={(e) => setFilename(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter filename"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Description (optional)
                        </label>
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter description"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={resetModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                
                {step === 'audio' && audioUrl && (
                  <button
                    onClick={handleAudioSave}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Save Recording
                  </button>
                )}
                
                {step === 'file' && selectedFile && (
                  <button
                    onClick={handleFileSave}
                    disabled={!filename.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    Upload File
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FileUpload;
