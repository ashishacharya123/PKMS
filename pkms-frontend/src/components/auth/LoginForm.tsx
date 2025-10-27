import { useState, useEffect } from 'react';
import { 
  TextInput, 
  Button, 
  Paper, 
  Title, 
  Text, 
  Stack, 
  Alert,
  Anchor,
  Group,
  Box,
  Badge,
  Loader,
  useMantineColorScheme
} from '@mantine/core';
import { IconAlertCircle, IconUser, IconLock, IconLogin, IconWifi, IconWifiOff } from '@tabler/icons-react';
import { useAuthStore } from '../../stores/authStore';
import { apiService } from '../../services/api';
import { API_BASE_URL } from '../../config';

interface LoginFormProps {
  onSwitchToSetup: () => void;
  onShowRecovery?: (username: string) => void;
}

export function LoginForm({ onSwitchToSetup, onShowRecovery }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [loginPasswordHint, setLoginPasswordHint] = useState('');
  const [showLoginPasswordHint, setShowLoginPasswordHint] = useState(false);
  const [loadingHint, setLoadingHint] = useState(false);
  const [backendStatus, setBackendStatus] = useState<{isOnline: boolean; latency?: number; checking: boolean}>({
    isOnline: false,
    checking: true
  });
  const { login, isLoading, error, clearError } = useAuthStore();
  const { colorScheme } = useMantineColorScheme();

  // Perform an initial backend connectivity check when component mounts
  useEffect(() => {
    checkBackendConnectivity();
    
  }, []);

  const checkBackendConnectivity = async () => {
    setBackendStatus(prev => ({ ...prev, checking: true }));
    
    try {
      const health = await apiService.checkBackendHealth();
      setBackendStatus({
        isOnline: health.isOnline,
        latency: health.latency,
        checking: false
      });
      
      if (!health.isOnline) {
        setLocalError(`🔌 Backend server is offline\n\n${health.error || `Cannot connect to ${API_BASE_URL}`}\n\n🔧 Try:\n• Run: docker-compose up pkms-backend\n• Check if backend container is running\n• Verify port is not blocked`);
      } else {
        setLocalError(null);
      }
    } catch (error) {
      setBackendStatus(prev => ({ ...prev, checking: false }));
      setLocalError('Unable to check backend connectivity');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();
    
    if (!username.trim()) {
      setLocalError('Username is required');
      return;
    }
    
    if (!password.trim()) {
      setLocalError('Password is required');
      return;
    }

    try {
      await login({ username: username.trim(), password });
    } catch (error: any) {
      // Check if this is a network error and update backend status
      if (error?.isNetworkError || error?.message?.includes('Cannot connect to server')) {
        setBackendStatus(prev => ({ ...prev, isOnline: false }));
      }
    }
  };

  const loadLoginPasswordHint = async () => {
    setLoadingHint(true);
    setLocalError(null);
    
    try {
      // For single user system, just get any available hint
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login-password-hint`);
      const data = await response.json();
      
      if (data.hint) {
        setLoginPasswordHint(data.hint);
        setShowLoginPasswordHint(true);
        // Auto-fill username if it's returned and current username is empty
        if (data.username && !username.trim()) {
          setUsername(data.username);
        }
      } else {
        setLocalError('No password hint available. Please contact administrator.');
      }
    } catch (error: any) {
      console.error('Failed to load login password hint:', error);
      setLocalError('Unable to load login password hint. Please try again.');
    } finally {
      setLoadingHint(false);
    }
  };

  const displayError = localError || error;
  const isNetworkError = displayError?.includes('Cannot connect to server') || 
                        displayError?.includes('Network connection lost') ||
                        displayError?.includes('Backend server is offline');

  return (
    <Paper 
      p="xl" 
      radius="md" 
      shadow="xl"
      style={{ 
        width: '100%', 
        maxWidth: '420px',
        backgroundColor: colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'white',
        border: colorScheme === 'dark' ? '1px solid var(--mantine-color-dark-4)' : '1px solid var(--mantine-color-gray-2)',
        backdropFilter: 'blur(10px)',
        boxShadow: colorScheme === 'dark' 
          ? '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05)' 
          : '0 8px 32px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)'
      }}
    >
      <Stack gap="md">
        {/* Header Section */}
        <Box ta="center">
          <Title order={2} fw={600} c={colorScheme === 'dark' ? 'white' : 'dark.8'} mb="xs">
            Welcome Back
          </Title>
          <Text size="sm" c="dimmed">
            Sign in to your Personal Knowledge Management System
          </Text>
          
          {/* Backend Status Indicator */}
          <Group justify="center" mt="xs">
            <Badge 
              color={backendStatus.isOnline ? 'green' : 'red'} 
              variant="light"
              size="sm"
              leftSection={
                backendStatus.checking ? (
                  <Loader size="10" />
                ) : backendStatus.isOnline ? (
                  <IconWifi size="10" />
                ) : (
                  <IconWifiOff size="10" />
                )
              }
            >
              {backendStatus.checking 
                ? 'Checking...' 
                : backendStatus.isOnline 
                  ? `Backend Online ${backendStatus.latency ? `(${backendStatus.latency}ms)` : ''}`
                  : 'Backend Offline'
              }
            </Badge>
            {!backendStatus.isOnline && (
              <Anchor size="xs" onClick={checkBackendConnectivity}>
                Check Again
              </Anchor>
            )}
          </Group>
        </Box>

        {/* Error Display */}
        {displayError && (
          <Alert 
            icon={<IconAlertCircle size="1rem" />} 
            title={isNetworkError ? "Connection Error" : "Login Failed"}
            color={isNetworkError ? "orange" : "red"}
            variant="filled"
            radius="sm"
            onClose={() => {
              setLocalError(null);
              clearError();
            }}
            withCloseButton
          >
            <Box>
              {displayError.split('\n').map((line, index) => (
                <Text key={index} size="sm" c="white" style={{ whiteSpace: 'pre-wrap' }}>
                  {line}
                </Text>
              ))}
              {isNetworkError && (
                <Button
                  variant="white"
                  size="xs"
                  mt="sm"
                  onClick={checkBackendConnectivity}
                  loading={backendStatus.checking}
                >
                  Check Backend Status
                </Button>
              )}
            </Box>
          </Alert>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput
              label="Username"
              value={username}
              onChange={(event) => setUsername(event.currentTarget.value)}
              placeholder="Enter your username"
              leftSection={<IconUser size={16} />}
              size="md"
              required
            />

            <div>
              <TextInput
                type="password"
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                size="md"
                leftSection={<IconLock size="1rem" stroke={1.5} />}
                required
              />

              <Group justify="space-between" mt="xs">
                <Anchor 
                  size="sm" 
                  onClick={loadLoginPasswordHint}
                  style={{ cursor: loadingHint ? 'default' : 'pointer' }}
                  c={loadingHint ? 'dimmed' : 'blue'}
                >
                  {loadingHint ? 'Loading password hint...' : 'Show password hint'}
                </Anchor>
                {onShowRecovery && (
                  <Anchor 
                    size="sm" 
                    onClick={() => onShowRecovery(username.trim())}
                    style={{ cursor: 'pointer' }}
                    c="orange"
                  >
                    Forgot Password?
                  </Anchor>
                )}
              </Group>

              {/* Password hint display on separate line to prevent layout reflow */}
              {showLoginPasswordHint && loginPasswordHint && (
                <Text size="sm" fw={500} c="blue" mt="xs">
                  Password Hint: {loginPasswordHint}
                </Text>
              )}
            </div>

            <Button
              type="submit"
              loading={isLoading}
              size="md"
              fullWidth
              leftSection={<IconLogin size="1rem" />}
              disabled={!username.trim() || !password.trim() || !backendStatus.isOnline}
              mt="sm"
              style={{ cursor: 'pointer' }}
            >
              {isLoading ? 'Signing in...' : !backendStatus.isOnline ? 'Backend Offline' : 'Sign In'}
            </Button>
          </Stack>
        </form>

        {/* Create Account Section */}
        <Box ta="center" mt="md">
          <Group justify="center" gap="xs">
            <Text size="sm" c="dimmed">
              Don't have an account?
            </Text>
            <Anchor 
              size="sm" 
              fw={500}
              onClick={onSwitchToSetup}
              style={{ cursor: 'pointer' }}
            >
              Create account
            </Anchor>
          </Group>
        </Box>
      </Stack>
    </Paper>
  );
} 