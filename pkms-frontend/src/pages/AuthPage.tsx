import { useState } from 'react';
import { Container, Center, Box, Title, Text } from '@mantine/core';
import { LoginForm } from '../components/auth/LoginForm';
import { SetupForm } from '../components/auth/SetupForm';

type AuthMode = 'login' | 'setup' | 'recovery';

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');

  const renderAuthForm = () => {
    switch (mode) {
      case 'setup':
        return (
          <SetupForm 
            onSwitchToLogin={() => setMode('login')} 
          />
        );
      case 'recovery':
        return (
          <div>
            <Text ta="center" mt="xl">
              Password recovery coming soon...
            </Text>
            <Text ta="center" mt="md">
              <button onClick={() => setMode('login')}>Back to Login</button>
            </Text>
          </div>
        );
      default:
        return (
          <LoginForm 
            onSwitchToSetup={() => setMode('setup')}
            onSwitchToRecovery={() => setMode('recovery')}
          />
        );
    }
  };

  return (
    <Container size={420} my={40}>
      <Center>
        <Box w="100%">
          <Title order={1} ta="center" mb="lg">
            🧠 PKMS
          </Title>
          <Text c="dimmed" ta="center" mb="xl">
            Personal Knowledge Management System
          </Text>
          
          {renderAuthForm()}
        </Box>
      </Center>
    </Container>
  );
} 