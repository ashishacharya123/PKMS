import React, { useState, useEffect } from 'react';
import {
  Modal,
  Paper,
  Alert,
  Text,
  Button,
  Stack,
  Card,
  Group,
  LoadingOverlay,
  Textarea,
  PasswordInput,
  Divider,
} from '@mantine/core';
import {
  IconShield,
  IconQuestionMark,
  IconAlertTriangle,
  IconLock,
  IconCheck,
} from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useAuthStore } from '../../stores/authStore';
import authService from '../../services/authService';

interface RecoveryModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess: () => void;
  username?: string;
}

interface UserQuestion {
  question: string;
  index: number;
}

const RecoveryModal: React.FC<RecoveryModalProps> = ({
  opened,
  onClose,
  onSuccess,
  username
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [userQuestions, setUserQuestions] = useState<UserQuestion[]>([]);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  
  const { resetPasswordWithRecovery, user } = useAuthStore();

  const effectiveUsername = username ?? user?.username;

  // Security Questions Form
  const questionsForm = useForm({
    initialValues: {
      answer1: '',
      answer2: '',
      answer3: '',
      answer4: '',
      answer5: '',
      newPassword: '',
      confirmPassword: '',
    },
    validate: {
      newPassword: (value) => {
        if (!value || value.length < 8) return 'Password must be at least 8 characters';
        // SECURITY: Basic validation to prevent script injection
        if (value.includes('<script') || value.includes('javascript:')) return 'Invalid characters in password';
        return null;
      },
      confirmPassword: (value, values) =>
        value !== values.newPassword ? 'Passwords must match' : null,
      answer1: (value) => {
        if (!value || value.trim().length === 0) return 'Answer is required';
        if (value.includes('<script') || value.includes('javascript:')) return 'Invalid characters in answer';
        return null;
      },
      answer2: (value) => {
        if (!value || value.trim().length === 0) return 'Answer is required';
        if (value.includes('<script') || value.includes('javascript:')) return 'Invalid characters in answer';
        return null;
      },
      answer3: (value) => {
        if (!value || value.trim().length === 0) return 'Answer is required';
        if (value.includes('<script') || value.includes('javascript:')) return 'Invalid characters in answer';
        return null;
      },
      answer4: (value) => {
        if (!value || value.trim().length === 0) return 'Answer is required';
        if (value.includes('<script') || value.includes('javascript:')) return 'Invalid characters in answer';
        return null;
      },
      answer5: (value) => {
        if (!value || value.trim().length === 0) return 'Answer is required';
        if (value.includes('<script') || value.includes('javascript:')) return 'Invalid characters in answer';
        return null;
      },
    },
  });

  // Load user's security questions
  const loadUserQuestions = async () => {
    // Validate username before loading questions
    if (!effectiveUsername || effectiveUsername.length < 3) {
      setQuestionsError('Please provide a valid username (at least 3 characters)');
      setLoadingQuestions(false);
      return;
    }
    
    setLoadingQuestions(true);
    setQuestionsError(null);
    
    try {
      // Call backend to get user's security questions
      const response = await authService.getRecoveryQuestions();
      if (response.questions && response.questions.length > 0) {
        const questions = response.questions.map((question: string, index: number) => ({
          question,
          index
        }));
        setUserQuestions(questions);
        // Reset form values for the number of questions loaded
        questionsForm.setValues({
          answer1: '',
          answer2: '',
          answer3: '',
          answer4: '',
          answer5: '',
          newPassword: '',
          confirmPassword: '',
        });
      } else {
        setQuestionsError('No security questions found for this account.');
      }
    } catch (error: any) {
      console.error('Failed to load security questions:', error);
      setQuestionsError(
        error.response?.data?.detail || 
        'Unable to load security questions. Please try again or use database reset.'
      );
    } finally {
      setLoadingQuestions(false);
    }
  };

  // Load questions when modal opens
  useEffect(() => {
    if (opened) {
      loadUserQuestions();
    }
  }, [opened]);

  const handleSecurityQuestionsReset = async (values: typeof questionsForm.values) => {
    setLoading(true);
    
    try {
      // Collect answers from individual form fields into an array
      const answers: string[] = [];
      for (let i = 0; i < userQuestions.length; i++) {
        const answerKey = `answer${i + 1}` as keyof typeof values;
        const answer = values[answerKey] as string;
        answers.push(answer || '');
      }

      // Validate all answers are provided
      const emptyAnswers = answers.filter(answer => !answer.trim());
      if (emptyAnswers.length > 0) {
        notifications.show({
          title: 'Missing Answers',
          message: 'Please provide answers to all security questions',
          color: 'red',
        });
        setLoading(false);
        return;
      }

      // Validate username meets minimum length requirement
      if (!effectiveUsername || effectiveUsername.length < 3) {
        notifications.show({
          title: 'Invalid Username',
          message: 'Please provide a valid username (at least 3 characters)',
          color: 'red',
        });
        setLoading(false);
        return;
      }

      const success = await resetPasswordWithRecovery({
        username: effectiveUsername,
        answers: answers,
        new_password: values.newPassword,
      });

      if (success) {
        notifications.show({
          title: 'Password Reset Successful',
          message: 'Your password has been reset successfully. You can now log in.',
          color: 'green',
        });
        onSuccess();
        onClose();
      }
    } catch (error: any) {
      console.error('Security questions reset failed:', error);
      notifications.show({
        title: 'Reset Failed',
        message: error.response?.data?.detail || 'Failed to reset password with security questions',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const SecurityQuestionsTab = () => (
    <Stack gap="md" style={{ position: 'relative' }}>
      <LoadingOverlay visible={loadingQuestions} overlayProps={{ radius: "sm", blur: 2 }} />
      
      <Alert icon={<IconQuestionMark size={16} />} color="blue">
        Answer your security questions to reset your login password.
      </Alert>

      {questionsError ? (
        <Alert icon={<IconAlertTriangle size={16} />} color="red">
          <Text size="sm" fw={500} mb="xs">Error Loading Questions</Text>
          <Text size="sm">{questionsError}</Text>
          <Button 
            size="xs" 
            variant="light" 
            color="red" 
            mt="sm"
            onClick={loadUserQuestions}
          >
            Try Again
          </Button>
        </Alert>
      ) : userQuestions.length > 0 ? (
        <form onSubmit={questionsForm.onSubmit(handleSecurityQuestionsReset)}>
          <Stack gap="lg">
            <Card withBorder p="md">
              <Text size="sm" fw={500} mb="md" c="blue">
                Please answer all {userQuestions.length} security questions:
              </Text>
              
              <Stack gap="md">
                {userQuestions.map((userQuestion, index) => {
                  const answerKey = `answer${index + 1}` as keyof typeof questionsForm.values;
                  return (
                    <div key={index}>
                      <Text size="sm" fw={500} mb="xs" c="dimmed">
                        Question {index + 1}:
                      </Text>
                      <Card withBorder p="sm" mb="xs" bg="var(--mantine-color-gray-light)">
                        <Text size="sm" style={{ fontStyle: 'italic' }}>
                          {userQuestion.question}
                        </Text>
                      </Card>
                      <Textarea
                        placeholder="Enter your answer (case-sensitive)"
                        minRows={2}
                        maxRows={4}
                        required
                        {...questionsForm.getInputProps(answerKey)}
                        styles={{
                          input: {
                            fontSize: 'var(--mantine-font-size-sm)',
                          }
                        }}
                        autoComplete="off"
                      />
                    </div>
                  );
                })}
              </Stack>
            </Card>

            <Divider />

            <Card withBorder p="md">
              <Text size="sm" fw={500} mb="md">Set New Password</Text>
              <Stack gap="sm">
                <PasswordInput
                  label="New Password"
                  placeholder="Enter your new password"
                  required
                  {...questionsForm.getInputProps('newPassword')}
                  autoComplete="new-password"
                />
                <PasswordInput
                  label="Confirm New Password"
                  placeholder="Confirm your new password"
                  required
                  {...questionsForm.getInputProps('confirmPassword')}
                  autoComplete="new-password"
                />
              </Stack>
            </Card>

            <Alert icon={<IconLock size={16} />} color="orange">
              <Text size="sm">
                <strong>Important:</strong> Answers are case-sensitive and must match exactly 
                as you entered them during setup. After password reset, you'll need to log in again.
              </Text>
            </Alert>

            <Button
              type="submit"
              fullWidth
              loading={loading}
              disabled={
                // Check if any required answers are missing
                userQuestions.some((_, index) => {
                  const answerKey = `answer${index + 1}` as keyof typeof questionsForm.values;
                  const answer = questionsForm.values[answerKey] as string;
                  return !answer || !answer.trim();
                }) ||
                !questionsForm.values.newPassword ||
                !questionsForm.values.confirmPassword ||
                questionsForm.values.newPassword !== questionsForm.values.confirmPassword
              }
              leftSection={<IconCheck size={16} />}
            >
              Reset Login Password
            </Button>
          </Stack>
        </form>
      ) : (
        <Alert icon={<IconAlertTriangle size={16} />} color="yellow">
          <Text size="sm">
            Loading your security questions...
          </Text>
        </Alert>
      )}
    </Stack>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm">
          <IconShield size={20} />
          <Text fw={600}>Account Recovery</Text>
        </Group>
      }
      size="lg"
      centered
      closeOnClickOutside={false}
    >
      <Paper p="md">
        <Text size="sm" c="dimmed" mb="lg" ta="center">
          Recover access to your account using your security questions.
        </Text>

        <SecurityQuestionsTab />
      </Paper>
    </Modal>
  );
};

export default RecoveryModal; 