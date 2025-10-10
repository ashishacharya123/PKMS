interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  description: string;
  category: string;
  action: () => void;
  global?: boolean;
}

interface KeyboardShortcut {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  description: string;
  category: string;
  global: boolean;
}

class KeyboardShortcutService {
  private shortcuts: Map<string, ShortcutConfig> = new Map();
  private enabled: boolean = true;
  private helpOpen: boolean = false;

  constructor() {
    this.setupGlobalShortcuts();
    this.setupHelpListener();
  }

  registerShortcut(config: ShortcutConfig): void {
    const key = this.generateKey(config);
    this.shortcuts.set(key, config);
  }

  unregisterShortcut(key: string, ctrl: boolean = false, alt: boolean = false, shift: boolean = false, meta: boolean = false): void {
    const configKey = this.generateKey({ key, ctrl, alt, shift, meta });
    this.shortcuts.delete(configKey);
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  private generateKey(config: Omit<ShortcutConfig, 'action' | 'description' | 'category'>): string {
    return `${config.ctrl ? 'Ctrl+' : ''}${config.alt ? 'Alt+' : ''}${config.shift ? 'Shift+' : ''}${config.meta ? 'Meta+' : ''}${config.key}`.toUpperCase();
  }

  private setupGlobalShortcuts(): void {
    // Help shortcut
    this.registerShortcut({
      key: '?',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      description: 'Show keyboard shortcuts help',
      category: 'Global',
      action: () => this.toggleHelp(),
      global: true
    });

    // Focus search shortcut (Ctrl+F)
    this.registerShortcut({
      key: 'f',
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      description: 'Focus search input',
      category: 'Search',
      action: () => this.focusSearch(),
      global: true
    });

    // Global search shortcut (Ctrl+K)
    this.registerShortcut({
      key: 'k',
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      description: 'Open global search',
      category: 'Search',
      action: () => this.openGlobalSearch(),
      global: true
    });

    // New note shortcut (Ctrl+N)
    this.registerShortcut({
      key: 'n',
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      description: 'Create new note',
      category: 'Notes',
      action: () => this.createNewNote(),
      global: true
    });

    // New todo shortcut (Ctrl+T)
    this.registerShortcut({
      key: 't',
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      description: 'Create new todo',
      category: 'Todos',
      action: () => this.createNewTodo(),
      global: true
    });

    // New diary entry shortcut (Ctrl+D)
    this.registerShortcut({
      key: 'd',
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      description: 'Create new diary entry',
      category: 'Diary',
      action: () => this.createNewDiaryEntry(),
      global: true
    });
  }

  private setupHelpListener(): void {
    document.addEventListener('keydown', (event) => {
      if (!this.enabled) return;

      // Check if we're typing in an input field
      if (event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement ||
          (event.target as HTMLElement).isContentEditable) {
        return;
      }

      const config = this.getMatchingShortcut(event);
      if (config) {
        event.preventDefault();
        event.stopPropagation();
        config.action();
      }
    });
  }

  private getMatchingShortcut(event: KeyboardEvent): ShortcutConfig | null {
    const configKey = this.generateKey({
      key: event.key.toLowerCase(),
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey
    });

    return this.shortcuts.get(configKey) || null;
  }

  public showHelp(): void {
    this.helpOpen = true;
    this.showHelpModal();
  }

  private toggleHelp(): void {
    this.helpOpen = !this.helpOpen;
    if (this.helpOpen) {
      this.showHelpModal();
    } else {
      this.hideHelpModal();
    }
  }

  private showHelpModal(): void {
    // Create and show help modal
    const modal = document.createElement('div');
    modal.id = 'keyboard-shortcuts-help';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      padding: 2rem;
      border-radius: 8px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    `;

    const shortcutsByCategory = this.getShortcutsByCategory();

    let html = '<h2 style="margin-top: 0;">Keyboard Shortcuts</h2>';

    for (const [category, shortcuts] of Object.entries(shortcutsByCategory)) {
      html += `<h3 style="margin-bottom: 0.5rem; color: #666;">${category}</h3>`;
      html += '<table style="width: 100%; margin-bottom: 1rem;">';

      shortcuts.forEach(shortcut => {
        html += `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 0.5rem; font-family: monospace; background: #f5f5f5; border-radius: 4px; text-align: center;">
              ${this.formatShortcut(shortcut)}
            </td>
            <td style="padding: 0.5rem 0.5rem 0.5rem 1rem;">${shortcut.description}</td>
          </tr>
        `;
      });

      html += '</table>';
    }

    html += `
      <div style="text-align: center; margin-top: 1rem;">
        <button onclick="document.getElementById('keyboard-shortcuts-help')?.remove()"
                style="padding: 0.5rem 1rem; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Close (ESC)
        </button>
      </div>
    `;

    content.innerHTML = html;
    modal.appendChild(content);
    document.body.appendChild(modal);

    // Close on ESC
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', closeOnEscape);
      }
    };
    document.addEventListener('keydown', closeOnEscape);

    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
        document.removeEventListener('keydown', closeOnEscape);
      }
    });
  }

  private hideHelpModal(): void {
    const modal = document.getElementById('keyboard-shortcuts-help');
    if (modal) {
      modal.remove();
    }
  }

  private getShortcutsByCategory(): Record<string, KeyboardShortcut[]> {
    const categories: Record<string, KeyboardShortcut[]> = {};

    this.shortcuts.forEach(config => {
      const shortcut: KeyboardShortcut = {
        key: config.key,
        ctrl: config.ctrl || false,
        alt: config.alt || false,
        shift: config.shift || false,
        meta: config.meta || false,
        description: config.description,
        category: config.category,
        global: config.global || false
      };

      if (!categories[config.category]) {
        categories[config.category] = [];
      }
      categories[config.category].push(shortcut);
    });

    return categories;
  }

  private formatShortcut(shortcut: KeyboardShortcut): string {
    const parts = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.alt) parts.push('Alt');
    if (shortcut.shift) parts.push('Shift');
    if (shortcut.meta) parts.push('⌘');
    parts.push(shortcut.key.toUpperCase());
    return parts.join(' + ');
  }

  // Action implementations
  private focusSearch(): void {
    const searchInput = document.querySelector('input[placeholder*="Search"], input[placeholder*="search"]') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }

  private openGlobalSearch(): void {
    // Navigate to search page or open search modal
    if (window.location.pathname !== '/search/unified') {
      window.location.href = '/search/unified';
    } else {
      this.focusSearch();
    }
  }

  private createNewNote(): void {
    if (window.location.pathname !== '/notes') {
      window.location.href = '/notes/new';
    } else {
      // Trigger new note creation if on notes page
      const newNoteButton = document.querySelector('button[aria-label*="New"], button:contains("New Note")') as HTMLButtonElement;
      if (newNoteButton) {
        newNoteButton.click();
      }
    }
  }

  private createNewTodo(): void {
    if (window.location.pathname !== '/todos') {
      window.location.href = '/todos/new';
    } else {
      // Trigger new todo creation if on todos page
      const newTodoButton = document.querySelector('button[aria-label*="New"], button:contains("New Todo")') as HTMLButtonElement;
      if (newTodoButton) {
        newTodoButton.click();
      }
    }
  }

  private createNewDiaryEntry(): void {
    if (window.location.pathname !== '/diary') {
      window.location.href = '/diary/new';
    } else {
      // Trigger new diary entry creation if on diary page
      const newDiaryButton = document.querySelector('button[aria-label*="New"], button:contains("New Entry")') as HTMLButtonElement;
      if (newDiaryButton) {
        newDiaryButton.click();
      }
    }
  }

  // Public methods for other components to register shortcuts
  registerComponentShortcuts(shortcuts: ShortcutConfig[]): void {
    shortcuts.forEach(config => {
      this.registerShortcut(config);
    });
  }

  getShortcutsList(): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values()).map(config => ({
      key: config.key,
      ctrl: config.ctrl || false,
      alt: config.alt || false,
      shift: config.shift || false,
      meta: config.meta || false,
      description: config.description,
      category: config.category,
      global: config.global || false
    }));
  }
}

// Global instance
export const keyboardShortcuts = new KeyboardShortcutService();

// React hook for using keyboard shortcuts
export const useKeyboardShortcuts = () => {
  return {
    registerShortcut: keyboardShortcuts.registerShortcut.bind(keyboardShortcuts),
    unregisterShortcut: keyboardShortcuts.unregisterShortcut.bind(keyboardShortcuts),
    enable: keyboardShortcuts.enable.bind(keyboardShortcuts),
    disable: keyboardShortcuts.disable.bind(keyboardShortcuts),
    getShortcutsList: keyboardShortcuts.getShortcutsList.bind(keyboardShortcuts),
    showHelp: keyboardShortcuts.showHelp.bind(keyboardShortcuts)
  };
};

export default keyboardShortcuts;