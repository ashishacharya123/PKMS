export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: Date;
  type: 'note' | 'todo' | 'diary' | 'project' | 'document' | 'archive';
  module: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  tags?: string[];
  isFavorite?: boolean;
  metadata?: {
    [key: string]: any;
    dueDate?: Date;
    completedDate?: Date;
    mood?: number;
    weather?: string;
    location?: string;
  };
  color?: string;
  icon?: string;
}

export interface CalendarViewOptions {
  view: 'month' | 'week' | 'day';
  date: Date;
  filters: {
    types?: string[];
    modules?: string[];
    tags?: string[];
    status?: string[];
    priorities?: string[];
  };
}

export interface CalendarStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsByModule: Record<string, number>;
  completionRate: number;
  upcomingDeadlines: number;
  overdueItems: number;
}

class UnifiedCalendarService {
  private events: CalendarEvent[] = [];

  // Public getter for all events
  public getAllEvents(): CalendarEvent[] {
    return this.events;
  }
  private cacheKey = 'pkms_calendar_events';

  constructor() {
    this.loadFromCache();
  }

  // Add events from different modules
  addNoteEvent(note: any): CalendarEvent {
    const event: CalendarEvent = {
      id: `note-${note.id}`,
      title: note.title || 'Untitled Note',
      description: note.content ? note.content.substring(0, 200) + '...' : '',
      date: new Date(note.createdAt || note.created_at),
      type: 'note',
      module: 'notes',
      tags: note.tags || [],
      isFavorite: note.is_favorite || note.isFavorite,
      color: '#228be6',
      icon: '📝',
      metadata: {
        ...note.metadata
      }
    };

    this.addEvent(event);
    return event;
  }

  addTodoEvent(todo: any): CalendarEvent {
    const event: CalendarEvent = {
      id: `todo-${todo.id}`,
      title: todo.title || 'Untitled Todo',
      description: todo.description || '',
      date: todo.dueDate || todo.due_date ? new Date(todo.dueDate || todo.due_date) : new Date(todo.createdAt || todo.created_at),
      type: 'todo',
      module: 'todos',
      priority: todo.priority || 'medium',
      status: todo.status || 'pending',
      tags: todo.tags || [],
      isFavorite: todo.is_favorite || todo.isFavorite,
      color: this.getPriorityColor(todo.priority || 'medium'),
      icon: '✓',
      metadata: {
        dueDate: todo.dueDate || todo.due_date ? new Date(todo.dueDate || todo.due_date) : undefined,
        completedDate: todo.completedDate || todo.completed_at ? new Date(todo.completedDate || todo.completed_at) : undefined,
        projectId: todo.projectId || todo.project_id
      }
    };

    this.addEvent(event);
    return event;
  }

  addDiaryEvent(diary: any): CalendarEvent {
    const event: CalendarEvent = {
      id: `diary-${diary.id}`,
      title: diary.title || `Diary Entry - ${new Date(diary.date || diary.createdAt).toLocaleDateString()}`,
      description: diary.content ? diary.content.substring(0, 200) + '...' : '',
      date: new Date(diary.date || diary.createdAt || diary.created_at),
      type: 'diary',
      module: 'diary',
      tags: diary.tags || [],
      isFavorite: diary.is_favorite || diary.isFavorite,
      color: '#e64980',
      icon: '📔',
      metadata: {
        mood: diary.mood,
        weather: diary.weather,
        location: diary.location
      }
    };

    this.addEvent(event);
    return event;
  }

  addProjectEvent(project: any): CalendarEvent {
    const event: CalendarEvent = {
      id: `project-${project.id}`,
      title: project.name || 'Untitled Project',
      description: project.description || '',
      date: project.dueDate || project.due_date ? new Date(project.dueDate || project.due_date) : new Date(project.createdAt || project.created_at),
      type: 'project',
      module: 'todos',
      priority: project.priority || 'medium',
      status: project.status || 'active',
      tags: project.tags || [],
      color: this.getPriorityColor(project.priority || 'medium'),
      icon: '🎯',
      metadata: {
        dueDate: project.dueDate || project.due_date ? new Date(project.dueDate || project.due_date) : undefined,
        completedDate: project.completedDate || project.completed_at ? new Date(project.completedDate || project.completed_at) : undefined
      }
    };

    this.addEvent(event);
    return event;
  }

  addDocumentEvent(document: any): CalendarEvent {
    const event: CalendarEvent = {
      id: `document-${document.id}`,
      title: document.title || document.filename || 'Untitled Document',
      description: document.description || '',
      date: new Date(document.createdAt || document.created_at),
      type: 'document',
      module: 'documents',
      tags: document.tags || [],
      color: '#40c057',
      icon: '📄',
      metadata: {
        fileSize: document.file_size,
        mimeType: document.mime_type,
        projectId: document.projectId || document.project_id
      }
    };

    this.addEvent(event);
    return event;
  }

  private addEvent(event: CalendarEvent): void {
    // Remove existing event with same ID
    this.events = this.events.filter(e => e.id !== event.id);
    this.events.push(event);
    this.saveToCache();
  }

  // Get events for a specific date range
  getEvents(startDate: Date, endDate: Date, filters?: CalendarViewOptions['filters']): CalendarEvent[] {
    let filteredEvents = this.events.filter(event => {
      const eventDate = new Date(event.date);
      return eventDate >= startDate && eventDate <= endDate;
    });

    // Apply additional filters
    if (filters) {
      if (filters.types && filters.types.length > 0) {
        filteredEvents = filteredEvents.filter(event => filters.types!.includes(event.type));
      }

      if (filters.modules && filters.modules.length > 0) {
        filteredEvents = filteredEvents.filter(event => filters.modules!.includes(event.module));
      }

      if (filters.tags && filters.tags.length > 0) {
        filteredEvents = filteredEvents.filter(event =>
          event.tags && event.tags.some(tag => filters.tags!.includes(tag))
        );
      }

      if (filters.status && filters.status.length > 0) {
        filteredEvents = filteredEvents.filter(event =>
          event.status && filters.status!.includes(event.status)
        );
      }

      if (filters.priorities && filters.priorities.length > 0) {
        filteredEvents = filteredEvents.filter(event =>
          event.priority && filters.priorities!.includes(event.priority)
        );
      }
    }

    return filteredEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  // Get events for a specific month
  getMonthEvents(date: Date, filters?: CalendarViewOptions['filters']): CalendarEvent[] {
    const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
    const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return this.getEvents(startDate, endDate, filters);
  }

  // Get events for a specific week
  getWeekEvents(date: Date, filters?: CalendarViewOptions['filters']): CalendarEvent[] {
    const startDate = new Date(date);
    startDate.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6); // End of week (Saturday)
    return this.getEvents(startDate, endDate, filters);
  }

  // Get events for a specific day
  getDayEvents(date: Date, filters?: CalendarViewOptions['filters']): CalendarEvent[] {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);
    return this.getEvents(startDate, endDate, filters);
  }

  // Get calendar statistics
  getStats(dateRange?: { start: Date; end: Date }): CalendarStats {
    let eventsToAnalyze = this.events;

    if (dateRange) {
      eventsToAnalyze = this.getEvents(dateRange.start, dateRange.end);
    }

    const eventsByType: Record<string, number> = {};
    const eventsByModule: Record<string, number> = {};
    let completedCount = 0;
    let overdueCount = 0;
    const now = new Date();

    eventsToAnalyze.forEach(event => {
      // Count by type
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      // Count by module
      eventsByModule[event.module] = (eventsByModule[event.module] || 0) + 1;

      // Count completed
      if (event.status === 'completed') {
        completedCount++;
      }

      // Count overdue (for todos and projects with due dates)
      if ((event.type === 'todo' || event.type === 'project') &&
          event.metadata?.dueDate &&
          new Date(event.metadata.dueDate) < now &&
          event.status !== 'completed') {
        overdueCount++;
      }
    });

    const totalEvents = eventsToAnalyze.length;
    const completionRate = totalEvents > 0 ? (completedCount / totalEvents) * 100 : 0;

    // Count upcoming deadlines (next 7 days)
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingDeadlines = eventsToAnalyze.filter(event =>
      (event.type === 'todo' || event.type === 'project') &&
      event.metadata?.dueDate &&
      new Date(event.metadata.dueDate) >= now &&
      new Date(event.metadata.dueDate) <= nextWeek &&
      event.status !== 'completed'
    ).length;

    return {
      totalEvents,
      eventsByType,
      eventsByModule,
      completionRate,
      upcomingDeadlines,
      overdueItems: overdueCount
    };
  }

  // Get upcoming events (next N days)
  getUpcomingEvents(days: number = 7): CalendarEvent[] {
    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return this.events
      .filter(event => {
        const eventDate = new Date(event.date);
        return eventDate >= now && eventDate <= endDate;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  // Get overdue items
  getOverdueItems(): CalendarEvent[] {
    const now = new Date();

    return this.events.filter(event =>
      (event.type === 'todo' || event.type === 'project') &&
      event.metadata?.dueDate &&
      new Date(event.metadata.dueDate) < now &&
      event.status !== 'completed'
    ).sort((a, b) => {
      const aDate = a.metadata?.dueDate ? new Date(a.metadata.dueDate).getTime() : 0;
      const bDate = b.metadata?.dueDate ? new Date(b.metadata.dueDate).getTime() : 0;
      return aDate - bDate;
    });
  }

  // Search events
  searchEvents(query: string): CalendarEvent[] {
    const lowerQuery = query.toLowerCase();

    return this.events.filter(event =>
      event.title.toLowerCase().includes(lowerQuery) ||
      (event.description && event.description.toLowerCase().includes(lowerQuery)) ||
      (event.tags && event.tags.some(tag => tag.toLowerCase().includes(lowerQuery)))
    );
  }

  // Clear all events
  clearEvents(): void {
    this.events = [];
    this.saveToCache();
  }

  // Remove event by ID
  removeEvent(id: string): void {
    this.events = this.events.filter(event => event.id !== id);
    this.saveToCache();
  }

  // Export events to iCal format
  exportToICal(): string {
    const events = this.events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let iCalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//PKMS//Unified Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:PKMS Unified Calendar
X-WR-TIMEZONE:UTC
`;

    events.forEach(event => {
      const startDate = new Date(event.date);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour duration

      iCalContent += `BEGIN:VEVENT
UID:${event.id}
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTSTART:${startDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTEND:${endDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z
SUMMARY:${event.title.replace(/,/g, '\\,')}
DESCRIPTION:${(event.description || '').replace(/,/g, '\\,').replace(/\n/g, '\\n')}
CATEGORIES:${event.type}
END:VEVENT
`;
    });

    iCalContent += `END:VCALENDAR`;
    return iCalContent;
  }

  // Utility methods
  private getPriorityColor(priority: string): string {
    const colorMap: Record<string, string> = {
      low: '#40c057',
      medium: '#fab005',
      high: '#fd7e14',
      urgent: '#fa5252'
    };
    return colorMap[priority] || '#868e96';
  }

  private saveToCache(): void {
    try {
      const cacheData = {
        events: this.events,
        timestamp: Date.now()
      };
      localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Failed to save calendar events to cache:', error);
    }
  }

  private loadFromCache(): void {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (cached) {
        const cacheData = JSON.parse(cached);
        // Convert date strings back to Date objects
        this.events = cacheData.events.map((event: any) => ({
          ...event,
          date: new Date(event.date),
          metadata: event.metadata ? {
            ...event.metadata,
            dueDate: event.metadata.dueDate ? new Date(event.metadata.dueDate) : undefined,
            completedDate: event.metadata.completedDate ? new Date(event.metadata.completedDate) : undefined
          } : undefined
        }));
      }
    } catch (error) {
      console.error('Failed to load calendar events from cache:', error);
    }
  }

  // Clear cache (useful for debugging or when data becomes stale)
  clearCache(): void {
    try {
      localStorage.removeItem(this.cacheKey);
    } catch (error) {
      console.error('Failed to clear calendar cache:', error);
    }
  }
}

// Global instance
export const unifiedCalendar = new UnifiedCalendarService();

// React hook for using the unified calendar
export const useUnifiedCalendar = () => {
  return {
    events: unifiedCalendar.getAllEvents(),
    addNoteEvent: unifiedCalendar.addNoteEvent.bind(unifiedCalendar),
    addTodoEvent: unifiedCalendar.addTodoEvent.bind(unifiedCalendar),
    addDiaryEvent: unifiedCalendar.addDiaryEvent.bind(unifiedCalendar),
    addProjectEvent: unifiedCalendar.addProjectEvent.bind(unifiedCalendar),
    addDocumentEvent: unifiedCalendar.addDocumentEvent.bind(unifiedCalendar),
    getAllEvents: unifiedCalendar.getAllEvents.bind(unifiedCalendar),
    getEvents: unifiedCalendar.getEvents.bind(unifiedCalendar),
    getMonthEvents: unifiedCalendar.getMonthEvents.bind(unifiedCalendar),
    getWeekEvents: unifiedCalendar.getWeekEvents.bind(unifiedCalendar),
    getDayEvents: unifiedCalendar.getDayEvents.bind(unifiedCalendar),
    getStats: unifiedCalendar.getStats.bind(unifiedCalendar),
    getUpcomingEvents: unifiedCalendar.getUpcomingEvents.bind(unifiedCalendar),
    getOverdueItems: unifiedCalendar.getOverdueItems.bind(unifiedCalendar),
    searchEvents: unifiedCalendar.searchEvents.bind(unifiedCalendar),
    removeEvent: unifiedCalendar.removeEvent.bind(unifiedCalendar),
    clearEvents: unifiedCalendar.clearEvents.bind(unifiedCalendar),
    exportToICal: unifiedCalendar.exportToICal.bind(unifiedCalendar),
    clearCache: unifiedCalendar.clearCache.bind(unifiedCalendar)
  };
};

export default unifiedCalendar;