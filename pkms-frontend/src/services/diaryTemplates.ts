export interface DiaryTemplate {
  id: string;
  name: string;
  description: string;
  category: 'daily' | 'weekly' | 'monthly' | 'reflection' | 'goal' | 'custom';
  content: string;
  tags: string[];
  moodDefault?: number;
  weatherDefault?: string;
  questions?: string[];
  sections?: TemplateSection[];
  isDefault?: boolean;
  isFavorite?: boolean;
  usageCount: number;
  lastUsed?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateSection {
  id: string;
  title: string;
  type: 'text' | 'rating' | 'checkbox' | 'select' | 'textarea';
  placeholder?: string;
  required?: boolean;
  options?: string[];
  defaultValue?: string | number | boolean;
}

export interface TemplateVariable {
  name: string;
  type: 'date' | 'time' | 'mood' | 'weather' | 'location' | 'custom';
  defaultValue?: string;
}

class DiaryTemplateService {
  private templates: DiaryTemplate[] = [];
  private cacheKey = 'pkms_diary_templates';

  constructor() {
    this.initializeDefaultTemplates();
    this.loadFromCache();
  }

  private initializeDefaultTemplates(): void {
    const defaultTemplates: DiaryTemplate[] = [
      {
        id: 'daily-reflection',
        name: 'Daily Reflection',
        description: 'A comprehensive daily journal template for self-reflection',
        category: 'daily',
        content: `# Daily Reflection - {{date}}

## Today's Highlights
- What went well today?
- What could have gone better?

## Gratitude
I'm grateful for:
1.
2.
3.

## Goals & Progress
**Today's Goals:**
- [ ] Goal 1
- [ ] Goal 2
- [ ] Goal 3

**Progress Made:**

## Learnings & Insights
What did I learn today?

## Mood & Energy
**Current Mood:** {{mood}}/10
**Energy Level:**

## Tomorrow's Intentions
What do I want to accomplish tomorrow?

## Affirmations
`,
        tags: ['daily', 'reflection', 'gratitude', 'goals'],
        moodDefault: 7,
        questions: [
          'What went well today?',
          'What are you grateful for?',
          'What did you learn?',
          'What are your goals for tomorrow?'
        ],
        isDefault: true,
        usageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'weekly-review',
        name: 'Weekly Review',
        description: 'Review your week and plan for the next one',
        category: 'weekly',
        content: `# Weekly Review - {{week}}

## Week in Review
**Best Moment of the Week:**

**Biggest Challenge:**

**Biggest Accomplishment:**

## Goals & Progress
**Weekly Goals:**
- [ ]
- [ ]
- [ ]

**Completed Goals:**

**Goals in Progress:**

## Lessons Learned
What went well this week?

What could be improved?

## Personal Growth
New skills or insights gained:

Areas for improvement:

## Next Week Planning
**Top 3 Priorities:**
1.
2.
3.

**Habits to focus on:**

## Gratitude
I'm grateful for:
`,
        tags: ['weekly', 'review', 'planning', 'goals'],
        isDefault: true,
        usageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'goal-setting',
        name: 'Goal Setting',
        description: 'Define and plan your personal and professional goals',
        category: 'goal',
        content: `# Goal Setting - {{date}}

## Vision Statement
Where do I want to be in 1 year? 5 years? 10 years?

**1 Year Vision:**

**5 Year Vision:**

**10 Year Vision:**

## SMART Goals
**Specific:**
What exactly do I want to accomplish?

**Measurable:**
How will I track progress and success?

**Achievable:**
Is this goal realistic given my resources?

**Relevant:**
Why is this goal important to me?

**Time-bound:**
What is the deadline?

## Action Steps
**Step 1:**

**Step 2:**

**Step 3:**

## Potential Obstacles
What challenges might I face?

How will I overcome them?

## Support System
Who can help me achieve this goal?

What resources do I need?

## Tracking Progress
How will I measure progress?

Milestones to celebrate:

## Motivation & Commitment
Why is this goal meaningful to me?

On a scale of 1-10, how committed am I?

## Next Actions
What is the very first step I will take?
`,
        tags: ['goals', 'planning', 'personal', 'development'],
        isDefault: true,
        usageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'mindfulness',
        name: 'Mindfulness & Meditation',
        description: 'Track your mindfulness practice and mental state',
        category: 'reflection',
        content: `# Mindfulness Practice - {{date}}

## Meditation Session
**Duration:** minutes
**Type of Practice:**

**Focus/Intention:**

## Experience
**Mood Before (1-10):**

**Mood After (1-10):**

**Quality of Practice:**

## Observations
**Thoughts that arose:**

**Physical sensations:**

**Emotional state:**

## Insights
What did I learn from this practice?

Any new perspectives gained?

## Gratitude
I'm grateful for this moment of peace:

## Intention for Tomorrow
How will I carry this mindfulness forward?

## Notes
`,
        tags: ['mindfulness', 'meditation', 'wellness', 'mental-health'],
        moodDefault: 8,
        isDefault: true,
        usageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'quick-entry',
        name: 'Quick Entry',
        description: 'A simple template for quick daily thoughts',
        category: 'daily',
        content: `# Quick Entry - {{date}}

**Current Mood:** {{mood}}/10
**Weather:** {{weather}}

## Today's Thoughts

## What I'm Grateful For

## Tomorrow's Focus

`,
        tags: ['daily', 'quick', 'simple'],
        moodDefault: 7,
        weatherDefault: 'sunny',
        isDefault: true,
        usageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'emotional-check-in',
        name: 'Emotional Check-in',
        description: 'Track and understand your emotional state',
        category: 'reflection',
        content: `# Emotional Check-in - {{date}}

## Current Emotional State
**Primary Emotion:**

**Intensity (1-10):**

**Physical Sensations:**

## Triggers
What events or thoughts triggered this emotion?

## Thoughts & Beliefs
What stories am I telling myself?

Are these thoughts helpful or accurate?

## Coping Strategies
How am I dealing with this emotion?

What strategies have helped in the past?

## Self-Compassion
What would I tell a friend feeling this way?

How can I be kinder to myself?

## Action Plan
What do I need right now?

What small step can I take?

## Gratitude & Hope
What am I grateful for despite this emotion?

What gives me hope?

`,
        tags: ['emotions', 'mental-health', 'self-awareness', 'wellness'],
        moodDefault: 6,
        isDefault: true,
        usageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    defaultTemplates.forEach(template => {
      this.templates.push(template);
    });
  }

  // Get all templates
  getTemplates(): DiaryTemplate[] {
    return [...this.templates].sort((a, b) => {
      // Sort by favorites first, then by usage count, then by name
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount;
      return a.name.localeCompare(b.name);
    });
  }

  // Get templates by category
  getTemplatesByCategory(category: string): DiaryTemplate[] {
    return this.templates.filter(template => template.category === category);
  }

  // Get a specific template by ID
  getTemplate(id: string): DiaryTemplate | undefined {
    return this.templates.find(template => template.id === id);
  }

  // Create a new template
  createTemplate(template: Omit<DiaryTemplate, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>): DiaryTemplate {
    const newTemplate: DiaryTemplate = {
      ...template,
      id: this.generateId(),
      usageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.templates.push(newTemplate);
    this.saveToCache();
    return newTemplate;
  }

  // Update an existing template
  updateTemplate(id: string, updates: Partial<DiaryTemplate>): DiaryTemplate | null {
    const index = this.templates.findIndex(template => template.id === id);
    if (index === -1) return null;

    this.templates[index] = {
      ...this.templates[index],
      ...updates,
      updatedAt: new Date()
    };

    this.saveToCache();
    return this.templates[index];
  }

  // Delete a template
  deleteTemplate(id: string): boolean {
    const index = this.templates.findIndex(template => template.id === id);
    if (index === -1) return false;

    // Don't delete default templates
    if (this.templates[index].isDefault) {
      return false;
    }

    this.templates.splice(index, 1);
    this.saveToCache();
    return true;
  }

  // Use a template (increment usage count)
  useTemplate(id: string): DiaryTemplate | null {
    const template = this.getTemplate(id);
    if (!template) return null;

    template.usageCount += 1;
    template.lastUsed = new Date();
    template.updatedAt = new Date();

    this.saveToCache();
    return template;
  }

  // Toggle template favorite status
  toggleFavorite(id: string): DiaryTemplate | null {
    const template = this.getTemplate(id);
    if (!template) return null;

    template.isFavorite = !template.isFavorite;
    template.updatedAt = new Date();

    this.saveToCache();
    return template;
  }

  // Process template content with variables
  processTemplate(template: DiaryTemplate, variables: Record<string, string> = {}): string {
    let content = template.content;

    // Replace template variables
    const defaultVariables: Record<string, string> = {
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      mood: (template.moodDefault || 7).toString(),
      weather: template.weatherDefault || 'sunny',
      location: variables.location || '',
      week: this.getWeekNumber(new Date()).toString(),
      month: new Date().toLocaleDateString('en-US', { month: 'long' }),
      year: new Date().getFullYear().toString(),
      ...variables
    };

    // Replace {{variable}} patterns
    Object.entries(defaultVariables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(regex, value);
    });

    return content;
  }

  // Get template categories
  getCategories(): string[] {
    const categories = new Set(this.templates.map(template => template.category));
    return Array.from(categories).sort();
  }

  // Get template usage statistics
  getStats() {
    const totalTemplates = this.templates.length;
    const customTemplates = this.templates.filter(t => !t.isDefault).length;
    const favoriteTemplates = this.templates.filter(t => t.isFavorite).length;
    const totalUsage = this.templates.reduce((sum, t) => sum + t.usageCount, 0);
    const mostUsed = this.templates.reduce((prev, current) =>
      prev.usageCount > current.usageCount ? prev : current
    );

    return {
      totalTemplates,
      customTemplates,
      favoriteTemplates,
      totalUsage,
      mostUsed: mostUsed || null,
      recentlyUsed: this.templates
        .filter(t => t.lastUsed)
        .sort((a, b) => new Date(b.lastUsed!).getTime() - new Date(a.lastUsed!).getTime())
        .slice(0, 5)
    };
  }

  // Search templates
  searchTemplates(query: string): DiaryTemplate[] {
    const lowerQuery = query.toLowerCase();
    return this.templates.filter(template =>
      template.name.toLowerCase().includes(lowerQuery) ||
      template.description.toLowerCase().includes(lowerQuery) ||
      template.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
      template.content.toLowerCase().includes(lowerQuery)
    );
  }

  // Export templates to JSON
  exportTemplates(): string {
    return JSON.stringify(this.templates, null, 2);
  }

  // Import templates from JSON
  importTemplates(jsonData: string): { success: number; errors: string[] } {
    try {
      const importedTemplates = JSON.parse(jsonData);
      const errors: string[] = [];
      let success = 0;

      if (!Array.isArray(importedTemplates)) {
        errors.push('Invalid data format: expected array');
        return { success: 0, errors };
      }

      importedTemplates.forEach((template, index) => {
        try {
          // Validate required fields
          if (!template.name || !template.content) {
            errors.push(`Template ${index + 1}: Missing required fields`);
            return;
          }

          // Check for duplicate IDs
          if (this.templates.some(t => t.id === template.id)) {
            // Generate new ID for imported template
            template.id = this.generateId();
          }

          // Ensure required fields
          const processedTemplate: DiaryTemplate = {
            id: template.id || this.generateId(),
            name: template.name,
            description: template.description || '',
            category: template.category || 'custom',
            content: template.content,
            tags: template.tags || [],
            moodDefault: template.moodDefault,
            weatherDefault: template.weatherDefault,
            questions: template.questions || [],
            sections: template.sections || [],
            isDefault: false, // Imported templates are never default
            isFavorite: template.isFavorite || false,
            usageCount: 0,
            lastUsed: undefined,
            createdAt: template.createdAt ? new Date(template.createdAt) : new Date(),
            updatedAt: new Date()
          };

          this.templates.push(processedTemplate);
          success++;
        } catch (error) {
          errors.push(`Template ${index + 1}: ${error}`);
        }
      });

      this.saveToCache();
      return { success, errors };
    } catch (error) {
      return { success: 0, errors: [`Invalid JSON: ${error}`] };
    }
  }

  // Utility methods
  private generateId(): string {
    return `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  private saveToCache(): void {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(this.templates));
    } catch (error) {
      console.error('Failed to save diary templates to cache:', error);
    }
  }

  private loadFromCache(): void {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (cached) {
        const parsedTemplates = JSON.parse(cached);
        // Convert date strings back to Date objects
        this.templates = parsedTemplates.map((template: any) => ({
          ...template,
          createdAt: new Date(template.createdAt),
          updatedAt: new Date(template.updatedAt),
          lastUsed: template.lastUsed ? new Date(template.lastUsed) : undefined
        }));

        // Merge with default templates (avoid duplicates)
        const defaultIds = this.templates.filter(t => t.isDefault).map(t => t.id);
        this.initializeDefaultTemplates();
        this.templates = this.templates.filter(t => !defaultIds.includes(t.id)).concat(this.templates);
      }
    } catch (error) {
      console.error('Failed to load diary templates from cache:', error);
    }
  }

  // Clear cache
  clearCache(): void {
    try {
      localStorage.removeItem(this.cacheKey);
    } catch (error) {
      console.error('Failed to clear diary templates cache:', error);
    }
  }

  // Reset to default templates
  resetToDefaults(): void {
    this.templates = [];
    this.initializeDefaultTemplates();
    this.saveToCache();
  }
}

// Global instance
export const diaryTemplates = new DiaryTemplateService();

// React hook for using diary templates
export const useDiaryTemplates = () => {
  return {
    templates: diaryTemplates.getTemplates(),
    getTemplates: diaryTemplates.getTemplates.bind(diaryTemplates),
    getTemplatesByCategory: diaryTemplates.getTemplatesByCategory.bind(diaryTemplates),
    getTemplate: diaryTemplates.getTemplate.bind(diaryTemplates),
    createTemplate: diaryTemplates.createTemplate.bind(diaryTemplates),
    updateTemplate: diaryTemplates.updateTemplate.bind(diaryTemplates),
    deleteTemplate: diaryTemplates.deleteTemplate.bind(diaryTemplates),
    useTemplate: diaryTemplates.useTemplate.bind(diaryTemplates),
    toggleFavorite: diaryTemplates.toggleFavorite.bind(diaryTemplates),
    processTemplate: diaryTemplates.processTemplate.bind(diaryTemplates),
    getCategories: diaryTemplates.getCategories.bind(diaryTemplates),
    getStats: diaryTemplates.getStats.bind(diaryTemplates),
    searchTemplates: diaryTemplates.searchTemplates.bind(diaryTemplates),
    exportTemplates: diaryTemplates.exportTemplates.bind(diaryTemplates),
    importTemplates: diaryTemplates.importTemplates.bind(diaryTemplates),
    clearCache: diaryTemplates.clearCache.bind(diaryTemplates),
    resetToDefaults: diaryTemplates.resetToDefaults.bind(diaryTemplates)
  };
};

export default diaryTemplates;