import { useState, useEffect } from 'react';
import { Container, Title, Text, Box, useMantineTheme, ThemeIcon, useMantineColorScheme } from '@mantine/core';
import { IconBrain } from '@tabler/icons-react';
import { LoginForm } from '../components/auth/LoginForm';
import { SetupForm } from '../components/auth/SetupForm';
import RecoveryModal from '../components/auth/RecoveryModal';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';

type AuthMode = 'login' | 'setup';

export function AuthPage() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [recoveryModalOpened, setRecoveryModalOpened] = useState(false);
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const { clearError, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  // Redirect to dashboard when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const handleSwitchMode = (mode: AuthMode) => {
    clearError();
    setAuthMode(mode);
  };

  const renderAuthForm = () => {
    switch (authMode) {
      case 'login':
        return (
          <LoginForm 
            onSwitchToSetup={() => handleSwitchMode('setup')} 
            onShowRecovery={() => setRecoveryModalOpened(true)}
          />
        );
      case 'setup':
        return (
          <SetupForm 
            onSwitchToLogin={() => handleSwitchMode('login')}
          />
        );
      default:
        return (
          <LoginForm 
            onSwitchToSetup={() => handleSwitchMode('setup')} 
            onShowRecovery={() => setRecoveryModalOpened(true)}
          />
        );
    }
  };

  return (
    <Container 
      fluid 
      style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: colorScheme === 'dark' 
          ? `linear-gradient(135deg, ${theme.colors.dark[8]} 0%, ${theme.colors.dark[6]} 100%)`
          : `linear-gradient(135deg, ${theme.colors.gray[0]} 0%, ${theme.colors.gray[2]} 100%)`,
        padding: theme.spacing.md,
      }}
    >
      <Box ta="center" mb="xl">
        <ThemeIcon
          size={64}
          radius="xl"
          variant="gradient"
          gradient={{ from: 'blue', to: 'cyan', deg: 60 }}
        >
          <IconBrain size={40} stroke={1.5} />
        </ThemeIcon>
        <Title order={1} mt="md">
          PKMS
        </Title>
        <Text c="dimmed">
          Personal Knowledge Management System
        </Text>
      </Box>

      {renderAuthForm()}
      
      {/* Recovery Modal for Forgot Password */}
      <RecoveryModal
        opened={recoveryModalOpened}
        onClose={() => setRecoveryModalOpened(false)}
        onSuccess={() => {
          // Refresh the page or redirect to login after successful recovery
          window.location.reload();
        }}
      />

      <Box ta="center" mt="xl">
        <Text c="dimmed" size="sm">
          Sign in to access your knowledge base
        </Text>
      </Box>
    </Container>
  );
} 