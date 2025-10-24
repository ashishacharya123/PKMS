/**
 * Standalone audio recorder modal component
 * Extracted from FileUpload for reusability
 */

import { Modal, Stack, Group, Button, Text, Progress, Alert } from '@mantine/core';
import { IconMicrophone, IconMicrophoneOff, IconPlayerPlay, IconPlayerStop, IconX, IconDownload } from '@tabler/icons-react';
import { useState, useRef, useEffect } from 'react';

interface AudioRecorderModalProps {
  opened: boolean;
  onClose: () => void;
  onSave: (audioBlob: Blob, filename: string) => Promise<void>;
  title?: string;
  loading?: boolean;
}

export function AudioRecorderModal({
  opened,
  onClose,
  onSave,
  title = "Record Audio",
  loading = false
}: AudioRecorderModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording, isPaused]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        setAudioBlob(audioBlob);
        setAudioUrl(URL.createObjectURL(audioBlob));
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
    } catch (err) {
      setError('Failed to access microphone. Please check permissions.');
      console.error('Recording error:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
      }
    }
  };

  const playRecording = () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play();
    }
  };

  const handleSave = async () => {
    if (audioBlob) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `recording-${timestamp}.webm`;
      
      try {
        await onSave(audioBlob, filename);
        handleClose();
      } catch (err) {
        setError('Failed to save recording. Please try again.');
        console.error('Save error:', err);
      }
    }
  };

  const handleClose = () => {
    if (isRecording) {
      stopRecording();
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setAudioBlob(null);
    setAudioUrl(null);
    setError(null);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="sm">
          <IconMicrophone size={20} />
          <Text fw={500}>{title}</Text>
        </Group>
      }
      size="md"
      padding="md"
    >
      <Stack gap="md">
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        {/* Recording Status */}
        <Group justify="center" py="md">
          <Stack align="center" gap="sm">
            <Text size="xl" fw={500} c={isRecording ? 'red' : 'dimmed'}>
              {formatTime(recordingTime)}
            </Text>
            
            {isRecording && (
              <Progress
                value={100}
                animated
                color="red"
                size="sm"
                style={{ width: 200 }}
              />
            )}
          </Stack>
        </Group>

        {/* Recording Controls */}
        <Group justify="center" gap="md">
          {!isRecording && !audioBlob && (
            <Button
              leftSection={<IconMicrophone size={16} />}
              onClick={startRecording}
              color="red"
              size="lg"
            >
              Start Recording
            </Button>
          )}

          {isRecording && (
            <>
              <Button
                leftSection={isPaused ? <IconPlayerPlay size={16} /> : <IconPlayerStop size={16} />}
                onClick={pauseRecording}
                variant="outline"
                size="lg"
              >
                {isPaused ? 'Resume' : 'Pause'}
              </Button>
              
              <Button
                leftSection={<IconMicrophoneOff size={16} />}
                onClick={stopRecording}
                color="red"
                size="lg"
              >
                Stop Recording
              </Button>
            </>
          )}

          {audioBlob && !isRecording && (
            <>
              <Button
                leftSection={<IconPlayerPlay size={16} />}
                onClick={playRecording}
                variant="outline"
                size="lg"
              >
                Play
              </Button>
              
              <Button
                leftSection={<IconMicrophone size={16} />}
                onClick={startRecording}
                variant="outline"
                size="lg"
              >
                Record Again
              </Button>
            </>
          )}
        </Group>

        {/* Audio Info */}
        {audioBlob && (
          <Group justify="center" p="md" style={{ 
            border: '1px solid var(--mantine-color-gray-3)', 
            borderRadius: '8px' 
          }}>
            <Stack align="center" gap="xs">
              <Text size="sm" fw={500}>Recording Complete</Text>
              <Text size="xs" c="dimmed">
                Duration: {formatTime(recordingTime)} | 
                Size: {(audioBlob.size / 1024).toFixed(1)} KB
              </Text>
            </Stack>
          </Group>
        )}

        {/* Action Buttons */}
        <Group justify="flex-end" gap="sm" mt="md">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
            leftSection={<IconX size={16} />}
          >
            Cancel
          </Button>
          
          {audioBlob && (
            <Button
              onClick={handleSave}
              loading={loading}
              leftSection={<IconDownload size={16} />}
            >
              Save Recording
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
