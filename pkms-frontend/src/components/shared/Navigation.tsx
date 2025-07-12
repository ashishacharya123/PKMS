import React, { useState, KeyboardEvent, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
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
  IconNotes,
  IconFile,
  IconCheckbox,
  IconCalendar,
  IconSearch,
  IconArchive,
  IconChevronDown,
  IconBook,
  IconLogout,
  IconBug,
  IconDatabase,
  IconKey,
} from '@tabler/icons-react';
import { useAuthStore } from '../../stores/authStore';
import { TestingInterface } from './TestingInterface';
import { BackupRestoreModal } from './BackupRestoreModal';
import RecoveryViewModal from '../auth/RecoveryViewModal';

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
    icon: IconNotes,
    path: '/notes',
    color: 'green',
    description: 'Markdown notes with linking'
  },
  {
    label: 'Documents',
    icon: IconFile,
    path: '/documents',
    color: 'orange',
    description: 'File management and search'
  },
  {
    label: 'Todos',
    icon: IconCheckbox,
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
  },
  {
    label: 'Advanced Fuzzy Search',
    icon: IconSearch, // Reuse search icon for clarity
    path: '/advanced-fuzzy-search',
    color: 'gray',
    description: 'Typo-tolerant search across all modules'
  }
];

interface NavigationProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Navigation({ collapsed = false }: NavigationProps) {
  const [userMenuOpened, setUserMenuOpened] = useState(false);
  const [testingModalOpened, setTestingModalOpened] = useState(false);
  const [backupModalOpened, setBackupModalOpened] = useState(false);
  const [recoveryViewModalOpened, setRecoveryViewModalOpened] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { colorScheme } = useMantineColorScheme();

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
                        Active
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

            <Menu.Item 
              leftSection={<IconKey size={14} />}
              onClick={() => setRecoveryViewModalOpened(true)}
            >
              View Security Questions
            </Menu.Item>

            <Menu.Item 
              leftSection={<IconDatabase size={14} />}
              onClick={() => setBackupModalOpened(true)}
            >
              Backup & Restore
            </Menu.Item>
            
            <Menu.Divider />
            <Menu.Item 
              leftSection={<IconBug size={14} />}
              onClick={() => setTestingModalOpened(true)}
            >
              Testing & Debug
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

      {/* Testing Interface Modal */}
      <TestingInterface 
        opened={testingModalOpened}
        onClose={() => setTestingModalOpened(false)}
      />

      {/* Backup & Restore Modal */}
      <BackupRestoreModal
        opened={backupModalOpened}
        onClose={() => setBackupModalOpened(false)}
      />

      {/* Recovery View Modal */}
      <RecoveryViewModal
        opened={recoveryViewModalOpened}
        onClose={() => setRecoveryViewModalOpened(false)}
      />
    </AppShell.Navbar>
  );
} 