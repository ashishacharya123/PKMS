import { useEffect } from 'react';
import { 
  Container, 
  Title, 
  Text, 
  Card, 
  Button, 
  Stack, 
  Group, 
  Badge,
  Grid,
  Paper,
  ActionIcon,
  Menu
} from '@mantine/core';
import { 
  IconNotes, 
  IconFileText, 
  IconChecklist, 
  IconLock, 
  IconLogout,
  IconUser,
  IconSettings
} from '@tabler/icons-react';
import { useAuthStore } from '../stores/authStore';

export function DashboardPage() {
  const { user, logout, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleLogout = async () => {
    await logout();
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <Container size="lg" py="xl">
      {/* Header */}
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={1}>
            Welcome back, {user.username}! 👋
          </Title>
          <Text c="dimmed" mt="xs">
            Your Personal Knowledge Management System
          </Text>
        </div>
        
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <ActionIcon variant="light" size="lg">
              <IconUser size="1.2rem" />
            </ActionIcon>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Label>Account</Menu.Label>
            <Menu.Item leftSection={<IconSettings size="0.9rem" />}>
              Settings
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item 
              leftSection={<IconLogout size="0.9rem" />}
              color="red"
              onClick={handleLogout}
            >
              Logout
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {/* Status Card */}
      {user.is_first_login && (
        <Card shadow="sm" padding="lg" radius="md" withBorder mb="xl">
          <Title order={3} mb="md">
            🎉 Welcome to PKMS!
          </Title>
          <Text mb="lg">
            Your account has been created successfully. You can now start organizing your knowledge with our four core modules.
          </Text>
          <Badge color="blue" size="lg">
            First-time setup complete
          </Badge>
        </Card>
      )}

      {/* Modules Grid */}
      <Title order={2} mb="lg">
        📚 Core Modules
      </Title>

      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper shadow="sm" p="lg" radius="md" withBorder h="100%">
            <Group mb="md">
              <IconNotes size={32} color="#228be6" />
              <div>
                <Text fw={500} size="lg">Notes</Text>
                <Text size="sm" c="dimmed">Markdown notes with bidirectional linking</Text>
              </div>
            </Group>
            <Text size="sm" mb="md">
              Create and organize your thoughts, ideas, and knowledge using powerful markdown editing with support for linking between notes.
            </Text>
            <Button variant="light" disabled>
              Coming Soon
            </Button>
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper shadow="sm" p="lg" radius="md" withBorder h="100%">
            <Group mb="md">
              <IconFileText size={32} color="#40c057" />
              <div>
                <Text fw={500} size="lg">Documents</Text>
                <Text size="sm" c="dimmed">PDF, DOCX, and image management</Text>
              </div>
            </Group>
            <Text size="sm" mb="md">
              Upload, organize, and search through your documents with automatic text extraction and tagging support.
            </Text>
            <Button variant="light" disabled>
              Coming Soon
            </Button>
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper shadow="sm" p="lg" radius="md" withBorder h="100%">
            <Group mb="md">
              <IconChecklist size={32} color="#fd7e14" />
              <div>
                <Text fw={500} size="lg">Todos</Text>
                <Text size="sm" c="dimmed">Task management with projects and priorities</Text>
              </div>
            </Group>
            <Text size="sm" mb="md">
              Organize your tasks with project hierarchies, due dates, priorities, and completion tracking.
            </Text>
            <Button variant="light" disabled>
              Coming Soon
            </Button>
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper shadow="sm" p="lg" radius="md" withBorder h="100%">
            <Group mb="md">
              <IconLock size={32} color="#e03131" />
              <div>
                <Text fw={500} size="lg">Diary</Text>
                <Text size="sm" c="dimmed">Encrypted daily journal with voice recordings</Text>
              </div>
            </Group>
            <Text size="sm" mb="md">
              Keep your private thoughts secure with client-side encryption, supporting text, images, and voice recordings.
            </Text>
            <Button variant="light" disabled>
              Coming Soon
            </Button>
          </Paper>
        </Grid.Col>
      </Grid>

      {/* Development Status */}
      <Card shadow="sm" padding="lg" radius="md" withBorder mt="xl">
        <Title order={3} mb="md">
          🚀 Development Status
        </Title>
        <Stack gap="sm">
          <Group>
            <Badge color="green">✅ Phase 1: Core Infrastructure</Badge>
          </Group>
          <Group>
            <Badge color="green">✅ Phase 2: Authentication & Database</Badge>
          </Group>
          <Group>
            <Badge color="yellow">🔄 Phase 3: Frontend Authentication</Badge>
          </Group>
          <Group>
            <Badge color="gray">⏳ Phase 4: Notes Module</Badge>
          </Group>
          <Group>
            <Badge color="gray">⏳ Phase 5: Documents Module</Badge>
          </Group>
          <Group>
            <Badge color="gray">⏳ Phase 6: Todo Module</Badge>
          </Group>
          <Group>
            <Badge color="gray">⏳ Phase 7: Encrypted Diary</Badge>
          </Group>
        </Stack>
      </Card>
    </Container>
  );
} 