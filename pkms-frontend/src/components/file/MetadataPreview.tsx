/**
 * Component for displaying extracted file metadata
 * Shows preview of title, description, tags, and other extracted information
 */

import { Stack, Group, Text, Badge, Progress, Skeleton, Paper, Divider, Spoiler } from '@mantine/core';
import {
  IconCalendar,
  IconFileText,
  IconTag,
  IconUser,
  IconPhoto,
  IconClock,
  IconMapPin,
  IconWorld,
  IconRuler,
  IconLoader
} from '@tabler/icons-react';
import { ExtractedMetadata } from '../../services/metadataExtractionService';
import { formatFileSize } from '../../utils/fileUtils';

interface MetadataPreviewProps {
  metadata: ExtractedMetadata | null;
  loading?: boolean;
  error?: string | null;
  showFullDescription?: boolean;
  compact?: boolean;
}

export function MetadataPreview({
  metadata,
  loading = false,
  error = null,
  showFullDescription = false,
  compact = false
}: MetadataPreviewProps) {
  if (loading) {
    return (
      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Group gap="sm">
            <IconLoader size={16} className="animate-spin" />
            <Text size="sm" c="dimmed">Extracting metadata...</Text>
          </Group>
          <Skeleton height={20} mb="xs" />
          <Skeleton height={40} />
          <Skeleton height={24} width="60%" />
        </Stack>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper p="md" withBorder>
        <Text size="sm" c="red">Metadata extraction failed: {error}</Text>
      </Paper>
    );
  }

  if (!metadata) {
    return (
      <Paper p="md" withBorder>
        <Text size="sm" c="dimmed">No metadata available</Text>
      </Paper>
    );
  }

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const hasBasicInfo = metadata.title || metadata.description;
  const hasTechnicalInfo = metadata.createdDate || metadata.dimensions || metadata.pageCount;
  const hasTags = metadata.tags && metadata.tags.length > 0;

  if (compact) {
    return (
      <Stack gap="xs">
        {metadata.title && (
          <Text size="sm" fw={500} truncate>
            {metadata.title}
          </Text>
        )}

        {metadata.description && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {metadata.description}
          </Text>
        )}

        {hasTags && (
          <Group gap="xs" wrap="wrap">
            {metadata.tags!.slice(0, 3).map(tag => (
              <Badge key={tag} size="xs" variant="light">
                {tag}
              </Badge>
            ))}
            {metadata.tags!.length > 3 && (
              <Text size="xs" c="dimmed">+{metadata.tags!.length - 3} more</Text>
            )}
          </Group>
        )}
      </Stack>
    );
  }

  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        {/* Title and Basic Info */}
        {hasBasicInfo && (
          <>
            {metadata.title && (
              <Group gap="sm" align="center">
                <IconFileText size={16} c="blue" />
                <Text size="md" fw={600}>
                  {metadata.title}
                </Text>
              </Group>
            )}

            {metadata.description && (
              <Group gap="sm" align="flex-start">
                <IconFileText size={16} c="gray" style={{ marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  {showFullDescription ? (
                    <Text size="sm" c="dimmed">
                      {metadata.description}
                    </Text>
                  ) : (
                    <Spoiler maxHeight={60} showLabel="Show more" hideLabel="Show less">
                      <Text size="sm" c="dimmed">
                        {metadata.description}
                      </Text>
                    </Spoiler>
                  )}
                </div>
              </Group>
            )}
          </>
        )}

        {/* Tags */}
        {hasTags && (
          <Stack gap="xs">
            <Group gap="sm" align="center">
              <IconTag size={16} c="green" />
              <Text size="sm" fw={500}>Tags</Text>
            </Group>
            <Group gap="xs" wrap="wrap" ml={34}>
              {metadata.tags!.map(tag => (
                <Badge key={tag} size="sm" variant="light" color="green">
                  {tag}
                </Badge>
              ))}
            </Group>
          </Stack>
        )}

        {/* Technical Information */}
        {hasTechnicalInfo && (
          <>
            <Divider />
            <Stack gap="sm">
              <Text size="sm" fw={500}>Technical Details</Text>

              {/* Dates */}
              {(metadata.createdDate || metadata.modifiedDate) && (
                <Group gap="sm" align="center">
                  <IconCalendar size={14} c="blue" />
                  <Text size="xs" c="dimmed">
                    {metadata.createdDate && `Created: ${formatDate(metadata.createdDate)}`}
                    {metadata.modifiedDate && metadata.createdDate && " • "}
                    {metadata.modifiedDate && `Modified: ${formatDate(metadata.modifiedDate)}`}
                  </Text>
                </Group>
              )}

              {/* Document Properties */}
              {(metadata.pageCount || metadata.wordCount) && (
                <Group gap="xs" align="center" ml={34}>
                  {metadata.pageCount && (
                    <Text size="xs" c="dimmed">
                      {metadata.pageCount} pages
                    </Text>
                  )}
                  {metadata.pageCount && metadata.wordCount && " • "}
                  {metadata.wordCount && (
                    <Text size="xs" c="dimmed">
                      {metadata.wordCount.toLocaleString()} words
                    </Text>
                  )}
                </Group>
              )}

              {/* Image Dimensions */}
              {metadata.dimensions && (
                <Group gap="sm" align="center">
                  <IconRuler size={14} c="blue" />
                  <Text size="xs" c="dimmed">
                    {metadata.dimensions.width} × {metadata.dimensions.height} pixels
                  </Text>
                </Group>
              )}

              {/* Location */}
              {metadata.location && (
                <Group gap="sm" align="center">
                  <IconMapPin size={14} c="red" />
                  <Text size="xs" c="dimmed">
                    {metadata.location.latitude.toFixed(6)}, {metadata.location.longitude.toFixed(6)}
                  </Text>
                </Group>
              )}

              {/* Author */}
              {metadata.author && (
                <Group gap="sm" align="center">
                  <IconUser size={14} c="orange" />
                  <Text size="xs" c="dimmed">
                    {metadata.author}
                  </Text>
                </Group>
              )}

              {/* Language */}
              {metadata.language && (
                <Group gap="sm" align="center">
                  <IconWorld size={14} c="blue" />
                  <Text size="xs" c="dimmed">
                    Language: {metadata.language === 'en' ? 'English' : metadata.language === 'ne' ? 'नेपाली' : metadata.language}
                  </Text>
                </Group>
              )}

              {/* File Info from Custom Properties */}
              {metadata.customProperties && (
                <Group gap="xs" align="center" ml={34}>
                  {metadata.customProperties.fileSize && (
                    <Text size="xs" c="dimmed">
                      {formatFileSize(metadata.customProperties.fileSize)}
                    </Text>
                  )}
                  {metadata.customProperties.fileSize && metadata.customProperties.mimeType && " • "}
                  {metadata.customProperties.mimeType && (
                    <Text size="xs" c="dimmed">
                      {metadata.customProperties.mimeType}
                    </Text>
                  )}
                </Group>
              )}
            </Stack>
          </>
        )}

        {/* Keywords */}
        {metadata.keywords && metadata.keywords.length > 0 && (
          <>
            <Divider />
            <Stack gap="xs">
              <Text size="sm" fw={500}>Keywords</Text>
              <Group gap="xs" wrap="wrap" ml={34}>
                {metadata.keywords.map(keyword => (
                  <Badge key={keyword} size="xs" variant="outline">
                    {keyword}
                  </Badge>
                ))}
              </Group>
            </Stack>
          </>
        )}
      </Stack>
    </Paper>
  );
}