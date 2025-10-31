import React from 'react';
import { 
  Card, 
  Text, 
  Group, 
  Badge, 
  Stack, 
  Avatar, 
  ActionIcon, 
  Tooltip,
  Divider,
  ScrollArea,
  ThemeIcon
} from '@mantine/core';
import { 
  IconCalendar, 
  IconFileText, 
  IconChecklist, 
  IconFolder, 
  IconArchive, 
  IconBook,
  IconPaperclip,
  IconEdit,
  IconPlus
} from '@tabler/icons-react';
import { RecentActivityItem } from '../../services/dashboardService';

interface ActivityTimelineProps {
  items: RecentActivityItem[];
  totalCount: number;
  cutoffDays: number;
}

const getModuleIcon = (type: string) => {
  switch (type) {
    case 'project': return IconCalendar;
    case 'todo': return IconChecklist;
    case 'note': return IconFileText;
    case 'document': return IconFileText;
    case 'archive': return IconArchive;
    case 'diary': return IconBook;
    default: return IconFileText;
  }
};

const getModuleColor = (type: string) => {
  switch (type) {
    case 'project': return 'blue';
    case 'todo': return 'green';
    case 'note': return 'orange';
    case 'document': return 'purple';
    case 'archive': return 'gray';
    case 'diary': return 'pink';
    default: return 'gray';
  }
};

const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  
  return date.toLocaleDateString();
};

const getStatusColor = (status?: string) => {
  switch (status) {
    case 'completed': return 'green';
    case 'active': return 'blue';
    case 'pending': return 'yellow';
    case 'overdue': return 'red';
    default: return 'gray';
  }
};

const getPriorityColor = (priority?: string) => {
  switch (priority) {
    case 'high': return 'red';
    case 'medium': return 'yellow';
    case 'low': return 'green';
    default: return 'gray';
  }
};

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ 
  items, 
  totalCount, 
  cutoffDays 
}) => {
  if (items.length === 0) {
    return (
      <Card withBorder>
        <Stack align="center" py="xl">
          <ThemeIcon size="xl" variant="light" color="gray">
            <IconCalendar size={32} />
          </ThemeIcon>
          <Text size="lg" fw={500} c="dimmed">
            No recent activity
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            Your recent activities from the last {cutoffDays} days will appear here
          </Text>
        </Stack>
      </Card>
    );
  }

  return (
    <Card withBorder>
      <Group justify="space-between" mb="md">
        <Text size="lg" fw={600}>
          Recent Activity
        </Text>
        <Badge variant="light" color="blue">
          {totalCount} items
        </Badge>
      </Group>
      
      <ScrollArea h={400}>
        <Stack gap="sm">
          {items.map((item, index) => {
            const Icon = getModuleIcon(item.type);
            const color = getModuleColor(item.type);
            const timeAgo = formatTimeAgo(item.updatedAt || item.createdAt);
            
            return (
              <React.Fragment key={item.id}>
                <Group wrap="nowrap" align="flex-start">
                  <Avatar size="sm" color={color} radius="sm">
                    <Icon size={16} />
                  </Avatar>
                  
                  <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text size="sm" fw={500} lineClamp={1}>
                        {item.title}
                      </Text>
                      <Group gap="xs" wrap="nowrap">
                        {item.isUpdated && (
                          <Tooltip label="Recently updated">
                            <ActionIcon size="xs" variant="light" color="blue">
                              <IconEdit size={12} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        {item.attachmentCount && item.attachmentCount > 0 && (
                          <Tooltip label={`${item.attachmentCount} attachments`}>
                            <ActionIcon size="xs" variant="light" color="gray">
                              <IconPaperclip size={12} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        <Text size="xs" c="dimmed">
                          {timeAgo}
                        </Text>
                      </Group>
                    </Group>
                    
                    {item.description && (
                      <Text size="xs" c="dimmed" lineClamp={2}>
                        {item.description}
                      </Text>
                    )}
                    
                    <Group gap="xs" wrap="nowrap">
                      <Badge size="xs" variant="light" color={color}>
                        {item.type}
                      </Badge>
                      
                      {item.metadata?.status && (
                        <Badge 
                          size="xs" 
                          variant="light" 
                          color={getStatusColor(item.metadata.status)}
                        >
                          {item.metadata.status}
                        </Badge>
                      )}
                      
                      {item.metadata?.priority && (
                        <Badge 
                          size="xs" 
                          variant="light" 
                          color={getPriorityColor(item.metadata.priority)}
                        >
                          {item.metadata.priority}
                        </Badge>
                      )}
                      
                      {item.metadata?.mood && (
                        <Badge size="xs" variant="light" color="pink">
                          Mood: {item.metadata.mood}/5
                        </Badge>
                      )}
                      
                      {item.metadata?.weatherCode && (
                        <Badge size="xs" variant="light" color="cyan">
                          Weather: {item.metadata.weatherCode}
                        </Badge>
                      )}
                    </Group>
                  </Stack>
                </Group>
                
                {index < items.length - 1 && <Divider />}
              </React.Fragment>
            );
          })}
        </Stack>
      </ScrollArea>
    </Card>
  );
};
