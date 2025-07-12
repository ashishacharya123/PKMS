import React, { useState, useEffect } from 'react';
import {
  Modal,
  Paper,
  Text,
  Stack,
  Card,
  Group,
  Alert,
  Button,
  Badge,
  LoadingOverlay,
} from '@mantine/core';
import {
  IconShield,
  IconQuestionMark,
  IconAlertTriangle,
  IconEye,
} from '@tabler/icons-react';
import authService from '../../services/authService';

interface RecoveryViewModalProps {
  opened: boolean;
  onClose: () => void;
}

const RecoveryViewModal: React.FC<RecoveryViewModalProps> = ({
  opened,
  onClose
}) => {
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadRecoveryQuestions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await authService.getRecoveryQuestions();
      if (response.questions && response.questions.length > 0) {
        setQuestions(response.questions);
      } else {
        setError('No security questions found for this account.');
      }
    } catch (error: any) {
      console.error('Failed to load security questions:', error);
      setError(
        error.response?.data?.detail || 
        'Unable to load security questions.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (opened) {
      loadRecoveryQuestions();
    }
  }, [opened]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm">
          <IconEye size={20} />
          <Text fw={600}>Your Security Questions</Text>
        </Group>
      }
      size="md"
      centered
    >
      <Paper p="md">
        <LoadingOverlay visible={loading} overlayProps={{ radius: "sm", blur: 2 }} />
        
        <Text size="sm" c="dimmed" mb="lg" ta="center">
          View the security questions you have set up for account recovery.
        </Text>

        {error ? (
          <Alert icon={<IconAlertTriangle size={16} />} color="red" mb="md">
            <Text size="sm" fw={500} mb="xs">Error Loading Questions</Text>
            <Text size="sm">{error}</Text>
            <Button 
              size="xs" 
              variant="light" 
              color="red" 
              mt="sm"
              onClick={loadRecoveryQuestions}
            >
              Try Again
            </Button>
          </Alert>
        ) : questions.length > 0 ? (
          <Stack gap="md">
            <Alert icon={<IconShield size={16} />} color="blue" variant="light">
              <Text size="sm">
                You have {questions.length} security questions set up. 
                For security reasons, questions cannot be changed once configured.
              </Text>
            </Alert>

            {questions.map((question, index) => (
              <Card key={index} withBorder p="md">
                <Group gap="xs" mb="sm">
                  <Badge color="blue" variant="dot">Question {index + 1}</Badge>
                </Group>
                <Text size="sm" style={{ fontStyle: 'italic' }}>
                  {question}
                </Text>
              </Card>
            ))}

            <Alert icon={<IconQuestionMark size={16} />} color="orange" variant="light">
              <Text size="sm" fw={500} mb={4}>Recovery Information:</Text>
              <Text size="sm">
                • To reset your password, use "Forgot Password?" on the login page<br/>
                • You'll need to answer ALL questions correctly<br/>
                • Answers are case-sensitive and must match exactly
              </Text>
            </Alert>

            <Button
              fullWidth
              variant="light"
              onClick={onClose}
            >
              Close
            </Button>
          </Stack>
        ) : (
          <Alert icon={<IconAlertTriangle size={16} />} color="yellow">
            <Text size="sm">
              Loading your security questions...
            </Text>
          </Alert>
        )}
      </Paper>
    </Modal>
  );
};

export default RecoveryViewModal; 