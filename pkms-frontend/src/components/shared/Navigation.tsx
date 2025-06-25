import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  AppShell,
  ScrollArea,
  Group,
  Text,
  UnstyledButton,
  ThemeIcon,
  Stack,
  Tooltip,
  Menu,
  Avatar,
  Divider,
  Switch,
  useMantineColorScheme
} from '@mantine/core';
import {
  IconNotes,
  IconFiles,
  IconChecklist,
  IconBook,
  IconArchive,
  IconSearch,
  IconSettings,
  IconLogout,
  IconUser,
  IconMoon,
  IconSun,
  IconDashboard,
  IconChevronDown
} from '@tabler/icons-react';
import { useAuthStore } from '../../stores/authStore';

interface NavigationItem {
  label: string;
  icon: React.ComponentType<any>;
  path: string;
  color: string;
  description: string;
}

const navigationItems: NavigationItem[] = [
  {
    label: 'Dashboard',
    icon: IconDashboard,
    path: '/dashboard',
    color: 'blue',
    description: 'Overview and quick access'
  },
  {
    label: 'Notes',
    icon: IconNotes,
    path: '/notes',
    color: 'green',
    description: 'Markdown notes with linking'
  },
  {
    label: 'Documents',
    icon: IconFiles,
    path: '/documents',
    color: 'orange',
    description: 'File management and search'
  },
  {
    label: 'Todos',
    icon: IconChecklist,
    path: '/todos',
    color: 'red',
    description: 'Task and project management'
  },
  {
    label: 'Diary',
    icon: IconBook,
    path: '/diary',
    color: 'purple',
    description: 'Encrypted personal journal'
  },
  {
    label: 'Archive',
    icon: IconArchive,
    path: '/archive',
    color: 'teal',
    description: 'Hierarchical file organization'
  }
];

interface NavigationProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Navigation({ collapsed = false }: NavigationProps) {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const [userMenuOpened, setUserMenuOpened] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard' || location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const NavigationLink = ({ item }: { item: NavigationItem }) => (
    <Tooltip
      label={collapsed ? `${item.label} - ${item.description}` : undefined}
      position="right"
      disabled={!collapsed}
      withArrow
    >
      <UnstyledButton
        component={NavLink}
        to={item.path}
        w="100%"
        p="sm"
        style={{
          borderRadius: 'var(--mantine-radius-md)',
          backgroundColor: isActive(item.path) 
            ? colorScheme === 'dark' 
              ? 'var(--mantine-color-dark-5)' 
              : 'var(--mantine-color-gray-1)'
            : 'transparent',
          border: isActive(item.path) 
            ? `1px solid var(--mantine-color-${item.color}-6)`
            : '1px solid transparent',
        }}
        onMouseEnter={(e) => {
          if (!isActive(item.path)) {
            e.currentTarget.style.backgroundColor = colorScheme === 'dark' 
              ? 'var(--mantine-color-dark-6)' 
              : 'var(--mantine-color-gray-0)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive(item.path)) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon
            variant={isActive(item.path) ? 'filled' : 'light'}
            color={item.color}
            size="md"
          >
            <item.icon size={18} />
          </ThemeIcon>
          
          {!collapsed && (
            <div style={{ flex: 1 }}>
              <Text size="sm" fw={isActive(item.path) ? 600 : 500}>
                {item.label}
              </Text>
              <Text size="xs" c="dimmed" lineClamp={1}>
                {item.description}
              </Text>
            </div>
          )}
        </Group>
      </UnstyledButton>
    </Tooltip>
  );

  return (
    <AppShell.Navbar
      w={collapsed ? 80 : 280}
      p="md"
      style={{
        borderRight: `1px solid ${
          colorScheme === 'dark' ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-3)'
        }`
      }}
    >
      {/* Header Section */}
      <AppShell.Section>
        <Group gap="xs" mb="md">
          <ThemeIcon size="lg" variant="gradient" gradient={{ from: 'blue', to: 'purple' }}>
            <IconBook size={20} />
          </ThemeIcon>
          {!collapsed && (
            <div>
              <Text size="lg" fw={700} variant="gradient" gradient={{ from: 'blue', to: 'purple' }}>
                PKMS
              </Text>
              <Text size="xs" c="dimmed">
                Personal Knowledge Management
              </Text>
            </div>
          )}
        </Group>
      </AppShell.Section>

      {/* Navigation Links */}
      <AppShell.Section grow component={ScrollArea}>
        <Stack gap="xs">
          {navigationItems.map((item) => (
            <NavigationLink key={item.path} item={item} />
          ))}
        </Stack>
      </AppShell.Section>

      {/* Footer Section */}
      <AppShell.Section>
        <Divider mb="md" />
        
        {/* Global Search */}
        <Tooltip label={collapsed ? "Global Search" : undefined} position="right" disabled={!collapsed}>
          <UnstyledButton
            w="100%"
            p="sm"
            mb="xs"
            style={{
              borderRadius: 'var(--mantine-radius-md)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colorScheme === 'dark' 
                ? 'var(--mantine-color-dark-6)' 
                : 'var(--mantine-color-gray-0)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon variant="light" color="gray" size="md">
                <IconSearch size={18} />
              </ThemeIcon>
              {!collapsed && (
                <Text size="sm" c="dimmed">
                  Search everywhere...
                </Text>
              )}
            </Group>
          </UnstyledButton>
        </Tooltip>

        {/* Theme Toggle */}
        {!collapsed && (
          <Group justify="space-between" mb="sm">
            <Group gap="xs">
              <ThemeIcon variant="light" color="yellow" size="sm">
                {colorScheme === 'dark' ? <IconMoon size={14} /> : <IconSun size={14} />}
              </ThemeIcon>
              <Text size="sm">Dark mode</Text>
            </Group>
            <Switch
              checked={colorScheme === 'dark'}
              onChange={() => toggleColorScheme()}
              size="sm"
            />
          </Group>
        )}

        {/* User Menu */}
        <Menu
          opened={userMenuOpened}
          onChange={setUserMenuOpened}
          position="top"
          withArrow
        >
          <Menu.Target>
            <UnstyledButton
              w="100%"
              p="sm"
              style={{
                borderRadius: 'var(--mantine-radius-md)',
                border: `1px solid ${
                  colorScheme === 'dark' ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-3)'
                }`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colorScheme === 'dark' 
                  ? 'var(--mantine-color-dark-6)' 
                  : 'var(--mantine-color-gray-0)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <Group gap="sm" wrap="nowrap">
                <Avatar size="sm" color="blue">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </Avatar>
                {!collapsed && (
                  <>
                    <div style={{ flex: 1 }}>
                      <Text size="sm" fw={500} lineClamp={1}>
                        {user?.username || 'User'}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {user?.is_first_login ? 'Setup required' : 'Active'}
                      </Text>
                    </div>
                    <IconChevronDown size={14} />
                  </>
                )}
              </Group>
            </UnstyledButton>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item leftSection={<IconUser size={14} />}>
              Profile Settings
            </Menu.Item>
            <Menu.Item leftSection={<IconSettings size={14} />}>
              Preferences
            </Menu.Item>
            {collapsed && (
              <Menu.Item 
                leftSection={colorScheme === 'dark' ? <IconSun size={14} /> : <IconMoon size={14} />}
                onClick={() => toggleColorScheme()}
              >
                Toggle Theme
              </Menu.Item>
            )}
            <Menu.Divider />
            <Menu.Item 
              leftSection={<IconLogout size={14} />} 
              color="red"
              onClick={handleLogout}
            >
              Logout
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </AppShell.Section>
    </AppShell.Navbar>
  );
} 