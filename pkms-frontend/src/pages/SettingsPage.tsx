/**
 * SettingsPage - User settings and application configuration
 */

import { useEffect, useState } from 'react';
import { 
  Container, 
  Title, 
  Stack, 
  Group, 
  Button, 
  Card, 
  Text, 
  Alert, 
  TextInput,
  Switch,
  Select,
  Divider,
  Badge,
  Modal,
  PasswordInput
} from '@mantine/core';
import { 
  IconUser, 
  IconSettings, 
  IconKey,
  IconPalette,
  IconBell,
  IconDatabase,
  IconShield,
  IconCheck,
  IconAlertTriangle
} from '@tabler/icons-react';
import { useAuthStore } from '../stores/authStore';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';

export function SettingsPage() {
  const { user, updateProfile, changePassword } = useAuthStore();
  
  const [profileData, setProfileData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    fullName: user?.fullName || ''
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [appSettings, setAppSettings] = useState({
    theme: 'light',
    language: 'en',
    notifications: true,
    autoSave: true,
    showTutorials: true
  });

  const [diarySettings, setDiarySettings] = useState({
    encryptionEnabled: false,
    passwordHint: '',
    autoLock: false,
    lockTimeout: 30
  });

  const [passwordModalOpened, { open: openPasswordModal, close: closePasswordModal }] = useDisclosure(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setProfileData({
        username: user.username || '',
        email: user.email || '',
        fullName: user.fullName || ''
      });
    }
  }, [user]);

  const handleProfileUpdate = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await updateProfile(profileData);
      notifications.show({
        title: 'Profile Updated',
        message: 'Your profile has been updated successfully',
        color: 'green',
        icon: <IconCheck size={16} />
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      await changePassword(passwordData.currentPassword, passwordData.newPassword);
      notifications.show({
        title: 'Password Changed',
        message: 'Your password has been changed successfully',
        color: 'green',
        icon: <IconCheck size={16} />
      });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      closePasswordModal();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppSettingsUpdate = () => {
    // This would typically save to backend
    notifications.show({
      title: 'Settings Saved',
      message: 'Application settings have been saved',
      color: 'green',
      icon: <IconCheck size={16} />
    });
  };

  const handleDiarySettingsUpdate = () => {
    // This would typically save to backend
    notifications.show({
      title: 'Diary Settings Saved',
      message: 'Diary settings have been saved',
      color: 'green',
      icon: <IconCheck size={16} />
    });
  };

  return (
    <Container size="lg" py="md">
      <Stack gap="lg">
        <Title order={2}>Settings</Title>

        {error && (
          <Alert
            color="red"
            icon={<IconAlertTriangle size={16} />}
            title="Error"
            onClose={() => setError(null)}
            withCloseButton
          >
            {error}
          </Alert>
        )}

        {/* Profile Settings */}
        <Card withBorder>
          <Stack gap="md">
            <Group gap="xs" align="center">
              <IconUser size={20} />
              <Title order={4}>Profile Settings</Title>
            </Group>
            
            <TextInput
              label="Username"
              value={profileData.username}
              onChange={(e) => setProfileData({ ...profileData, username: e.target.value })}
              disabled
            />
            
            <TextInput
              label="Email"
              type="email"
              value={profileData.email}
              onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
            />
            
            <TextInput
              label="Full Name"
              value={profileData.fullName}
              onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
            />

            <Group justify="flex-end">
              <Button onClick={handleProfileUpdate} loading={isLoading}>
                Update Profile
              </Button>
            </Group>
          </Stack>
        </Card>

        {/* Security Settings */}
        <Card withBorder>
          <Stack gap="md">
            <Group gap="xs" align="center">
              <IconShield size={20} />
              <Title order={4}>Security</Title>
            </Group>
            
            <Group justify="space-between" align="center">
              <div>
                <Text size="sm" fw={500}>Password</Text>
                <Text size="xs" c="dimmed">Last changed: Never</Text>
              </div>
              <Button
                variant="light"
                leftSection={<IconKey size={16} />}
                onClick={openPasswordModal}
              >
                Change Password
              </Button>
            </Group>

            <Group justify="space-between" align="center">
              <div>
                <Text size="sm" fw={500}>Two-Factor Authentication</Text>
                <Text size="xs" c="dimmed">Add an extra layer of security</Text>
              </div>
              <Badge color="gray" variant="light">
                Not Available
              </Badge>
            </Group>
          </Stack>
        </Card>

        {/* Application Settings */}
        <Card withBorder>
          <Stack gap="md">
            <Group gap="xs" align="center">
              <IconSettings size={20} />
              <Title order={4}>Application Settings</Title>
            </Group>
            
            <Select
              label="Theme"
              value={appSettings.theme}
              onChange={(value) => setAppSettings({ ...appSettings, theme: value || 'light' })}
              data={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'auto', label: 'Auto' }
              ]}
            />

            <Select
              label="Language"
              value={appSettings.language}
              onChange={(value) => setAppSettings({ ...appSettings, language: value || 'en' })}
              data={[
                { value: 'en', label: 'English' },
                { value: 'ne', label: 'नेपाली' }
              ]}
            />

            <Switch
              label="Enable Notifications"
              description="Receive notifications for important events"
              checked={appSettings.notifications}
              onChange={(e) => setAppSettings({ ...appSettings, notifications: e.currentTarget.checked })}
            />

            <Switch
              label="Auto-save"
              description="Automatically save changes as you type"
              checked={appSettings.autoSave}
              onChange={(e) => setAppSettings({ ...appSettings, autoSave: e.currentTarget.checked })}
            />

            <Switch
              label="Show Tutorials"
              description="Display helpful tips and tutorials"
              checked={appSettings.showTutorials}
              onChange={(e) => setAppSettings({ ...appSettings, showTutorials: e.currentTarget.checked })}
            />

            <Group justify="flex-end">
              <Button onClick={handleAppSettingsUpdate}>
                Save Settings
              </Button>
            </Group>
          </Stack>
        </Card>

        {/* Diary Settings */}
        <Card withBorder>
          <Stack gap="md">
            <Group gap="xs" align="center">
              <IconDatabase size={20} />
              <Title order={4}>Diary Settings</Title>
            </Group>
            
            <Switch
              label="Enable Encryption"
              description="Encrypt diary entries with a separate password"
              checked={diarySettings.encryptionEnabled}
              onChange={(e) => setDiarySettings({ ...diarySettings, encryptionEnabled: e.currentTarget.checked })}
            />

            {diarySettings.encryptionEnabled && (
              <>
                <TextInput
                  label="Password Hint"
                  placeholder="Enter a hint to help you remember your diary password"
                  value={diarySettings.passwordHint}
                  onChange={(e) => setDiarySettings({ ...diarySettings, passwordHint: e.target.value })}
                />

                <Switch
                  label="Auto-lock"
                  description="Automatically lock diary after inactivity"
                  checked={diarySettings.autoLock}
                  onChange={(e) => setDiarySettings({ ...diarySettings, autoLock: e.currentTarget.checked })}
                />

                {diarySettings.autoLock && (
                  <Select
                    label="Lock Timeout"
                    value={diarySettings.lockTimeout.toString()}
                    onChange={(value) => setDiarySettings({ ...diarySettings, lockTimeout: parseInt(value || '30') })}
                    data={[
                      { value: '5', label: '5 minutes' },
                      { value: '15', label: '15 minutes' },
                      { value: '30', label: '30 minutes' },
                      { value: '60', label: '1 hour' }
                    ]}
                  />
                )}
              </>
            )}

            <Group justify="flex-end">
              <Button onClick={handleDiarySettingsUpdate}>
                Save Diary Settings
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>

      {/* Change Password Modal */}
      <Modal
        opened={passwordModalOpened}
        onClose={closePasswordModal}
        title="Change Password"
        centered
      >
        <Stack gap="md">
          <PasswordInput
            label="Current Password"
            value={passwordData.currentPassword}
            onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
            required
          />

          <PasswordInput
            label="New Password"
            value={passwordData.newPassword}
            onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
            required
          />

          <PasswordInput
            label="Confirm New Password"
            value={passwordData.confirmPassword}
            onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
            required
          />

          <Group justify="flex-end">
            <Button variant="light" onClick={closePasswordModal}>
              Cancel
            </Button>
            <Button 
              onClick={handlePasswordChange}
              loading={isLoading}
              disabled={!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}
            >
              Change Password
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
