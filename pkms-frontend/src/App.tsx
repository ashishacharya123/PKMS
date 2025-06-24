import { Container, Title, Text, Card, Button, Stack, Group, Badge } from '@mantine/core';
import { IconNotes, IconFileText, IconChecklist, IconLock } from '@tabler/icons-react';

function App() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <Title order={1} size="3rem" mb="md">
            🧠 PKMS
          </Title>
          <Text size="lg" c="dimmed">
            Personal Knowledge Management System
          </Text>
        </div>

        {/* Status Card */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title order={2} mb="md" ta="center">
            🎉 Setup Complete!
          </Title>
          <Text mb="lg" ta="center">
            Your PKMS development environment is ready and running.
          </Text>

          <Stack gap="md">
            <Group justify="center">
              <Badge color="green" size="lg">Backend: FastAPI (Port 8000)</Badge>
              <Badge color="blue" size="lg">Frontend: React + Vite (Port 3000)</Badge>
              <Badge color="purple" size="lg">Database: SQLite</Badge>
            </Group>

            <Text size="sm" c="dimmed" ta="center">
              All services are running successfully with security vulnerabilities resolved.
            </Text>
          </Stack>
        </Card>

        {/* Modules Overview */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title order={3} mb="md">
            📚 Core Modules
          </Title>
          <Stack gap="md">
            <Group>
              <IconNotes size={24} />
              <div>
                <Text fw={500}>Notes</Text>
                <Text size="sm" c="dimmed">Markdown notes with bidirectional linking</Text>
              </div>
            </Group>
            <Group>
              <IconFileText size={24} />
              <div>
                <Text fw={500}>Documents</Text>
                <Text size="sm" c="dimmed">PDF, DOCX, and image management</Text>
              </div>
            </Group>
            <Group>
              <IconChecklist size={24} />
              <div>
                <Text fw={500}>Todos</Text>
                <Text size="sm" c="dimmed">Task management with projects and priorities</Text>
              </div>
            </Group>
            <Group>
              <IconLock size={24} />
              <div>
                <Text fw={500}>Diary</Text>
                <Text size="sm" c="dimmed">Encrypted daily journal with voice recordings</Text>
              </div>
            </Group>
          </Stack>
        </Card>

        {/* Next Steps */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title order={3} mb="md">
            🚀 Development Status
          </Title>
          <Stack gap="sm">
            <Group>
              <Badge color="green">✅ Phase 1: Core Infrastructure</Badge>
            </Group>
            <Group>
              <Badge color="yellow">🔄 Phase 2: Authentication & Database</Badge>
            </Group>
            <Group>
              <Badge color="gray">⏳ Phase 3: Notes Module</Badge>
            </Group>
            <Group>
              <Badge color="gray">⏳ Phase 4: Documents Module</Badge>
            </Group>
            <Group>
              <Badge color="gray">⏳ Phase 5: Todo Module</Badge>
            </Group>
            <Group>
              <Badge color="gray">⏳ Phase 6: Encrypted Diary</Badge>
            </Group>
          </Stack>
        </Card>

        {/* Quick Actions */}
        <Group justify="center">
          <Button 
            component="a" 
            href="http://localhost:8000/docs" 
            target="_blank"
            variant="outline"
          >
            View API Documentation
          </Button>
          <Button 
            component="a" 
            href="http://localhost:8000/health" 
            target="_blank"
            variant="outline"
          >
            Check Backend Health
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}

export default App;
