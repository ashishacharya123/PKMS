import { useState, KeyboardEvent } from 'react';
import { NavLink, useLocation, Link, useNavigate } from 'react-router-dom';
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
  useMantineColorScheme,
  Box,
  TextInput
} from '@mantine/core';
import {
  IconHome,
  IconNote,
  IconFiles,
  IconCalendarCheck,
  IconBook,
  IconArchive,
  IconLogout,

  IconChevronDown,
  IconSettings,
  IconSearch
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
    icon: IconHome,
    path: '/dashboard',
    color: 'blue',
    description: 'Overview and quick access'
  },
  {
    label: 'Notes',
    icon: IconNote,
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
    icon: IconCalendarCheck,
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
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleSearch = (query: string) => {
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const query = e.currentTarget.value.trim();
      if (query) {
        handleSearch(query);
        e.currentTarget.value = ''; // Clear input after search
      }
    }
  };

  const NavigationLink = ({ item }: { item: NavigationItem }) => (
    <Box
      component={Link}
      to={item.path}
      style={{
        display: 'block',
        padding: '10px 14px',
        borderRadius: '8px',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'all 0.2s ease',
        backgroundColor: isActive(item.path) ? 'var(--mantine-color-blue-light)' : 'transparent',
        border: isActive(item.path) ? '1px solid var(--mantine-color-blue-filled)' : '1px solid transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = isActive(item.path) 
          ? 'var(--mantine-color-blue-light)' 
          : 'var(--mantine-color-gray-light)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isActive(item.path) ? 'var(--mantine-color-blue-light)' : 'transparent';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <Group gap="md" wrap="nowrap">
        <ThemeIcon
          size="md"
          variant="light"
          color={item.color}
          style={{
            border: isActive(item.path) ? `2px solid ${item.color}` : 'none',
          }}
        >
          <item.icon size={18} />
        </ThemeIcon>
        
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm" lineClamp={1}>
              {item.label}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {item.description}
            </Text>
          </div>
        )}
      </Group>
    </Box>
  );

  return (
    <AppShell.Navbar
      w={collapsed ? 80 : 280}
      p="sm"
      style={{
        borderRight: `1px solid ${
          colorScheme === 'dark' ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-3)'
        }`
      }}
    >
      {/* Header Section */}
      <AppShell.Section>
        <Group gap="sm" mb="xs" wrap="nowrap">
          <ThemeIcon size="xl" variant="gradient" gradient={{ from: 'blue', to: 'purple' }}>
            <IconBook size={28} />
          </ThemeIcon>
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="xl" fw={700} variant="gradient" gradient={{ from: 'blue', to: 'purple' }}>
                PKMS
              </Text>
              <div>
                <Text size="10px" c="dimmed" lh={1.1}>
                  Personal Knowledge
                </Text>
                <Text size="10px" c="dimmed" lh={1.1}>
                  Management System
                </Text>
              </div>
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
        <Divider mb="sm" />
        
        {/* Global Search */}
        {!collapsed ? (
          <TextInput
            placeholder="Search everywhere..."
            leftSection={<IconSearch size={16} />}
            size="sm"
            mb="xs"
            onKeyDown={handleSearchKeyDown}
            styles={{
              input: {
                backgroundColor: colorScheme === 'dark' 
                  ? 'var(--mantine-color-dark-6)' 
                  : 'var(--mantine-color-gray-0)',
                border: `1px solid ${
                  colorScheme === 'dark' ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-3)'
                }`,
              }
            }}
          />
        ) : (
          <Tooltip label="Global Search" position="right">
            <UnstyledButton
              w="100%"
              p="xs"
              mb="xs"
              style={{
                borderRadius: 'var(--mantine-radius-md)',
              }}
              onClick={() => {
                navigate('/search');
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
              <Group justify="center">
                <ThemeIcon variant="light" color="gray" size="md">
                  <IconSearch size={18} />
                </ThemeIcon>
              </Group>
            </UnstyledButton>
          </Tooltip>
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
              p="xs"
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
                  {user?.username ? user.username.charAt(0).toUpperCase() : 'A'}
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
            <Menu.Item leftSection={<IconHome size={14} />}>
              Profile Settings
            </Menu.Item>
            <Menu.Item leftSection={<IconSettings size={14} />}>
              Preferences
            </Menu.Item>

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