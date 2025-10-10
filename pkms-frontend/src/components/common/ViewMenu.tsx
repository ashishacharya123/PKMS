import {
  Menu,
  ActionIcon,
  Group,
  Text,
} from '@mantine/core';
import { 
  IconSettings, 
  IconGridDots, 
  IconGrid3x3, 
  IconList, 
  IconListDetails,
  IconCheck 
} from '@tabler/icons-react';

export type ViewMode = 'small-icons' | 'medium-icons' | 'list' | 'details';

interface ViewMenuProps {
  currentView: ViewMode;
  onChange: (view: ViewMode) => void;
  disabled?: boolean;
}

const viewOptions = [
  {
    value: 'small-icons' as ViewMode,
    label: 'Small Icons',
    icon: IconGridDots,
    description: 'Compact grid with small icons'
  },
  {
    value: 'medium-icons' as ViewMode,
    label: 'Medium Icons',
    icon: IconGrid3x3,
    description: 'Larger grid with medium icons'
  },
  {
    value: 'list' as ViewMode,
    label: 'List',
    icon: IconList,
    description: 'Simple list with basic info'
  },
  {
    value: 'details' as ViewMode,
    label: 'Details',
    icon: IconListDetails,
    description: 'Detailed list with metadata'
  }
];

export function ViewMenu({ currentView, onChange, disabled = false }: ViewMenuProps) {
  return (
    <Menu shadow="md" width={200} disabled={disabled}>
      <Menu.Target>
        <ActionIcon 
          variant="subtle" 
          size="lg"
          disabled={disabled}
          title="Change view mode"
        >
          <IconSettings size={18} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>View Options</Menu.Label>
        
        {viewOptions.map((option) => {
          const IconComponent = option.icon;
          const isSelected = currentView === option.value;
          
          return (
            <Menu.Item
              key={option.value}
              leftSection={<IconComponent size={16} />}
              rightSection={isSelected ? <IconCheck size={16} /> : null}
              onClick={() => onChange(option.value)}
              style={{
                backgroundColor: isSelected ? 'var(--mantine-color-blue-light)' : undefined
              }}
            >
              <Group justify="apart" w="100%">
                <div>
                  <Text size="sm" fw={isSelected ? 600 : 400}>
                    {option.label}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {option.description}
                  </Text>
                </div>
              </Group>
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}

export default ViewMenu;
