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
  Progress,
  List,
  Group
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconUserPlus, IconCheck } from '@tabler/icons-react';
import { useAuthStore } from '../../stores/authStore';
import { UserSetup } from '../../types/auth';

interface SetupFormProps {
  onSwitchToLogin: () => void;
}

// Password strength checker
const getPasswordStrength = (password: string) => {
  let strength = 0;
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)
  };

  Object.values(checks).forEach(check => {
    if (check) strength += 20;
  });

  return { strength, checks };
};

export function SetupForm({ onSwitchToLogin }: SetupFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { setupUser, error, clearError } = useAuthStore();

  const form = useForm<UserSetup>({
    initialValues: {
      username: '',
      password: '',
      email: '',
    },
    validate: {
      username: (value) => {
        if (value.length < 3) return 'Username must be at least 3 characters long';
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) return 'Username can only contain letters, numbers, hyphens, and underscores';
        return null;
      },
      password: (value) => {
        const { checks } = getPasswordStrength(value);
        if (!checks.length) return 'Password must be at least 8 characters long';
        if (!checks.uppercase) return 'Password must contain at least one uppercase letter';
        if (!checks.lowercase) return 'Password must contain at least one lowercase letter';
        if (!checks.number) return 'Password must contain at least one number';
        if (!checks.special) return 'Password must contain at least one special character';
        return null;
      },
      email: (value) => {
        if (value && !/^\S+@\S+\.\S+$/.test(value)) {
          return 'Please enter a valid email address';
        }
        return null;
      },
    },
  });

  const { strength, checks } = getPasswordStrength(form.values.password);

  const handleSubmit = async (values: UserSetup) => {
    clearError();
    setIsLoading(true);
    
    try {
      const success = await setupUser(values);
      if (!success) {
        // Error is handled by the store
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getStrengthColor = () => {
    if (strength < 40) return 'red';
    if (strength < 80) return 'yellow';
    return 'green';
  };

  return (
    <Paper withBorder shadow="md" p={30} mt={30} radius="md" style={{ position: 'relative' }}>
      <LoadingOverlay visible={isLoading} />
      
      <Title order={2} ta="center" mb="md">
        Set up your PKMS
      </Title>
      
      <Text c="dimmed" size="sm" ta="center" mb="xl">
        Create your Personal Knowledge Management System account
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
            placeholder="Choose a username"
            description="3+ characters, letters, numbers, hyphens, and underscores only"
            required
            {...form.getInputProps('username')}
          />

          <TextInput
            label="Email (Optional)"
            placeholder="your.email@example.com"
            description="For account recovery purposes"
            {...form.getInputProps('email')}
          />

          <div>
            <PasswordInput
              label="Master Password"
              placeholder="Create a strong password"
              description="This password protects your entire knowledge system"
              required
              {...form.getInputProps('password')}
            />
            
            {form.values.password && (
              <div style={{ marginTop: '8px' }}>
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={500}>
                    Password Strength
                  </Text>
                  <Text size="sm" c={getStrengthColor()}>
                    {strength < 40 ? 'Weak' : strength < 80 ? 'Good' : 'Strong'}
                  </Text>
                </Group>
                
                <Progress 
                  value={strength} 
                  color={getStrengthColor()} 
                  size="sm" 
                  mb="xs"
                />
                
                <List size="xs" spacing="xs">
                  <List.Item 
                    icon={checks.length ? <IconCheck size="0.8rem" color="green" /> : null}
                    c={checks.length ? 'green' : 'dimmed'}
                  >
                    At least 8 characters
                  </List.Item>
                  <List.Item 
                    icon={checks.uppercase ? <IconCheck size="0.8rem" color="green" /> : null}
                    c={checks.uppercase ? 'green' : 'dimmed'}
                  >
                    One uppercase letter
                  </List.Item>
                  <List.Item 
                    icon={checks.lowercase ? <IconCheck size="0.8rem" color="green" /> : null}
                    c={checks.lowercase ? 'green' : 'dimmed'}
                  >
                    One lowercase letter
                  </List.Item>
                  <List.Item 
                    icon={checks.number ? <IconCheck size="0.8rem" color="green" /> : null}
                    c={checks.number ? 'green' : 'dimmed'}
                  >
                    One number
                  </List.Item>
                  <List.Item 
                    icon={checks.special ? <IconCheck size="0.8rem" color="green" /> : null}
                    c={checks.special ? 'green' : 'dimmed'}
                  >
                    One special character (!@#$%^&*)
                  </List.Item>
                </List>
              </div>
            )}
          </div>

          <Button
            type="submit"
            fullWidth
            leftSection={<IconUserPlus size="1rem" />}
            loading={isLoading}
            disabled={strength < 100}
          >
            Create Account
          </Button>
        </Stack>
      </form>

      <Text ta="center" mt="lg" size="sm">
        Already have an account?{' '}
        <Anchor component="button" onClick={onSwitchToLogin}>
          Sign in
        </Anchor>
      </Text>
    </Paper>
  );
} 