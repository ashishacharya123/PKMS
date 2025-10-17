import { useEffect, useState } from 'react';
import { Card, Group, Stack, Text, Badge, Loader, ScrollArea, ActionIcon, Button } from '@mantine/core';
import { IconStar, IconFileText, IconFiles, IconChecklist, IconBook, IconArchive, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { dashboardService, FavoritesData } from '../../services/dashboardService';
import { useNavigate } from 'react-router-dom';

const getIcon = (type: string) => {
  switch (type) {
    case 'note': return <IconFileText size={14} />;
    case 'document': return <IconFiles size={14} />;
    case 'todo': return <IconChecklist size={14} />;
    case 'diary': return <IconBook size={14} />;
    case 'archive': return <IconArchive size={14} />;
    default: return <IconStar size={14} />;
  }
};

const getColor = (type: string) => {
  switch (type) {
    case 'note': return 'blue';
    case 'document': return 'green';
    case 'todo': return 'orange';
    case 'diary': return 'purple';
    case 'archive': return 'indigo';
    default: return 'gray';
  }
};

export function FavoritesCard() {
  const [data, setData] = useState<FavoritesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    dashboardService
      .getFavorites()
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        console.error('Failed to load favorites', err);
        setError('Failed to load favorites');
      })
      .finally(() => setLoading(false));
  }, []);

  const totalFavorites = Object.values(data || {}).reduce((sum, items) => sum + items.length, 0);

  if (totalFavorites === 0 && !loading) {
    return null; // Don't show if no favorites
  }

  return (
    <Card withBorder shadow="sm">
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconStar size={20} color="var(--mantine-color-yellow-6)" />
            <Text fw={600}>Favorites</Text>
            <Badge color="yellow" variant="light">
              {totalFavorites} items
            </Badge>
          </Group>
          <ActionIcon
            variant="subtle"
            onClick={() => setExpanded((prev) => !prev)}
            aria-label="Toggle favorites"
          >
            {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </ActionIcon>
        </Group>

        <Collapse in={expanded}>
          {loading ? (
            <Group justify="center" py="lg">
              <Loader size="sm" />
            </Group>
          ) : error ? (
            <Text size="sm" c="red">{error}</Text>
          ) : data ? (
            <ScrollArea h={300} offsetScrollbars>
              <Stack gap="sm">
                {Object.entries(data).map(([module, items]) => (
                  items.length > 0 && (
                    <div key={module}>
                      <Text size="sm" fw={500} mb="xs" c="dimmed" tt="uppercase">
                        {module} ({items.length})
                      </Text>
                      <Stack gap="xs">
                        {items.map((item) => (
                          <Group key={item.uuid} justify="space-between" wrap="nowrap">
                            <Group gap="xs" wrap="nowrap">
                              {getIcon(item.type)}
                              <Text size="sm" lineClamp={1} style={{ flex: 1 }}>
                                {item.title || item.name}
                              </Text>
                              <Badge size="xs" variant="dot" color={getColor(item.type)}>
                                {item.type}
                              </Badge>
                            </Group>
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() => {
                                // Navigate to appropriate page based on type
                                switch (item.type) {
                                  case 'note': navigate(`/notes/${item.uuid}`); break;
                                  case 'document': navigate(`/documents/${item.uuid}`); break;
                                  case 'todo': navigate(`/todos/${item.uuid}`); break;
                                  case 'diary': navigate(`/diary`); break; // Would need date filtering
                                  case 'archive': navigate(`/archive`); break;
                                  default: break;
                                }
                              }}
                            >
                              View
                            </Button>
                          </Group>
                        ))}
                      </Stack>
                    </div>
                  )
                ))}
              </Stack>
            </ScrollArea>
          ) : null}
        </Collapse>
      </Stack>
    </Card>
  );
}

export default FavoritesCard;
