/**
 * Template Service
 * 
 * Simple service for loading templates from existing list endpoints.
 * No caching needed - local database/file access is fast.
 */

import { apiService } from './apiService';

export interface TemplateItem {
  uuid: string;
  title: string;
  date: string;
  isTemplate: boolean;
  fromTemplateId?: string;
}

class TemplateService {
  /**
   * Load templates for a specific module
   */
  async loadTemplates(module: string, search?: string): Promise<TemplateItem[]> {
    try {
      let endpoint = '';
      let params: any = { is_template: true, limit: 50 };
      
      if (search) {
        params.search = search;
      }
      
      switch (module) {
        case 'notes':
          endpoint = '/notes';
          break;
        case 'diary':
          endpoint = '/diary/entries';
          break;
        case 'projects':
          endpoint = '/projects';
          break;
        default:
          throw new Error(`Templates not supported for module: ${module}`);
      }
      
      const response = await apiService.get(endpoint, { params });
      
      return response.map((item: any) => ({
        uuid: item.uuid,
        title: item.title,
        date: item.date || item.createdAt,
        isTemplate: item.isTemplate || item.is_template || false,
        fromTemplateId: item.fromTemplateId || item.from_template_id
      }));
      
    } catch (error) {
      console.error(`Failed to load templates for ${module}:`, error);
      return [];
    }
  }
  
  /**
   * Load entries created from a specific template
   */
  async loadEntriesFromTemplate(module: string, templateUuid: string): Promise<TemplateItem[]> {
    try {
      let endpoint = '';
      let params: any = { template_uuid: templateUuid, limit: 100 };
      
      switch (module) {
        case 'notes':
          endpoint = '/notes';
          break;
        case 'diary':
          endpoint = '/diary/entries';
          break;
        default:
          throw new Error(`Template filtering not supported for module: ${module}`);
      }
      
      const response = await apiService.get(endpoint, { params });
      
      return response.map((item: any) => ({
        uuid: item.uuid,
        title: item.title,
        date: item.date || item.createdAt,
        isTemplate: item.isTemplate || item.is_template || false,
        fromTemplateId: item.fromTemplateId || item.from_template_id
      }));
      
    } catch (error) {
      console.error(`Failed to load entries from template ${templateUuid}:`, error);
      return [];
    }
  }
}

export const templateService = new TemplateService();
