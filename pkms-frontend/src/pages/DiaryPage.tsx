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
import { useSearchParams, useNavigate } from 'react-router-dom';
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
  Loader,
  Alert,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconBook,
  IconChartLine,
  IconLock,
  IconEye,
  IconRefresh,
  IconEyeOff,
  IconHelp,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';

// Import tab components
import DiaryMainTab from '../components/diary/DiaryMainTab';
import DiaryAnalyticsTab from '../components/diary/DiaryAnalyticsTab';

// Import services
import { dashboardService } from '../services/dashboardService';
import { diaryService } from '../services/diaryService';
import { nepaliDateCache } from '../utils/nepaliDateCache';

export const DiaryPage = React.memo(function DiaryPage() {
  const navigate = useNavigate();
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
  const [passwordHint, setPasswordHint] = useState<string>('');
  const [showPasswordHint, setShowPasswordHint] = useState(false);
  const [passwordError, setPasswordError] = useState<string>('');

  // Store initialization state (SECURITY: Prevent access before verification)
  const [isStoreInitialized, setIsStoreInitialized] = useState(false);

  // State
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab');
    return tab === 'analytics' ? 'analytics' : 'diary';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [entryCount, setEntryCount] = useState(0);
  const hasEncryption = isEncryptionSetup ?? false;

  // SECURITY: Lock if ANY of these conditions are true:
  // 1. !isStoreInitialized - Store not initialized yet (prevents access during init)
  // 2. isEncryptionSetup === false - Backend confirmed no encryption (should not happen with mandatory encryption)
  // 3. !isUnlocked - Encrypted but not unlocked (password required)
  // NOTE: We distinguish between undefined (still loading) vs false (backend confirmation)
  const isLockedComputed = !isStoreInitialized || (isEncryptionSetup === false) || !isUnlocked;

  
  // Ensure diary store is initialized before components access its properties
  useEffect(() => {
    const initStore = async () => {
      try {
        const { init } = useDiaryStore.getState();
        await init();
        console.log('Diary store initialized successfully');
      } catch (error) {
        console.error('Failed to initialize diary store:', error);
        // SECURITY: Keep locked on error - security first
        notifications.show({
          title: 'Security Error',
          message: 'Failed to initialize diary security. Please refresh the page.',
          color: 'red'
        });
      } finally {
        setIsStoreInitialized(true); // Mark initialization as complete
      }
    };

    initStore();
  }, []);

  // SECURITY MONITORING - Detect encryption setup issues
  useEffect(() => {
    // Only trigger error after store initialization AND when backend explicitly confirms no encryption
    // (not when isEncryptionSetup is undefined, which means still loading)
    if (isStoreInitialized && isEncryptionSetup === false) {
      // CRITICAL: Encryption should be mandatory but backend confirmed it's not set up
      const errorMsg = '🚨 SECURITY CRITICAL: Diary encryption not detected but should be mandatory.';

      // Always log security critical errors (even in production)
      console.error(errorMsg, {
        timestamp: new Date().toISOString(),
        userContext: 'DiaryPage initialization',
        severity: 'CRITICAL',
        isEncryptionSetup,
        isStoreInitialized
      });

      // SECURITY: Diary remains locked due to isEncryptionSetup === false check in isLockedComputed
      notifications.show({
        title: 'Security Issue Detected',
        message: 'Diary encryption could not be verified. Please refresh or contact support.',
        color: 'red',
        autoClose: false
      });
    }
  }, [isStoreInitialized, isEncryptionSetup]);

  // DEBUG: Log security state changes (development only) - This prevents excessive logging
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Diary Security State Changed:', {
        isStoreInitialized,
        hasEncryption,
        isUnlocked,
        isLockedComputed,
        isEncryptionSetup
      });
    }
  }, [isStoreInitialized, isEncryptionSetup, isUnlocked, isLockedComputed]);

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

  // Fetch password hint when modal is opened
  const fetchPasswordHint = async () => {
    try {
      const hint = await diaryService.getPasswordHint();
      setPasswordHint(hint);
    } catch (error: any) {
      console.warn('Could not fetch password hint:', error);
      setPasswordHint('');
    }
  };

  // Auto-show password modal AFTER initialization and only if encryption is properly set up
  useEffect(() => {
    // Only show modal after store initialization is complete
    // AND only if encryption is explicitly detected (isEncryptionSetup === true, not undefined)
    // AND only if diary is not unlocked
    if (isStoreInitialized && isEncryptionSetup === true && !isUnlocked && !showPasswordModal) {
      // Development logging only
      if (process.env.NODE_ENV === 'development') {
        console.log('Showing password modal - diary is encrypted and locked');
      }
      // Fetch password hint when showing modal
      fetchPasswordHint();
      setShowPasswordModal(true);
    }
    // Hide modal if diary becomes unlocked
    else if (isUnlocked && showPasswordModal) {
      setShowPasswordModal(false);
      setPassword('');
      setPasswordError('');
      setShowPasswordHint(false);
    }
  }, [isStoreInitialized, isEncryptionSetup, isUnlocked, showPasswordModal]);

  // Handle cancel password entry - redirect to dashboard
  const handleCancelUnlock = () => {
    setShowPasswordModal(false);
    setPassword('');
    setPasswordError('');
    setShowPasswordHint(false);
    // Navigate back to dashboard so user isn't stuck on diary page
    navigate('/dashboard');
  };

  // Handle password unlock
  const handleUnlock = async () => {
    if (!password.trim()) {
      setPasswordError('Please enter a password');
      return;
    }

    // Clear previous errors when trying again
    setPasswordError('');
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
        setPasswordError('');
        setShowPasswordHint(false);
      } else {
        setPasswordError('Invalid password. Please check your hint and try again.');
        // Show password hint after failed attempt
        if (!showPasswordHint) {
          setShowPasswordHint(true);
        }
      }
    } catch (error: any) {
      setPasswordError(error.message || 'Failed to unlock diary. Please try again.');
      // Show password hint on error
      if (!showPasswordHint) {
        setShowPasswordHint(true);
      }
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

  // SECURITY LOADING GUARD - Prevent access before initialization
  if (!isStoreInitialized) {
    return (
      <Container size="xl" py="md">
        <Center style={{ minHeight: '60vh' }}>
          <Stack align="center" gap="lg" maw={400}>
            <Loader size="lg" color="blue" />
            <Text size="xl" fw={700} c="blue" ta="center">
              🔒 Initializing Diary Security...
            </Text>
            <Text c="dimmed" size="sm" ta="center">
              Please wait while we verify your diary encryption settings and security status.
            </Text>
            <Text c="blue" size="xs" ta="center" fs="italic">
              This ensures your personal entries remain private and secure.
            </Text>
          </Stack>
        </Center>
      </Container>
    );
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
        /* Enhanced Locked State - Differentiate between error and locked states */
        <Center style={{ minHeight: '60vh' }}>
          <Stack align="center" gap="lg" maw={400}>
            <IconLock size={80} color="var(--mantine-color-red-4)" />

            {isEncryptionSetup === false ? (
              // ERROR STATE: Encryption not detected (should never happen with mandatory encryption)
              <>
                <Text size="xxl" fw={900} c="red" ta="center">
                  🚨 Security Issue Detected
                </Text>
                <Text c="dimmed" size="lg" ta="center">
                  Your diary encryption could not be verified. This indicates a serious system issue.
                  <br /><br />
                  <strong>Possible causes:</strong><br />
                  • Backend database connectivity issue<br />
                  • Encryption setup failure during registration<br />
                  • Data corruption or migration problem
                </Text>
                <Group gap="sm">
                  <Button
                    size="lg"
                    leftSection={<IconRefresh size={20} />}
                    onClick={handleRefresh}
                    variant="light"
                    color="blue"
                  >
                    Retry Security Check
                  </Button>
                  <Button
                    size="lg"
                    onClick={() => window.location.reload()}
                    variant="outline"
                    color="red"
                  >
                    Refresh Page
                  </Button>
                </Group>
              </>
            ) : (
              // NORMAL LOCKED STATE: Encryption detected but diary is locked
              <>
                <Text size="xxl" fw={900} c="red" ta="center">
                  🔒 Diary is Locked
                </Text>
                <Text c="dimmed" size="lg" ta="center">
                  Your diary is encrypted and protected with a password.
                  <br />
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
              </>
            )}
          </Stack>
        </Center>
      )}

      {/* Enhanced Password Modal */}
      <Modal
        opened={showPasswordModal}
        onClose={handleCancelUnlock}
        title={<Text fw={600}>🔓 Unlock Diary</Text>}
        centered
      >
        <Stack gap="md">
          <Text c="dimmed" size="sm">
            Enter your diary password to access your encrypted entries.
          </Text>

          {/* Password Error Alert */}
          {passwordError && (
            <Alert color="red" variant="light">
              <Text size="sm">{passwordError}</Text>
            </Alert>
          )}

          {/* Password Input with Hint Toggle */}
          <Group gap="sm">
            <PasswordInput
              style={{ flex: 1 }}
              placeholder="Enter your diary password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                // Clear error when user starts typing
                if (passwordError) {
                  setPasswordError('');
                }
              }}
              onKeyPress={(e) => e.key === 'Enter' && handleUnlock()}
              autoFocus
              error={passwordError}
            />

            {/* Password Hint Toggle */}
            {passwordHint && (
              <Tooltip label={showPasswordHint ? "Hide hint" : "Show hint"}>
                <ActionIcon
                  variant="light"
                  color="blue"
                  onClick={() => setShowPasswordHint(!showPasswordHint)}
                  size="input-height"
                >
                  {showPasswordHint ? <IconEyeOff size={16} /> : <IconHelp size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
          </Group>

          {/* Password Hint Display */}
          {showPasswordHint && passwordHint && (
            <Alert color="blue" variant="light" icon={<IconHelp size={16} />}>
              <Text size="sm" fw={500}>Password Hint:</Text>
              <Text size="sm">{passwordHint}</Text>
            </Alert>
          )}

          {/* Action Buttons */}
          <Group gap="sm">
            <Button
              onClick={handleUnlock}
              loading={isUnlocking}
              disabled={!password.trim()}
              variant="filled"
              color="blue"
              style={{ flex: 1 }}
            >
              Unlock
            </Button>
            <Button
              variant="light"
              onClick={handleCancelUnlock}
              style={{ flex: 1 }}
            >
              Cancel
            </Button>
          </Group>

          {/* Additional Options */}
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Forgotten your password? Contact support for assistance.
            </Text>
            {passwordHint && !showPasswordHint && (
              <Button
                variant="subtle"
                size="compact-xs"
                color="blue"
                onClick={() => setShowPasswordHint(true)}
                leftSection={<IconHelp size={12} />}
              >
                Need a hint?
              </Button>
            )}
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
});

export default DiaryPage;