import { AppShell, Group, Burger } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Navigation } from './Navigation';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [navbarCollapsed, { toggle: toggleNavbar }] = useDisclosure(false);

  return (
    <AppShell
      navbar={{
        width: navbarCollapsed ? 80 : 280,
        breakpoint: 'sm',
        collapsed: { mobile: !navbarCollapsed },
      }}
      padding="md"
    >
      <Navigation collapsed={navbarCollapsed} onToggle={toggleNavbar} />
      
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