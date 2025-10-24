/**
 * Popular Tags Widget - Shows most-used tags as quick filters
 */

import { useState, useEffect } from 'react';
import { Card, Group, Badge, Text, Stack } from '@mantine/core';
import { IconTag } from '@tabler/icons-react';
import { tagsService } from '../../services/tagsService';
import { TagResponse } from '../../types/tag';

interface PopularTagsWidgetProps {
  onTagClick: (tagName: string) => void;
  currentTag?: string | null;
  limit?: number;
}

export function PopularTagsWidget({ 
  onTagClick, 
  currentTag, 
  limit = 10 
}: PopularTagsWidgetProps) {
  const [popularTags, setPopularTags] = useState<TagResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPopularTags = async () => {
      try {
        setLoading(true);
        const tags = await tagsService.getPopularTags(limit);
        setPopularTags(tags);
      } catch (error) {
        console.error('Failed to load popular tags:', error);
        setPopularTags([]);
      } finally {
        setLoading(false);
      }
    };

    loadPopularTags();
  }, [limit]);

  if (loading) {
    return (
      <Card withBorder>
        <Text size="sm" c="dimmed">Loading popular tags...</Text>
      </Card>
    );
  }

  if (popularTags.length === 0) {
    return null;
  }

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Group gap="xs">
          <IconTag size={16} />
          <Text size="sm" fw={500}>Popular Tags</Text>
        </Group>
        <Group gap="xs">
          {popularTags.map((tag) => (
            <Badge
              key={tag.uuid}
              size="md"
              variant={currentTag === tag.name ? 'filled' : 'light'}
              style={{ cursor: 'pointer' }}
              onClick={() => onTagClick(tag.name)}
            >
              {tag.name} ({tag.usageCount})
            </Badge>
          ))}
        </Group>
      </Stack>
    </Card>
  );
}
