import React, { useState, useEffect } from 'react';
import {
  Modal,
  Alert,
  Text,
  Button,
  Stack,
  Card,
  Group,
  LoadingOverlay,
  Textarea,
  PasswordInput,
  Badge,
  Divider,
  Select,
  List
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconShield,
  IconCheck,
  IconAlertTriangle,
  IconKey,
} from '@tabler/icons-react';
import authService from '../../services/authService';

interface RecoverySetupModalProps {
  opened: boolean;
  onClose: () => void;
  onComplete: () => void;
  username: string;
}

const PREDEFINED_QUESTIONS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What was the name of your first school?",
  "What city were you born in?",
  "What was your childhood nickname?",
  "What is the name of your favorite teacher?",
  "What was the make of your first car?",
  "What is your favorite book?",
  "What was the name of the street you grew up on?",
  "What is your favorite movie?",
  "What was your first job?",
  "What is the name of your best friend from childhood?",
  "What was your favorite food as a child?",
  "What high school did you attend?",
  "What was the name of your first boss?",
  "What is your favorite color?",
  "What was the name of your first boyfriend/girlfriend?",
  "What city did you meet your spouse in?",
  "What is your favorite vacation destination?",
  "What was your grandmother's first name?"
];

const RecoverySetupModal: React.FC<RecoverySetupModalProps> = ({
  opened,
  onClose,
  onComplete,
  username
}) => {
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<string[]>(['', '', '']);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);

  const form = useForm({
    initialValues: {
      question1: '',
      answer1: '',
      question2: '',
      answer2: '',
      question3: '',
      answer3: '',
    },
    validate: {
      question1: (value) => !value ? 'Please select a security question' : null,
      answer1: (value) => !value ? 'Please provide an answer' : value.length < 3 ? 'Answer must be at least 3 characters' : null,
      question2: (value) => !value ? 'Please select a security question' : null,
      answer2: (value) => !value ? 'Please provide an answer' : value.length < 3 ? 'Answer must be at least 3 characters' : null,
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setLoading(true);
    
    try {
      const questions = [values.question1, values.question2];
      const answers = [values.answer1, values.answer2];

      // Add third question/answer if provided
      if (values.question3 && values.answer3) {
        questions.push(values.question3);
        answers.push(values.answer3);
      }

      // Validate no duplicate questions
      const uniqueQuestions = new Set(questions);
      if (uniqueQuestions.size !== questions.length) {
        notifications.show({
          title: 'Duplicate Questions',
          message: 'Please select different security questions',
          color: 'red',
        });
        setLoading(false);
        return;
      }

      await authService.setupRecovery({ questions, answers });

      // Complete the first-time setup to transition user out of first-login mode
      try {
        await authService.completeSetup();
      } catch (error) {
        console.warn('Note: Complete setup call failed, but recovery setup succeeded:', error);
      }

      notifications.show({
        title: 'Recovery Setup Complete',
        message: 'Your security questions have been set up successfully. You can now log in to access PKMS!',
        color: 'green',
      });

      onComplete();
      onClose();
    } catch (error: any) {
      console.error('Recovery setup failed:', error);
      notifications.show({
        title: 'Setup Failed',
        message: error.response?.data?.detail || 'Failed to set up recovery questions',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const getAvailableQuestions = (excludeQuestions: string[]) => {
    return PREDEFINED_QUESTIONS.filter(q => !excludeQuestions.includes(q));
  };

  const isStepComplete = (step: number) => {
    switch (step) {
      case 1:
        return form.values.question1 && form.values.answer1;
      case 2:
        return form.values.question2 && form.values.answer2;
      case 3:
        return true; // Optional step
      default:
        return false;
    }
  };

  const getProgress = () => {
    let completed = 0;
    if (isStepComplete(1)) completed++;
    if (isStepComplete(2)) completed++;
    if (form.values.question3 && form.values.answer3) completed++;
    return (completed / 2) * 100; // Minimum 2 questions required
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Security Questions Setup"
      size="lg"
      centered
      closeOnClickOutside={false}
    >
      <Stack gap="md">
        <Alert
          icon={<IconShield size={16} />}
          color="blue"
          variant="light"
        >
          <Text size="sm">
            Set up security questions to recover your account if you forget your password. 
            Choose questions only you would know the answers to.
          </Text>
        </Alert>

        <Card withBorder p="md">
          <Group gap="xs" mb="sm">
            <IconKey size={14} />
            <Text fw={500} size="sm">Account: {username}</Text>
          </Group>
          
          <LoadingOverlay visible={loading} />
          <Text size="xs" color="dimmed">
            {getProgress() >= 100 ? 'Setup complete!' : 'Minimum 2 questions required'}
          </Text>
        </Card>

        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="lg">
            {/* Question 1 - Required */}
            <Card withBorder p="md">
              <Group gap="xs" mb="sm">
                <Badge color="red" variant="dot">Required</Badge>
                <Text fw={500}>Security Question 1</Text>
              </Group>
              
              <Select
                label="Choose your first security question"
                placeholder="Select a question..."
                data={PREDEFINED_QUESTIONS}
                searchable
                {...form.getInputProps('question1')}
                mb="sm"
              />
              
              <Textarea
                label="Your answer"
                placeholder="Enter your answer (case-sensitive)"
                minRows={2}
                {...form.getInputProps('answer1')}
              />
            </Card>

            {/* Question 2 - Required */}
            <Card withBorder p="md">
              <Group gap="xs" mb="sm">
                <Badge color="red" variant="dot">Required</Badge>
                <Text fw={500}>Security Question 2</Text>
              </Group>
              
              <Select
                label="Choose your second security question"
                placeholder="Select a different question..."
                data={getAvailableQuestions([form.values.question1])}
                searchable
                {...form.getInputProps('question2')}
                mb="sm"
              />
              
              <Textarea
                label="Your answer"
                placeholder="Enter your answer (case-sensitive)"
                minRows={2}
                {...form.getInputProps('answer2')}
              />
            </Card>

            {/* Question 3 - Optional */}
            <Card withBorder p="md">
              <Group gap="xs" mb="sm">
                <Badge color="gray" variant="dot">Optional</Badge>
                <Text fw={500}>Security Question 3 (Additional Security)</Text>
              </Group>
              
              <Select
                label="Choose a third security question (optional)"
                placeholder="Select another question..."
                data={getAvailableQuestions([form.values.question1, form.values.question2])}
                searchable
                {...form.getInputProps('question3')}
                mb="sm"
                clearable
              />
              
              {form.values.question3 && (
                <Textarea
                  label="Your answer"
                  placeholder="Enter your answer (case-sensitive)"
                  minRows={2}
                  {...form.getInputProps('answer3')}
                />
              )}
            </Card>

            <Divider />

                         <Alert
               icon={<IconAlertTriangle size={16} />}
               color="orange"
               variant="light"
             >
               <Text size="sm" fw={500} mb={4}>Important Security Notes:</Text>
               <List size="sm" spacing={2}>
                 <List.Item>Answers are case-sensitive - remember exactly how you type them</List.Item>
                 <List.Item>Choose questions only you would know the answers to</List.Item>
                 <List.Item>Avoid answers that could be found on social media</List.Item>
                 <List.Item>You'll need to answer ALL questions correctly to recover your account</List.Item>
               </List>
             </Alert>

             <Group justify="right" gap="sm">
               <Button 
                 variant="subtle" 
                 onClick={onClose}
                 disabled={loading}
               >
                 Skip for Now
               </Button>
               <Button
                 type="submit"
                 loading={loading}
                 disabled={!isStepComplete(1) || !isStepComplete(2)}
                 leftSection={<IconCheck size={16} />}
               >
                 Complete Setup
               </Button>
             </Group>
          </Stack>
        </form>
      </Stack>
    </Modal>
  );
};

export default RecoverySetupModal; 