/**
 * DiaryPage - Main diary interface with two-tab layout
 * 
 * PURPOSE:
 * ========
 * Main diary page that provides two core functionalities:
 * 1. Diary Tab - Calendar, entries, quick actions, historical data
 * 2. Analytics Tab - Habit tracking, wellness metrics, search analytics
 * 
 * ARCHITECTURE:
 * =============
 * - Minimal container that manages tab state and basic logic
 * - Delegates all functionality to specialized tab components
 * - Maintains session management and authentication
 * - Provides consistent header and navigation
 * 
 * @author AI Agent: Claude Sonnet 4.5
 * @date 2025-10-29
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import { useDiaryStore } from '../stores/diaryStore';
import {
  Container,
  Stack,
  Group,
  Button,
  Tabs,
  Text,
  Badge,
  Modal,
  PasswordInput,
  Center,
} from '@mantine/core';
import {
  IconBook,
  IconChartLine,
  IconLock,
  IconEye,
  IconRefresh,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';

// Import tab components
import DiaryMainTab from '../components/diary/DiaryMainTab';
import DiaryAnalyticsTab from '../components/diary/DiaryAnalyticsTab';

// Import services
import { dashboardService } from '../services/dashboardService';
import { nepaliDateCache } from '../utils/nepaliDateCache';

export const DiaryPage = React.memo(function DiaryPage() {
  const {
    setOnDiaryPage,
    entries,
    error,
    isEncryptionSetup,
    isUnlocked,
    unlockSession
  } = useDiaryStore();
  const [searchParams, setSearchParams] = useSearchParams();

  // Password modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  // State
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab');
    return tab === 'analytics' ? 'analytics' : 'diary';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [entryCount, setEntryCount] = useState(0);
  const hasEncryption = isEncryptionSetup;
  const isLockedComputed = hasEncryption && !isUnlocked;

  // Track when user is on diary page for session management
  useEffect(() => {
    setOnDiaryPage(true);
    
    // Pre-cache Nepali dates for better performance
    try {
      nepaliDateCache.preCacheDashboard();
    } catch (_e) {
      // ignore cache pre-warm errors
    }
    
    // Cleanup when component unmounts
    return () => {
      setOnDiaryPage(false);
    };
  }, [setOnDiaryPage]);

  // Load basic diary data
  useAuthenticatedEffect(() => {
    loadDiaryData();
  }, []);

  // Update entry count when entries change
  useEffect(() => {
    setEntryCount(entries.length);
  }, [entries]);

  // Auto-show password modal when diary is locked
  useEffect(() => {
    if (isEncryptionSetup && !isUnlocked && !showPasswordModal) {
      setShowPasswordModal(true);
    }
    // Hide modal if diary becomes unlocked
    else if (isUnlocked && showPasswordModal) {
      setShowPasswordModal(false);
      setPassword('');
    }
  }, [isEncryptionSetup, isUnlocked, showPasswordModal]);

  // Handle password unlock
  const handleUnlock = async () => {
    if (!password.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Please enter a password',
        color: 'red'
      });
      return;
    }

    setIsUnlocking(true);
    try {
      const success = await unlockSession(password);
      if (success) {
        notifications.show({
          title: 'Success',
          message: 'Diary unlocked successfully',
          color: 'green'
        });
        setShowPasswordModal(false);
        setPassword('');
      } else {
        notifications.show({
          title: 'Error',
          message: 'Invalid password. Please try again.',
          color: 'red'
        });
      }
    } catch (error: any) {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to unlock diary',
        color: 'red'
      });
    } finally {
      setIsUnlocking(false);
    }
  };

  // Encryption status is now derived from store flags (line 64)
  // const hasEncryption = isEncryptionSetup; - no useEffect needed

  const loadDiaryData = async () => {
    setIsLoading(true);
    try {
      // Load basic dashboard data for header stats
      await dashboardService.getModuleDashboardData('diary');
      
      // Update any necessary state here if needed
      // The individual tab components will handle their own data loading
    } catch (error) {
      console.error('Failed to load diary data:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load diary data. Some features may not work properly.',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    loadDiaryData();
  };

  const handleTabChange = (value: string | null) => {
    const newTab = value || 'diary';
    setActiveTab(newTab);
    setSearchParams({ tab: newTab });
  };

  const getEncryptionStatus = () => {
    if (isLockedComputed) {
      return <Badge color="red" leftSection={<IconLock size={12} />}>Locked</Badge>;
    }
    if (hasEncryption) {
      return <Badge color="green" leftSection={<IconEye size={12} />}>Unlocked</Badge>;
    }
    return <Badge color="gray">No Encryption</Badge>;
  };

  // Loading state
  if (isLoading && entries.length === 0) {
    return <LoadingState message="Loading your diary..." />;
  }

  // Error state
  if (error) {
    return <ErrorState message={error} onRetry={handleRefresh} />;
  }

  return (
    <Container size="xl" py="md">
      {/* Main Content - Only show when diary is unlocked */}
      {!isLockedComputed ? (
        <Stack gap="lg">
          {/* Header */}
          <Group justify="space-between" align="center">
            <Group gap="md">
              <Text size="xl" fw={700} c="blue">
                📖 Personal Knowledge Management
              </Text>
              <Text c="dimmed" size="sm">
                Your digital diary and wellness companion
              </Text>
            </Group>
            <Group gap="sm">
              {getEncryptionStatus()}
              <Button
                variant="light"
                leftSection={<IconRefresh size={16} />}
                onClick={handleRefresh}
                loading={isLoading}
                size="sm"
              >
                Refresh
              </Button>
            </Group>
          </Group>

          {/* Stats Overview */}
          <Group gap="md">
            <Badge size="lg" variant="light" color="blue">
              {entryCount} Entries
            </Badge>
            <Badge size="lg" variant="light" color="green">
              {hasEncryption ? 'Encrypted' : 'Plain Text'}
            </Badge>
            <Badge size="lg" variant="light" color="purple">
              {isLockedComputed ? 'Locked' : 'Unlocked'}
            </Badge>
          </Group>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tabs.List>
              <Tabs.Tab value="diary" leftSection={<IconBook size={16} />}>
                Diary
              </Tabs.Tab>
              <Tabs.Tab value="analytics" leftSection={<IconChartLine size={16} />}>
                Analytics
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="diary" pt="md">
              <DiaryMainTab />
            </Tabs.Panel>

            <Tabs.Panel value="analytics" pt="md">
              <DiaryAnalyticsTab />
            </Tabs.Panel>
          </Tabs>
        </Stack>
      ) : (
        /* Locked State - Show unlock prompt */
        <Center style={{ minHeight: '60vh' }}>
          <Stack align="center" gap="lg" maw={400}>
            <IconLock size={80} color="var(--mantine-color-red-4)" />
            <Text size="xxl" fw={900} c="red" ta="center">
              🔒 Diary is Locked
            </Text>
            <Text c="dimmed" size="lg" ta="center">
              Your diary is encrypted and protected with a password.<br />
              Please unlock to access your personal entries and analytics.
            </Text>
            <Button
              size="lg"
              leftSection={<IconLock size={20} />}
              onClick={() => setShowPasswordModal(true)}
              variant="filled"
              color="blue"
            >
              Unlock Diary
            </Button>
          </Stack>
        </Center>
      )}

      {/* Password Modal */}
      <Modal
        opened={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        title={<Text fw={600}>🔓 Unlock Diary</Text>}
        centered
      >
        <Stack gap="md">
          <Text c="dimmed" size="sm">
            Enter your diary password to access your encrypted entries.
          </Text>

          <PasswordInput
            placeholder="Enter your diary password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleUnlock()}
            autoFocus
          />

          <Group gap="sm">
            <Button
              onClick={handleUnlock}
              loading={isUnlocking}
              disabled={!password.trim()}
              variant="filled"
              color="blue"
            >
              Unlock
            </Button>
            <Button
              variant="light"
              onClick={() => setShowPasswordModal(false)}
            >
              Cancel
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
});

export default DiaryPage;