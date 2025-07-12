import { Group, Badge, Tooltip } from '@mantine/core';
import { DiaryMetadata } from '../../types/diary';

interface WellnessBadgesProps {
  metadata: DiaryMetadata;
  compact?: boolean;
}

export function WellnessBadges({ metadata, compact = false }: WellnessBadgesProps) {
  // Handle missing or empty metadata
  if (!metadata) return null;
  const badges: Array<{
    key: string;
    emoji: string;
    label: string;
    value: any;
    condition: (value: any) => boolean;
    color?: string;
  }> = [
    {
      key: 'exercise',
      emoji: '💪',
      label: 'Exercise',
      value: metadata.did_exercise,
      condition: (val) => val === true,
      color: 'green'
    },
    {
      key: 'meditation',
      emoji: '🧘',
      label: 'Meditation',
      value: metadata.did_meditation,
      condition: (val) => val === true,
      color: 'blue'
    },
    {
      key: 'social',
      emoji: '👥',
      label: 'Social',
      value: metadata.social_interaction,
      condition: (val) => val === true,
      color: 'grape'
    },
    {
      key: 'gratitude',
      emoji: '🙏',
      label: 'Gratitude',
      value: metadata.gratitude_practice,
      condition: (val) => val === true,
      color: 'yellow'
    },
    {
      key: 'sleep',
      emoji: '😴',
      label: `Sleep: ${metadata.sleep_duration}h`,
      value: metadata.sleep_duration,
      condition: (val) => val && val >= 7,
      color: 'teal'
    },
    {
      key: 'water',
      emoji: '💧',
      label: `Water: ${metadata.water_intake} glasses`,
      value: metadata.water_intake,
      condition: (val) => val && val >= 8,
      color: 'cyan'
    },
    {
      key: 'outside',
      emoji: '🌿',
      label: `Outside: ${metadata.time_outside}min`,
      value: metadata.time_outside,
      condition: (val) => val && val >= 30,
      color: 'green'
    },
    {
      key: 'reading',
      emoji: '📚',
      label: `Reading: ${metadata.reading_time}min`,
      value: metadata.reading_time,
      condition: (val) => val && val >= 15,
      color: 'indigo'
    },
    {
      key: 'screen',
      emoji: '📱',
      label: `Screen: ${metadata.screen_time}h`,
      value: metadata.screen_time,
      condition: (val) => val !== undefined && val <= 4, // Good if low screen time
      color: metadata.screen_time && metadata.screen_time > 6 ? 'red' : 'orange'
    },
    {
      key: 'energy',
      emoji: '⚡',
      label: `Energy: ${metadata.energy_level}/5`,
      value: metadata.energy_level,
      condition: (val) => val && val >= 4,
      color: 'yellow'
    },
    {
      key: 'stress',
      emoji: '😰',
      label: `Stress: ${metadata.stress_level}/5`,
      value: metadata.stress_level,
      condition: (val) => val && val <= 2, // Good if low stress
      color: metadata.stress_level && metadata.stress_level >= 4 ? 'red' : 'orange'
    }
  ];

  // Filter badges that have meaningful data
  const activeBadges = badges.filter(badge => {
    if (badge.value === undefined || badge.value === null) return false;
    if (typeof badge.value === 'boolean') return badge.value;
    if (typeof badge.value === 'number') return badge.value > 0;
    return false;
  });

  if (activeBadges.length === 0) return null;

  return (
    <Group gap="xs">
      {activeBadges.map(badge => {
        const isPositive = badge.condition(badge.value);
        
        return (
          <Tooltip key={badge.key} label={badge.label} position="top">
            <Badge
              size={compact ? "xs" : "sm"}
              variant={isPositive ? "filled" : "outline"}
              color={isPositive ? badge.color : "gray"}
              style={{ 
                opacity: isPositive ? 1 : 0.7,
                cursor: 'help'
              }}
            >
              {compact ? badge.emoji : `${badge.emoji} ${badge.label.split(':')[0]}`}
            </Badge>
          </Tooltip>
        );
      })}
    </Group>
  );
} 