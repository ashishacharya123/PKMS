import { useEffect, useState, useRef } from 'react';
import { Alert, Progress, Text, Group, Button, ActionIcon } from '@mantine/core';
import { IconClock, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useDiaryStore } from '../../stores/diaryStore';

interface SessionTimeoutWarningProps {
  sessionTimeoutSeconds: number; // Total session timeout duration
  warningThresholdSeconds: number; // When to start showing warnings
}

export function SessionTimeoutWarning({ 
  sessionTimeoutSeconds = 900, // 15 minutes
  warningThresholdSeconds = 120 // 2 minutes
}: SessionTimeoutWarningProps) {
  const [timeLeft, setTimeLeft] = useState(sessionTimeoutSeconds);
  const [showWarning, setShowWarning] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout>();
  const { isUnlocked, lockSession } = useDiaryStore();

  useEffect(() => {
    if (!isUnlocked) {
      setTimeLeft(sessionTimeoutSeconds);
      setShowWarning(false);
      setDismissed(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      return;
    }

    // Reset timer when session starts
    setTimeLeft(sessionTimeoutSeconds);
    setDismissed(false);

    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        const newTime = prev - 1;
        
        // Show warning when threshold is reached
        if (newTime <= warningThresholdSeconds && newTime > 0 && !dismissed) {
          setShowWarning(true);
        }
        
        // Show urgent notification at 30 seconds
        if (newTime === 30) {
          notifications.show({
            id: 'diary-session-urgent',
            title: '⚠️ Session Expiring!',
            message: 'Your diary will lock in 30 seconds',
            color: 'red',
            autoClose: false,
            withCloseButton: true,
          });
        }
        
        // Auto-lock when time expires
        if (newTime <= 0) {
          lockSession();
          notifications.show({
            id: 'diary-session-locked',
            title: '🔒 Diary Locked',
            message: 'Your diary has been automatically locked for security',
            color: 'blue',
            autoClose: 5000,
          });
          return 0;
        }
        
        return newTime;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isUnlocked, sessionTimeoutSeconds, warningThresholdSeconds, dismissed, lockSession]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getWarningColor = (): string => {
    if (timeLeft <= 30) return 'red';
    if (timeLeft <= 60) return 'orange';
    return 'yellow';
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShowWarning(false);
  };

  const handleExtendSession = () => {
    // Simulate session extension by resetting the timer
    setTimeLeft(sessionTimeoutSeconds);
    setShowWarning(false);
    setDismissed(false);
    
    notifications.show({
      title: '✅ Session Extended',
      message: 'Your diary session has been extended',
      color: 'green',
      autoClose: 3000,
    });
  };

  if (!isUnlocked || !showWarning || dismissed) {
    return null;
  }

  const progressValue = ((warningThresholdSeconds - timeLeft) / warningThresholdSeconds) * 100;

  return (
    <Alert
      color={getWarningColor()}
      title={
        <Group gap="xs">
          <IconClock size={16} />
          <Text fw={500}>Session Expiring Soon</Text>
        </Group>
      }
      withCloseButton={false}
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        width: 350,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Text size="sm">
          Your diary will automatically lock in <Text span fw={600}>{formatTime(timeLeft)}</Text>
        </Text>
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={handleDismiss}
        >
          <IconX size={14} />
        </ActionIcon>
      </Group>
      
      <Progress 
        value={progressValue} 
        color={getWarningColor()}
        size="xs"
        mb="md"
        animated
      />
      
      <Group justify="space-between">
        <Button
          variant="light"
          size="xs"
          onClick={handleExtendSession}
        >
          Extend Session
        </Button>
        <Button
          variant="subtle"
          size="xs"
          onClick={handleDismiss}
        >
          Dismiss
        </Button>
      </Group>
    </Alert>
  );
}
