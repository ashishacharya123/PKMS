import { AppShell, Group, Burger, Text, Box, Switch, ThemeIcon, useMantineColorScheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconMoon, IconSun } from '@tabler/icons-react';
import { Navigation } from './Navigation';
import { useDateTime } from '../../hooks/useDateTime';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [navbarCollapsed, { toggle: toggleNavbar }] = useDisclosure(false);
  const { formattedTime, formattedDate, nepaliDateFormatted, nepaliDay, isLoading: dateLoading } = useDateTime();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  return (
    <AppShell
      navbar={{
        width: navbarCollapsed ? 80 : 260,
        breakpoint: 'sm',
        collapsed: { mobile: !navbarCollapsed },
      }}
      header={{ height: 50 }}
      padding="md"
    >
      <AppShell.Header>
        <Box
          style={{
            height: '90%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: '20px',
            paddingLeft: '16px',
            borderBottom: `1px solid ${
              colorScheme === 'dark' ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-3)'
            }`,
            backgroundColor: 'transparent',
          }}
        >
          {!dateLoading && (
            <Group gap="lg" wrap="nowrap">
              {/* English Date */}
              <Box
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--mantine-radius-md)',
                  backgroundColor: 'var(--mantine-color-grape-light)',
                  border: '1px solid var(--mantine-color-grape-filled)',
                }}
              >
                <Text size="sm" fw={500} c="grape">
                  {formattedDate}
                </Text>
              </Box>

              {/* Nepali Date */}
              <Box
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--mantine-radius-md)',
                  backgroundColor: 'var(--mantine-color-blue-light)',
                  border: '1px solid var(--mantine-color-blue-filled)',
                }}
              >
                <Text 
                  size="sm" 
                  fw={500}
                  c="blue"
                  style={{ 
                    fontFamily: 'Noto Sans Devanagari, system-ui, sans-serif',
                    direction: 'ltr'
                  }}
                >
                  {nepaliDateFormatted}
                </Text>
              </Box>

              {/* English Day */}
              <Box
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--mantine-radius-md)',
                  backgroundColor: 'var(--mantine-color-grape-light)',
                  border: '1px solid var(--mantine-color-grape-filled)',
                }}
              >
                <Text size="sm" fw={500} c="grape">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}
                </Text>
              </Box>

              {/* Nepali Day */}
              <Box
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--mantine-radius-md)',
                  backgroundColor: 'var(--mantine-color-blue-light)',
                  border: '1px solid var(--mantine-color-blue-filled)',
                }}
              >
                <Text 
                  size="sm" 
                  fw={500}
                  c="blue"
                  style={{ 
                    fontFamily: 'Noto Sans Devanagari, system-ui, sans-serif',
                    direction: 'ltr'
                  }}
                >
                  {nepaliDay}
                </Text>
              </Box>

              {/* Time */}
              <Box
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--mantine-radius-md)',
                  backgroundColor: 'var(--mantine-color-grape-light)',
                  border: '1px solid var(--mantine-color-grape-filled)',
                }}
              >
                <Text size="sm" fw={600} c="grape">
                  {formattedTime}
                </Text>
              </Box>

              {/* LIVE Indicator */}
              <Box
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: '#4CAF50',
                  padding: '6px 10px',
                  borderRadius: 'var(--mantine-radius-md)',
                  boxShadow: 'var(--mantine-shadow-sm)',
                  border: '1px solid #45a049',
                }}
              >
                <div 
                  style={{
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    backgroundColor: '#fff',
                    animation: 'pulse 2s infinite'
                  }}
                />
                <Text size="xs" c="white" fw={600}>
                  LIVE
                </Text>
              </Box>

              {/* Dark Mode Switch */}
              <Box
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  borderRadius: 'var(--mantine-radius-md)',
                  backgroundColor: colorScheme === 'dark' 
                    ? 'var(--mantine-color-dark-6)' 
                    : 'var(--mantine-color-gray-0)',
                  border: `1px solid ${
                    colorScheme === 'dark' ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-3)'
                  }`,
                }}
              >
                <ThemeIcon 
                  variant="light" 
                  color={colorScheme === 'dark' ? 'yellow' : 'orange'} 
                  size="sm"
                >
                  {colorScheme === 'dark' ? <IconMoon size={12} /> : <IconSun size={12} />}
                </ThemeIcon>
                <Switch
                  checked={colorScheme === 'dark'}
                  onChange={() => toggleColorScheme()}
                  size="xs"
                />
              </Box>
            </Group>
          )}
        </Box>
      </AppShell.Header>
      
      <AppShell.Navbar>
        <Navigation collapsed={navbarCollapsed} onToggle={toggleNavbar} />
      </AppShell.Navbar>
      
      <AppShell.Main>
        <Group mb="md" style={{ display: 'none' }}>
          <Burger
            opened={!navbarCollapsed}
            onClick={toggleNavbar}
            hiddenFrom="sm"
            size="sm"
          />
        </Group>
        {children}
      </AppShell.Main>
    </AppShell>
  );
} 