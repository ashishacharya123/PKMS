import { useState } from 'react';
import {
  Paper,
  TextInput,
  PasswordInput,
  Button,
  Title,
  Text,
  Anchor,
  Stack,
  Alert,
  LoadingOverlay,
  Group
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconLogin } from '@tabler/icons-react';
import { useAuthStore } from '../../stores/authStore';
import { LoginCredentials } from '../../types/auth';

interface LoginFormProps {
  onSwitchToSetup: () => void;
  onSwitchToRecovery: () => void;
}

export function LoginForm({ onSwitchToSetup, onSwitchToRecovery }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { login, error, clearError } = useAuthStore();

  const form = useForm<LoginCredentials>({
    initialValues: {
      username: '',
      password: '',
    },
    validate: {
      username: (value) => 
        value.length < 3 ? 'Username must be at least 3 characters long' : null,
      password: (value) => 
        value.length < 1 ? 'Password is required' : null,
    },
  });

  const handleSubmit = async (values: LoginCredentials) => {
    clearError();
    setIsLoading(true);
    
    try {
      const success = await login(values);
      if (!success) {
        // Error is handled by the store
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Paper withBorder shadow="md" p={30} mt={30} radius="md" style={{ position: 'relative' }}>
      <LoadingOverlay visible={isLoading} />
      
      <Title order={2} ta="center" mb="md">
        Welcome back to PKMS
      </Title>
      
      <Text c="dimmed" size="sm" ta="center" mb="xl">
        Sign in to your Personal Knowledge Management System
      </Text>

      {error && (
        <Alert icon={<IconAlertCircle size="1rem" />} color="red" mb="md">
          {error}
        </Alert>
      )}

      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <TextInput
            label="Username"
            placeholder="Enter your username"
            required
            {...form.getInputProps('username')}
          />

          <PasswordInput
            label="Password"
            placeholder="Enter your password"
            required
            {...form.getInputProps('password')}
          />

          <Button
            type="submit"
            fullWidth
            leftSection={<IconLogin size="1rem" />}
            loading={isLoading}
          >
            Sign In
          </Button>
        </Stack>
      </form>

      <Group justify="space-between" mt="lg">
        <Anchor component="button" size="sm" onClick={onSwitchToRecovery}>
          Forgot password?
        </Anchor>
        
        <Text size="sm">
          First time?{' '}
          <Anchor component="button" onClick={onSwitchToSetup}>
            Set up PKMS
          </Anchor>
        </Text>
      </Group>
    </Paper>
  );
} 