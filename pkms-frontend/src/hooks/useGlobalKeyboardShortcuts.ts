import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { notifications } from '@mantine/notifications';

/**
 * Global keyboard shortcuts that work across all modules
 */
export function useGlobalKeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
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

      const isCtrl = event.ctrlKey || event.metaKey;
      const isShift = event.shiftKey;
      const key = event.key.toLowerCase();

      // Global navigation shortcuts
      if (isCtrl && !isShift) {
        switch (key) {
          case 'f':
            // Focus existing search input or open dedicated FTS5 search page
            event.preventDefault();
            const searchInput = document.querySelector('input[placeholder*="Search"], input[placeholder*="search"]') as HTMLInputElement;
            if (searchInput) {
              searchInput.focus();
              searchInput.select();
              notifications.show({
                title: 'Search Focused',
                message: 'Use current search box (FTS5 mode)',
                color: 'green',
                autoClose: 1500,
              });
            } else {
              // No search box on current page, go to dedicated FTS5 search
              navigate('/search/fts5');
              notifications.show({
                title: 'FTS5 Search',
                message: 'Opening fast full-text search page',
                color: 'green',
                autoClose: 2000,
              });
            }
            break;

          case '1':
            event.preventDefault();
            navigate('/dashboard');
            break;

          case '2':
            event.preventDefault();
            navigate('/notes');
            break;

          case '3':
            event.preventDefault();
            navigate('/diary');
            break;

          case '4':
            event.preventDefault();
            navigate('/documents');
            break;

          case '5':
            event.preventDefault();
            navigate('/todos');
            break;

          case '6':
            event.preventDefault();
            navigate('/archive');
            break;

          case 'h':
          case '?':
            event.preventDefault();
            showGlobalShortcutsHelp();
            break;
        }
      }

      // Fuzzy search with Ctrl+Shift+F
      if (isCtrl && isShift && key === 'f') {
        event.preventDefault();
        // Go to dedicated fuzzy search page
        navigate('/search/fuzzy');
        notifications.show({
          title: 'Fuzzy Search',
          message: 'Opening flexible fuzzy search with typo tolerance',
          color: 'purple',
          autoClose: 2000,
        });
      }

      // Quick module creation shortcuts with Ctrl+Shift
      if (isCtrl && isShift) {
        switch (key) {
          case 'n':
            event.preventDefault();
            navigate('/notes/new');
            break;

          case 'd':
            event.preventDefault();
            navigate('/diary');
            // Trigger new diary entry if on diary page
            setTimeout(() => {
              const newEntryButton = document.querySelector('button[aria-label*="Create new diary entry"]') as HTMLButtonElement;
              if (newEntryButton) {
                newEntryButton.click();
              }
            }, 100);
            break;

          case 't':
            event.preventDefault();
            navigate('/todos');
            // Trigger new todo if on todos page
            setTimeout(() => {
              const newTodoButton = document.querySelector('button[aria-label*="Add"], button[aria-label*="Create"]') as HTMLButtonElement;
              if (newTodoButton) {
                newTodoButton.click();
              }
            }, 100);
            break;
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [navigate]);

  const showGlobalShortcutsHelp = () => {
    const shortcuts = [
      'Navigation:',
      'Ctrl+1: Dashboard',
      'Ctrl+2: Notes',
      'Ctrl+3: Diary',
      'Ctrl+4: Documents',
      'Ctrl+5: Todos',
      'Ctrl+6: Archive',
      '',
      'Search:',
      'Ctrl+F: Focus current search box or open FTS5 Search Page',
      'Ctrl+Shift+F: Open Fuzzy Search Page (typo-tolerant)',
      '',
      'Quick Create:',
      'Ctrl+Shift+N: New note',
      'Ctrl+Shift+D: New diary entry',
      'Ctrl+Shift+T: New todo',
      '',
      'Help:',
      'Ctrl+H or Ctrl+?: Show this help',
    ].join('\n');

    notifications.show({
      title: 'Global Keyboard Shortcuts',
      message: shortcuts,
      color: 'blue',
      autoClose: false,
      withCloseButton: true,
      style: { 
        maxWidth: '400px',
        whiteSpace: 'pre-line',
        fontFamily: 'monospace',
        fontSize: '12px'
      },
    });
  };

  return { showGlobalShortcutsHelp };
}
