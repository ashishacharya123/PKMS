import { useEffect, useCallback } from 'react';
import { notifications } from '@mantine/notifications';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
  category?: string;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
  showNotifications?: boolean;
}

export function useKeyboardShortcuts({ 
  shortcuts, 
  enabled = true, 
  showNotifications = false 
}: UseKeyboardShortcutsOptions) {
  
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;
    
    // Don't trigger shortcuts when typing in input fields
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.contentEditable === 'true' ||
      target.closest('[contenteditable="true"]')
    ) {
      return;
    }

    for (const shortcut of shortcuts) {
      const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
      const ctrlMatches = !!shortcut.ctrl === (event.ctrlKey || event.metaKey);
      const shiftMatches = !!shortcut.shift === event.shiftKey;
      const altMatches = !!shortcut.alt === event.altKey;

      if (keyMatches && ctrlMatches && shiftMatches && altMatches) {
        event.preventDefault();
        event.stopPropagation();
        
        try {
          shortcut.action();
          
          if (showNotifications) {
            notifications.show({
              title: 'Keyboard Shortcut',
              message: shortcut.description,
              color: 'blue',
              autoClose: 2000,
            });
          }
        } catch (error) {
          console.error('Error executing keyboard shortcut:', error);
        }
        
        break;
      }
    }
  }, [shortcuts, enabled, showNotifications]);

  useEffect(() => {
    if (!enabled) return;
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);

  // Helper function to format shortcut display
  const formatShortcut = useCallback((shortcut: KeyboardShortcut): string => {
    const parts = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.shift) parts.push('Shift');
    if (shortcut.alt) parts.push('Alt');
    parts.push(shortcut.key.toUpperCase());
    return parts.join(' + ');
  }, []);

  // Helper function to show shortcuts help
  const showShortcutsHelp = useCallback(() => {
    const shortcutsByCategory = shortcuts.reduce((acc, shortcut) => {
      const category = shortcut.category || 'General';
      if (!acc[category]) acc[category] = [];
      acc[category].push(shortcut);
      return acc;
    }, {} as Record<string, KeyboardShortcut[]>);

    const helpText = Object.entries(shortcutsByCategory)
      .map(([category, categoryShortcuts]) => {
        const shortcuts = categoryShortcuts
          .map(s => `${formatShortcut(s)}: ${s.description}`)
          .join('\n');
        return `${category}:\n${shortcuts}`;
      })
      .join('\n\n');

    notifications.show({
      title: 'Keyboard Shortcuts',
      message: helpText,
      color: 'blue',
      autoClose: false,
      withCloseButton: true,
    });
  }, [shortcuts, formatShortcut]);

  return {
    formatShortcut,
    showShortcutsHelp,
  };
}
