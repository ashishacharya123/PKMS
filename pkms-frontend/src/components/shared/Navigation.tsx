import React, { useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import {
  AppShell,
  ScrollArea,
  Group,
  Text,
  UnstyledButton,
  ThemeIcon,
  Stack,
  
  Menu,
  Avatar,
  Divider,
  useMantineColorScheme,
  Box
} from '@mantine/core';
import {
  IconHome,
  IconNotes,
  IconFile,
  IconCheckbox,
  IconFolders,
  IconSearch,
  IconArchive,
  IconChevronDown,
  IconBook,
  IconLogout,
  IconBug,
  IconDatabase,
  IconKey,
  IconRefresh,
  IconRotateClockwise,
  IconTrash,
} from '@tabler/icons-react';
import { useAuthStore } from '../../stores/authStore';
import { dashboardService } from '../../services/dashboardService';
import { TestingInterface } from './TestingInterface';
import { BackupRestoreModal } from './BackupRestoreModal';
import RecoveryViewModal from '../auth/RecoveryViewModal';
import { apiService } from '../../services/api';
import { notifications } from '@mantine/notifications';

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
    description: 'Task management and kanban boards'
  },
  {
    label: 'Projects',
    icon: IconFolders,
    path: '/projects',
    color: 'orange',
    description: 'Project portfolios and progress tracking'
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
  const navigate = useNavigate();
  const [userMenuOpened, setUserMenuOpened] = useState(false);
  const [testingModalOpened, setTestingModalOpened] = useState(false);
  const [backupModalOpened, setBackupModalOpened] = useState(false);
  const [recoveryViewModalOpened, setRecoveryViewModalOpened] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const { user, logout } = useAuthStore();
  // const navigate = useNavigate();
  const location = useLocation();
  const { colorScheme } = useMantineColorScheme();

  const handleLogout = async () => {
    await logout();
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Reserved for future search integration

  // Reserved for future search input usage

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
                        {user?.lastLogin ? `Last login: ${dashboardService.formatLastUpdated(user.lastLogin)}` : 'Active'}
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
              leftSection={<IconRefresh size={14} />}
              onClick={async () => {
                try {
                  await apiService.extendSession();
                  setUserMenuOpened(false);
                } catch (e) {
                  // extendSession already handles notifications
                }
              }}
            >
              Refresh Session
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
            <Menu.Label>Search Tools</Menu.Label>
            <Menu.Item
              leftSection={<IconSearch size={14} />}
              onClick={() => { navigate('/search/unified'); setUserMenuOpened(false); }}
            >
              Unified Search
            </Menu.Item>
            <Menu.Item
              leftSection={<IconSearch size={14} />}
              onClick={() => { navigate('/search/fuzzy'); setUserMenuOpened(false); }}
            >
              Fuzzy Search
            </Menu.Item>
            <Menu.Item
              leftSection={<IconRotateClockwise size={14} />}
              disabled={reindexing}
              onClick={async () => {
                try {
                  if (reindexing) return;
                  setReindexing(true);
                  await apiService.reindexSearchContent();
                  setUserMenuOpened(false);
                } catch (e) {
                  // reindexSearchContent already handles notifications
                } finally { setReindexing(false); }
              }}
            >
              Re-index Content
            </Menu.Item>

            <Menu.Item
              leftSection={<IconFile size={14} />}
              onClick={async () => {
                try {
                  notifications.show({ id: 'thumb-build', title: 'Building Thumbnails', message: 'Scanning and generating missing thumbnails...', loading: true, autoClose: false });
                  const res = await apiService.buildThumbnails('medium');
                  notifications.update({ id: 'thumb-build', title: 'Thumbnails Built', message: `Created: ${res.created}, Existing: ${res.existing}, Failed: ${res.failed}`, color: 'green', loading: false, autoClose: 4000 });
                  setUserMenuOpened(false);
                } catch (e: any) {
                  notifications.update({ id: 'thumb-build', title: 'Thumbnail Build Failed', message: e?.message || 'Unknown error', color: 'red', loading: false, autoClose: 5000 });
                }
              }}
            >
              Build Thumbnails
            </Menu.Item>
            
            <Menu.Item
              leftSection={<IconTrash size={14} />}
              onClick={() => { navigate('/recyclebin'); setUserMenuOpened(false); }}
            >
              Recycle Bin
            </Menu.Item>
            
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