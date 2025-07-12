/**
 * Enhanced Testing Interface Component for PKMS
 * 
 * Provides comprehensive testing capabilities including:
 * - Authentication testing with detailed logs
 * - Database diagnostics with grouped table schemas
 * - Diary encryption testing with verbose output
 * - Console commands for debugging
 * - System health checks with detailed metrics
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Tabs,
  Text,
  Card,
  Badge,
  Group,
  Stack,
  Code,
  Alert,
  LoadingOverlay,
  ScrollArea,
  Divider,
  ActionIcon,
  Tooltip,
  Select,
  TextInput,
  NumberInput,
  Table,
  Accordion,
  PasswordInput,
  Textarea,
  JsonInput,
  Title,
  Paper,
  Container,
  Collapse,
  CopyButton,
  Timeline,
  ThemeIcon,
  Box,
  SimpleGrid,
  Progress,
  Notification,
  List,
  Chip,
  Drawer
} from '@mantine/core';
import {
  IconBug,
  IconX,
  IconCheck,
  IconAlertTriangle,
  IconRefresh,
  IconTrash,
  IconCopy,
  IconDownload,
  IconDatabase,
  IconTable,
  IconLock,
  IconTerminal,
  IconClipboard,
  IconChevronDown,
  IconChevronUp,
  IconPlayerPlay,
  IconShield,
  IconServer,
  IconSettings,
  IconEye,
  IconFileText,
  IconUsers,
  IconCalendar,
  IconArchive,
  IconChecklist,
  IconNote,
  IconFolder,
  IconSearch,
  IconTag,
  IconKey,
  IconClockRecord,
  IconDeviceAnalytics,
  IconLogout,
  IconLogin,
  IconFile
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { 
  testingService, 
  DatabaseStats, 
  SampleRowsResponse, 
  TableSchema, 
  DiaryEncryptionTest, 
  DetailedHealth, 
  ConsoleCommands,
  AllTablesResponse,
  PerformanceMetrics,
  DataIntegrityValidation,
  ResourceUsage
} from '../../services/testingService';
import { API_BASE_URL } from '../../config';

interface TestingInterfaceProps {
  opened: boolean;
  onClose: () => void;
}

interface AuthLogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  details?: any;
}

interface TableGroup {
  name: string;
  icon: React.ReactNode;
  color: string;
  tables: string[];
  description: string;
}

export function TestingInterface({ opened, onClose }: TestingInterfaceProps) {
  // State management
  const [activeTab, setActiveTab] = useState<string>('auth');
  const [isLoading, setIsLoading] = useState(false);
  const [isRunningAuthTests, setIsRunningAuthTests] = useState(false);
  
  // Authentication testing state
  const [authResults, setAuthResults] = useState<any>(null);
  const [authLogs, setAuthLogs] = useState<AuthLogEntry[]>([]);
  
  // Database testing state
  const [databaseStats, setDatabaseStats] = useState<DatabaseStats | null>(null);
  const [sampleRows, setSampleRows] = useState<any>(null);
  const [tableSchema, setTableSchema] = useState<any>(null);
  const [allTableSchemas, setAllTableSchemas] = useState<any>({});
  const [selectedTableGroup, setSelectedTableGroup] = useState<string>('content');
  const [selectedTable, setSelectedTable] = useState<string>('notes');
  const [rowLimit, setRowLimit] = useState<number>(5);
  const [schemaDrawerOpen, setSchemaDrawerOpen] = useState(false);
  const [allTablesData, setAllTablesData] = useState<any>(null);
  const [allTablesModalOpen, setAllTablesModalOpen] = useState(false);
  const [allTablesExpanded, setAllTablesExpanded] = useState(false);
  
  // FTS5 tables state
  const [ftsTablesData, setFtsTablesData] = useState<any>(null);
  const [selectedFtsTable, setSelectedFtsTable] = useState<string>('');
  const [ftsModalOpen, setFtsModalOpen] = useState(false);
  const [ftsTableSamples, setFtsTableSamples] = useState<any>(null);
  
  // Diary testing state
  const [diaryPassword, setDiaryPassword] = useState('');
  const [diaryTestResult, setDiaryTestResult] = useState<any>(null);
  const [diaryLogs, setDiaryLogs] = useState<AuthLogEntry[]>([]);
  
  // System health state
  const [healthData, setHealthData] = useState<any>(null);
  
  // Console commands state
  const [consoleCommands, setConsoleCommands] = useState<any>(null);
  
  // Advanced testing state
  const [performanceMetrics, setPerformanceMetrics] = useState<any>(null);
  const [dataIntegrityResults, setDataIntegrityResults] = useState<any>(null);
  const [resourceUsage, setResourceUsage] = useState<any>(null);
  const [fileSanityResult, setFileSanityResult] = useState<any>(null);
  const [crudTestResult, setCrudTestResult] = useState<any>(null);

  // Enhanced file system testing state
  const [fileSanityOptions, setFileSanityOptions] = useState({
    filename: 'pkms_test_file.txt',
    verbose: true
  });
  
  // Enhanced CRUD testing state
  const [crudTestOptions, setCrudTestOptions] = useState({
    modules: 'notes,documents,todos,archive',
    cleanup: true,
    verbose: true
  });
  
  // Individual CRUD operation results
  const [individualCrudResults, setIndividualCrudResults] = useState<any>({});

  // Collapsible sections state
  const [fileSystemExpanded, setFileSystemExpanded] = useState(false);
  const [crudTestingExpanded, setCrudTestingExpanded] = useState(false);
  const [systemHealthExpanded, setSystemHealthExpanded] = useState(false);

  // Table groups configuration - Enhanced with FTS5 support
  const tableGroups: TableGroup[] = [
    {
      name: 'Core System',
      icon: <IconUsers size={16} />,
      color: 'blue',
      tables: ['users', 'sessions', 'recovery_keys'],
      description: 'User management and authentication tables'
    },
    {
      name: 'Content Modules',
      icon: <IconNote size={16} />,
      color: 'green',
      tables: ['notes', 'documents', 'todos', 'projects'],
      description: 'Main content and task management'
    },
    {
      name: 'Diary & Privacy',
      icon: <IconLock size={16} />,
      color: 'orange',
      tables: ['diary_entries', 'diary_media'],
      description: 'Encrypted diary system'
    },
    {
      name: 'Archive System',
      icon: <IconArchive size={16} />,
      color: 'purple',
      tables: ['archive_folders', 'archive_items'],
      description: 'Hierarchical file organization'
    },
    {
      name: 'Organization',
      icon: <IconTag size={16} />,
      color: 'cyan',
      tables: ['tags', 'links', 'note_tags', 'document_tags', 'todo_tags', 'archive_tags'],
      description: 'Tags and cross-references'
    },
    {
      name: 'Full-Text Search (FTS5)',
      icon: <IconSearch size={16} />,
      color: 'yellow',
      tables: ['fts_notes', 'fts_documents', 'fts_archive'],
      description: 'SQLite FTS5 search indexes (view grouped by module)'
    }
  ];

  // Get table group select data
  const getTableGroupSelectData = () => {
    // Mantine Select treats objects that contain a `group` key as optgroup definitions
    // which must also include an `items` array. Passing `group` without `items` causes
    // runtime errors (`item.items.map is not a function`).
    // We therefore expose only `value` and `label` here and embed description in the label.
    return tableGroups.map((group) => ({
      value: group.name.toLowerCase().replace(/\s+/g, '_'),
      label: `${group.name} – ${group.description}`
    }));
  };

  // Get tables for selected group
  const getTablesForGroup = (groupKey: string) => {
    const group = tableGroups.find(g => 
      g.name.toLowerCase().replace(/\s+/g, '_') === groupKey
    );
    return group ? group.tables.map(table => ({ 
      value: table, 
      label: table 
    })) : [];
  };

  // Load initial data when modal opens
  useEffect(() => {
    if (opened) {
      loadInitialData();
    }
  }, [opened]);

  const loadInitialData = async () => {
    try {
      // Set some initial safe values
      setSelectedTableGroup('core_system');
      setSelectedTable('users');
      
      // Try to load commands if available
      try {
        const commands = await testingService.getConsoleCommands();
        setConsoleCommands(commands);
      } catch (error) {
        console.warn('Could not load console commands:', error);
        // Set fallback console commands
        setConsoleCommands({
          frontend_browser_commands: {
            title: 'Frontend Browser Commands',
            description: 'JavaScript commands for browser console debugging',
            commands: {
              check_auth: {
                description: 'Check authentication status',
                command: 'console.log("Auth:", localStorage.getItem("jwt_token") ? "Token present" : "No token");'
              },
              clear_storage: {
                description: 'Clear all storage',
                command: 'localStorage.clear(); sessionStorage.clear(); console.log("Storage cleared");'
              }
            }
          },
          backend_cli_commands: {
            title: 'Backend CLI Commands',
            description: 'Command line tools for backend testing',
            commands: {
              run_tests: {
                description: 'Run all tests',
                command: 'cd pkms-backend && python -m pytest tests/ -v'
              },
              health_check: {
                description: 'Check backend health',
                command: `curl ${API_BASE_URL}/health`
              }
            }
          }
        });
      }
    } catch (error) {
      console.error('Failed to load initial testing data:', error);
    }
  };

  const addAuthLog = (type: AuthLogEntry['type'], message: string, details?: any) => {
    const newLog: AuthLogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      details
    };
    setAuthLogs(prev => [...prev, newLog]);
  };

  const addDiaryLog = (type: AuthLogEntry['type'], message: string, details?: any) => {
    const newLog: AuthLogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      details
    };
    setDiaryLogs(prev => [...prev, newLog]);
  };

  // Authentication Tests
  const runAuthenticationTests = async () => {
    setIsRunningAuthTests(true);
    setAuthLogs([]);
    
    try {
      addAuthLog('info', '🔍 Starting comprehensive authentication tests...');
      
      // Check authentication status
      const authCheck = testingService.checkAuthentication();
      addAuthLog('info', `📱 Token Check: ${authCheck.hasToken ? 'Found' : 'Missing'}`, authCheck);
      
      if (authCheck.hasToken && authCheck.remainingTimeSeconds !== undefined) {
        addAuthLog('info', `⏰ Token expires in ${authCheck.remainingTimeSeconds}s`, {
          remainingTime: authCheck.remainingTimeSeconds,
          expiresAt: authCheck.expiresAt
        });
      }
      
      if (authCheck.isExpired) {
        addAuthLog('warning', '⚠️ Token is expired');
      }
      
      // Test API connectivity
      addAuthLog('info', '🌐 Testing API connectivity...');
      const apiTest = await testingService.testAPIConnectivity();

      // Build a concise summary so the UI can reflect overall status consistently
      const summary = {
        hasValidToken: authCheck.hasToken && !authCheck.isExpired && apiTest.auth_test.success,
        remainingTimeSeconds: authCheck.remainingTimeSeconds,
        backendHealthy: apiTest.backend_health.success
      } as const;

      // Merge results so UI can access both the raw test details and the summary
      const combinedResults = {
        ...apiTest,
        summary
      };

      setAuthResults(combinedResults);
      
      if (apiTest.backend_health.success) {
        addAuthLog('success', `✅ Backend Health: ${apiTest.backend_health.response_time_ms}ms`);
      } else {
        addAuthLog('error', '❌ Backend Health: Failed', apiTest.backend_health.error);
      }
      
      if (apiTest.cors_test.success) {
        addAuthLog('success', '✅ CORS Configuration: Working');
      } else {
        addAuthLog('error', '❌ CORS Configuration: Failed', apiTest.cors_test.error);
      }
      
      if (apiTest.auth_test.success) {
        addAuthLog('success', '✅ Authenticated API Access: Working');
      } else {
        addAuthLog('error', '❌ Authenticated API Access: Failed', apiTest.auth_test.error);
      }
      
      addAuthLog('info', '🎯 Authentication test sequence completed');
      
      notifications.show({
        title: 'Authentication Tests Complete',
        message: 'Check detailed logs for results',
        color: 'blue'
      });
      
    } catch (error) {
      addAuthLog('error', `💥 Test failed: ${error}`);
      notifications.show({
        title: 'Authentication Test Error',
        message: 'Failed to run authentication tests',
        color: 'red'
      });
    } finally {
      setIsRunningAuthTests(false);
    }
  };

  // Database Tests
  const loadDatabaseStats = async () => {
    setIsLoading(true);
    try {
      const stats = await testingService.getDatabaseStats();
      setDatabaseStats(stats);
      
      notifications.show({
        title: 'Database Stats Loaded',
        message: `Database size: ${testingService.formatBytes(stats.database_size_bytes)}`,
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Database Stats Failed',
        message: 'Could not load database statistics',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadAllTableSchemas = async () => {
    setIsLoading(true);
    try {
      const allTables = tableGroups.flatMap(group => group.tables);
      const schemas: Record<string, TableSchema> = {};
      
      for (const table of allTables) {
        try {
          const schema = await testingService.getTableSchema(table);
          schemas[table] = schema;
        } catch (error) {
          console.warn(`Failed to load schema for table ${table}:`, error);
        }
      }
      
      setAllTableSchemas(schemas);
      setSchemaDrawerOpen(true);
      
      notifications.show({
        title: 'Table Schemas Loaded',
        message: `Loaded schemas for ${Object.keys(schemas).length} tables`,
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Schema Loading Failed',
        message: 'Could not load table schemas',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadSampleRows = async () => {
    if (!selectedTable) return;
    
    setIsLoading(true);
    try {
      const rows = await testingService.getSampleRows(selectedTable, rowLimit);
      setSampleRows(rows);
      
      notifications.show({
        title: 'Sample Rows Loaded',
        message: `Loaded ${rows.row_count} rows from ${selectedTable}`,
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Sample Rows Failed',
        message: 'Could not load sample rows',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Diary Encryption Tests with verbose logging
  const testDiaryEncryption = async () => {
    if (!diaryPassword.trim()) {
      notifications.show({
        title: 'Password Required',
        message: 'Please enter your diary encryption password',
        color: 'orange'
      });
      return;
    }
    
    setIsLoading(true);
    setDiaryLogs([]);
    
    try {
      addDiaryLog('info', '🔍 Starting diary encryption test...');
      addDiaryLog('info', '🔐 Validating encryption password...');
      
      const result = await testingService.testDiaryEncryption(diaryPassword);
      setDiaryTestResult(result);
      
      if (result.encryption_test) {
        addDiaryLog('success', '✅ Password validation successful');
        addDiaryLog('info', '📖 Sample diary entry retrieved and decrypted');
        
        if (result.sample_entry) {
          addDiaryLog('info', `📅 Entry Date: ${result.sample_entry!.date}`);
          addDiaryLog('info', `📝 Entry Title: ${result.sample_entry!.title || 'No title'}`);
          addDiaryLog('info', `😊 Mood: ${result.sample_entry!.mood || 'Not set'}`);
          addDiaryLog('info', `🔒 Encryption Details: ${result.sample_entry!.encryption_details?.encrypted_blob_length || 0} bytes encrypted`);
          addDiaryLog('info', `🏷️ Metadata: ${Object.keys(result.sample_entry!.metadata || {}).length} fields`);
        }
        
        addDiaryLog('info', `📎 Media Files: ${result.media_count || 0} associated files`);
        addDiaryLog('success', '🎉 Diary encryption test completed successfully');
      } else {
        addDiaryLog('error', '❌ Password validation failed');
        addDiaryLog('error', '🚫 Could not decrypt sample entry');
      }
      
      notifications.show({
        title: 'Diary Encryption Test',
        message: result.message,
        color: result.encryption_test ? 'green' : 'red'
      });
    } catch (error) {
      addDiaryLog('error', `💥 Test failed: ${error}`);
      notifications.show({
        title: 'Diary Test Failed',
        message: 'Could not test diary encryption',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // System Health Tests
  const loadSystemHealth = async () => {
    setIsLoading(true);
    try {
      const health = await testingService.getDetailedHealth();
      setHealthData(health);
      
      notifications.show({
        title: 'System Health Loaded',
        message: `Database: ${health.database.connectivity}`,
        color: health.database.connectivity === 'operational' ? 'green' : 'red'
      });
    } catch (error) {
      notifications.show({
        title: 'Health Check Failed',
        message: 'Could not load system health data',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Utility functions
  const clearAllData = () => {
    // Clear all authentication state
    setAuthResults(null);
    setAuthLogs([]);
    
    // Clear all database state
    setDatabaseStats(null);
    setSampleRows(null);
    setTableSchema(null);
    setAllTableSchemas({});
    setAllTablesData(null);
    
    // Clear FTS5 tables state
    setFtsTablesData(null);
    setSelectedFtsTable('');
    setFtsModalOpen(false);
    setFtsTableSamples(null);
    
    // Clear diary testing state
    setDiaryTestResult(null);
    setDiaryLogs([]);
    setDiaryPassword('');
    
    // Clear system health state
    setHealthData(null);
    
    // Clear console commands state  
    setConsoleCommands(null);
    
    // Clear all advanced testing state
    setPerformanceMetrics(null);
    setDataIntegrityResults(null);
    setResourceUsage(null);
    setFileSanityResult(null);
    setCrudTestResult(null);
    
    // Reset UI state
    setSelectedTableGroup('core_system');
    setSelectedTable('users');
    setRowLimit(5);
    setSchemaDrawerOpen(false);
    setAllTablesModalOpen(false);
    setAllTablesExpanded(false);
    
    // Show clear confirmation
    notifications.show({
      title: 'Data Cleared',
      message: 'All test results, logs, and cached data have been cleared',
      color: 'blue',
      icon: <IconTrash size={16} />
    });
  };

  const loadAllTablesData = async () => {
    try {
      setIsLoading(true);
      const data = await testingService.getAllTables();
      setAllTablesData(data);
    } catch (error) {
      console.error('Failed to load all tables data:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load all tables data',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadFtsTablesData = async () => {
    try {
      setIsLoading(true);
      const data = await testingService.getFtsTableDetails();
      setFtsTablesData(data);
    } catch (error) {
      console.error('Failed to load FTS tables data:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load FTS5 tables data',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadFtsTableSample = async (tableName: string) => {
    try {
      setIsLoading(true);
      const data = await testingService.loadFtsTableSample(tableName, rowLimit);
      setFtsTableSamples(data);
      setSelectedFtsTable(tableName);
    } catch (error) {
      console.error('Failed to load FTS table sample:', error);
      notifications.show({
        title: 'Error',
        message: `Failed to load sample data for ${tableName}`,
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadPerformanceMetrics = async () => {
    setIsLoading(true);
    try {
      const metrics = await testingService.getPerformanceMetrics();
      setPerformanceMetrics(metrics);
      
      notifications.show({
        title: 'Performance Metrics Loaded',
        message: `Query performance: ${metrics.performance_score}`,
        color: metrics.performance_score === 'good' ? 'green' : metrics.performance_score === 'slow' ? 'orange' : 'red'
      });
    } catch (error) {
      notifications.show({
        title: 'Performance Test Failed',
        message: 'Could not load performance metrics',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadDataIntegrityResults = async () => {
    setIsLoading(true);
    try {
      const results = await testingService.validateDataIntegrity();
      setDataIntegrityResults(results);
      
      notifications.show({
        title: 'Data Integrity Check Complete',
        message: `Status: ${results.overall_status} (${results.summary.passed}/${results.summary.total_checks} passed)`,
        color: results.overall_status === 'passed' ? 'green' : results.overall_status === 'warning' ? 'orange' : 'red'
      });
    } catch (error) {
      notifications.show({
        title: 'Data Integrity Check Failed',
        message: 'Could not validate data integrity',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadResourceUsage = async () => {
    setIsLoading(true);
    try {
      const usage = await testingService.getResourceUsage();
      setResourceUsage(usage);
      
      notifications.show({
        title: 'Resource Usage Loaded',
        message: `Memory: ${usage.process_memory.rss_mb}MB, CPU: ${usage.process_cpu.percent}%`,
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Resource Monitoring Failed',
        message: 'Could not load resource usage',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const runFileSanityCheck = async () => {
    setIsLoading(true);
    try {
      const result = await testingService.runFileSanityCheck(fileSanityOptions);
      setFileSanityResult(result);
      
      notifications.show({
        title: 'File System Test Completed',
        message: `Test ${result.overall_status === 'success' ? 'passed' : 'had issues'} - ${result.messages?.length || 0} messages`,
        color: result.overall_status === 'success' ? 'green' : 'orange'
      });
    } catch (error) {
      notifications.show({
        title: 'File System Test Failed',
        message: `Error: ${error}`,
        color: 'red'
      });
      console.error('File sanity check error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const runCrudTest = async () => {
    setIsLoading(true);
    try {
      const result = await testingService.runCrudTest(crudTestOptions);
      setCrudTestResult(result);
      
      notifications.show({
        title: 'CRUD Test Completed',
        message: `${result.test_counts?.passed || 0}/${result.test_counts?.total_tests || 0} tests passed`,
        color: result.overall_status === 'all_passed' ? 'green' : 'orange'
      });
    } catch (error) {
      notifications.show({
        title: 'CRUD Test Failed',
        message: `Error: ${error}`,
        color: 'red'
      });
      console.error('CRUD test error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Individual CRUD operations
  const runIndividualCrudOperation = async (operation: string, type: string, params: any = {}) => {
    setIsLoading(true);
    try {
      let result;
      
      switch (operation) {
        case 'create_note':
          result = await testingService.createTestNote(params.title, params.content);
          break;
        case 'create_document':
          result = await testingService.createTestDocument(params.filename, params.contentType, params.fileSize);
          break;
        case 'create_todo':
          result = await testingService.createTestTodo(params.title, params.description, params.priority);
          break;
        case 'cleanup':
          result = await testingService.cleanupTestItem(params.itemType, params.itemId);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      setIndividualCrudResults(prev => ({
        ...prev,
        [operation]: result
      }));
      
      notifications.show({
        title: `${operation.replace('_', ' ').toUpperCase()} Operation`,
        message: result.status === 'success' ? result.message : `Failed: ${result.error}`,
        color: result.status === 'success' ? 'green' : 'red'
      });
    } catch (error) {
      notifications.show({
        title: 'Operation Failed',
        message: `Error: ${error}`,
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const downloadTestResults = () => {
    const allResults = {
      authentication: authResults,
      database: databaseStats,
      diary: diaryTestResult,
      systemHealth: healthData,
      performance: performanceMetrics,
      dataIntegrity: dataIntegrityResults,
      resourceUsage: resourceUsage,
      fileSanity: fileSanityResult,
      crudTest: crudTestResult,
      timestamp: new Date().toISOString()
    };
    
    testingService.downloadTestResults(allResults, `pkms-comprehensive-test-${new Date().toISOString().split('T')[0]}.json`);
    
    notifications.show({
      title: 'Test Results Downloaded',
      message: 'Complete test results saved to downloads folder',
      color: 'green'
    });
  };

  // Render authentication tab with detailed logs
  const renderAuthTab = () => (
    <Stack gap="lg">
      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={4}>Authentication Testing</Title>
            <Badge color="blue" variant="light">Live Monitoring</Badge>
          </Group>
          
          <Text size="sm" c="dimmed">
            Comprehensive authentication testing with detailed logging and step-by-step analysis.
          </Text>
          
          <Group>
            <Button
              leftSection={<IconShield size={16} />}
              onClick={runAuthenticationTests}
              loading={isRunningAuthTests}
              size="md"
              type="button"
            >
              Run Comprehensive Auth Tests
            </Button>
            <Button
              variant="outline"
              leftSection={<IconRefresh size={16} />}
              onClick={() => {
                const quickCheck = testingService.checkAuthentication();
                addAuthLog(
                  quickCheck.hasToken && !quickCheck.isExpired ? 'success' : 'warning',
                  `Quick check: ${quickCheck.hasToken && !quickCheck.isExpired ? 'Auth OK' : 'Auth Issues'}`
                );
              }}
              type="button"
            >
              Quick Check
            </Button>
            <Button
              variant="outline"
              leftSection={<IconTrash size={16} />}
              onClick={() => {
                setAuthLogs([]);
                notifications.show({
                  title: 'Logs Cleared',
                  message: 'Authentication logs have been cleared',
                  color: 'blue'
                });
              }}
              color="gray"
              type="button"
            >
              Clear Logs
            </Button>
          </Group>
        </Stack>
      </Card>

      {/* Authentication Logs */}
      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={5}>Authentication Logs</Title>
            <Badge color="gray" variant="light">{authLogs.length} entries</Badge>
          </Group>
          
          <ScrollArea h={250}>
            {authLogs.length > 0 ? (
              <Timeline active={authLogs.length - 1} bulletSize={16} lineWidth={2}>
                {authLogs.map((log, index) => (
                  <Timeline.Item
                    key={index}
                    bullet={
                      <ThemeIcon
                        size={16}
                        variant="filled"
                        color={
                          log.type === 'success' ? 'green' :
                          log.type === 'error' ? 'red' :
                          log.type === 'warning' ? 'orange' : 'blue'
                        }
                      >
                        {log.type === 'success' ? <IconCheck size={10} /> :
                         log.type === 'error' ? <IconX size={10} /> :
                         log.type === 'warning' ? <IconAlertTriangle size={10} /> :
                         <IconSettings size={10} />}
                      </ThemeIcon>
                    }
                    title={<Text size="sm" fw={500}>{log.timestamp}</Text>}
                  >
                    <Text size="sm">{log.message}</Text>
                    {log.details && (
                      <Code block mt="xs" style={{ fontSize: '10px' }}>
                        {JSON.stringify(log.details, null, 2)}
                      </Code>
                    )}
                  </Timeline.Item>
                ))}
              </Timeline>
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="xl">
                Run authentication tests to see detailed logs here
              </Text>
            )}
          </ScrollArea>
        </Stack>
      </Card>

      {/* Results Summary */}
      {authResults && (
        <Card withBorder>
          <Stack gap="sm">
            <Group justify="space-between">
              <Title order={5}>Authentication Test Results</Title>
              <Badge 
                color={authResults.summary?.hasValidToken ? 'green' : 'red'}
                size="lg"
                variant="filled"
              >
                {authResults.summary?.hasValidToken ? '✓ AUTHENTICATED' : '✗ NOT AUTHENTICATED'}
              </Badge>
            </Group>
            
            <Alert 
              color={authResults.summary?.hasValidToken ? 'green' : 'red'} 
              variant="light"
              icon={authResults.summary?.hasValidToken ? <IconCheck size={16} /> : <IconX size={16} />}
            >
              <Text size="sm" fw={500}>
                {authResults.summary?.hasValidToken 
                  ? 'Authentication tests passed successfully. User is properly authenticated.'
                  : 'Authentication tests failed. User authentication issues detected.'
                }
              </Text>
              {authResults.summary?.hasValidToken && authResults.summary?.remainingTimeSeconds !== undefined && (
                <Text size="xs" mt="xs">
                  Token valid for {authResults.summary.remainingTimeSeconds > 0 
                    ? `${Math.floor(authResults.summary.remainingTimeSeconds / 60)}m ${authResults.summary.remainingTimeSeconds % 60}s`
                    : '0s (expired)'
                  }
                </Text>
              )}
            </Alert>
            
            <SimpleGrid cols={2} spacing="md">
              <Paper withBorder p="md">
                <Group>
                  <ThemeIcon color={authResults.summary?.hasValidToken ? 'green' : 'red'} variant="light">
                    <IconKey size={16} />
                  </ThemeIcon>
                  <Box>
                    <Text size="sm" fw={500}>JWT Token</Text>
                    <Text size="xs" c="dimmed">
                      {authResults.summary?.hasValidToken ? 'Valid & Active' : 'Invalid/Missing/Expired'}
                    </Text>
                  </Box>
                </Group>
              </Paper>
              
              <Paper withBorder p="md">
                <Group>
                  <ThemeIcon color={authResults.summary?.backendHealthy ? 'green' : 'red'} variant="light">
                    <IconServer size={16} />
                  </ThemeIcon>
                  <Box>
                    <Text size="sm" fw={500}>Backend API</Text>
                    <Text size="xs" c="dimmed">
                      {authResults.summary?.backendHealthy ? 'Healthy & Responsive' : 'Issues Detected'}
                    </Text>
                  </Box>
                </Group>
              </Paper>
            </SimpleGrid>
            
            <Group>
              <CopyButton value={JSON.stringify(authResults, null, 2)}>
                {({ copied, copy }) => (
                  <Button
                    size="sm"
                    variant="outline"
                    leftSection={<IconCopy size={14} />}
                    onClick={copy}
                    color={copied ? 'green' : 'blue'}
                    type="button"
                  >
                    {copied ? 'Results Copied' : 'Copy Full Results'}
                  </Button>
                )}
              </CopyButton>
              <Button
                size="sm"
                variant="light"
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => {
                  setAuthResults(null);
                  setAuthLogs([]);
                  notifications.show({
                    title: 'Results Cleared',
                    message: 'Authentication test results have been cleared',
                    color: 'blue'
                  });
                }}
                type="button"
              >
                Clear Results
              </Button>
            </Group>
          </Stack>
        </Card>
      )}
    </Stack>
  );

  // Enhanced database tab with grouped tables
  const renderDatabaseTab = () => (
    <Stack gap="lg">
      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={4}>Database Testing & Analysis</Title>
            <Badge color="blue" variant="light">Advanced</Badge>
          </Group>
          
          <Text size="sm" c="dimmed">
            Comprehensive database inspection with grouped table schemas and sample data analysis.
          </Text>
          
          <Group>
            <Button
              leftSection={<IconDatabase size={16} />}
              onClick={loadDatabaseStats}
              loading={isLoading}
              type="button"
            >
              Load Database Stats
            </Button>
            <Button
              leftSection={<IconTable size={16} />}
              onClick={loadAllTableSchemas}
              loading={isLoading}
              variant="outline"
              type="button"
            >
              View All Table Schemas
            </Button>
            <Button
              leftSection={<IconSearch size={16} />}
              onClick={loadAllTablesData}
              loading={isLoading}
              variant="outline"
              color="orange"
              type="button"
            >
              Explain 37 Tables
            </Button>
          </Group>
        </Stack>
      </Card>

      {/* Database Statistics */}
      {databaseStats && (
        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={5}>Database Overview</Title>
              <Badge color="blue" size="lg">
                {testingService.formatBytes(databaseStats.database_size_bytes)}
              </Badge>
            </Group>
            
            <SimpleGrid cols={3} spacing="md">
              <Paper withBorder p="md" ta="center">
                <Text size="xl" fw={700} color="blue">{databaseStats.user_id}</Text>
                <Text size="sm" c="dimmed">User ID</Text>
              </Paper>
              <Paper withBorder p="md" ta="center">
                <Text size="xl" fw={700} color="green">
                  {Object.keys(databaseStats.table_counts).length}
                </Text>
                <Text size="sm" c="dimmed">Tables</Text>
              </Paper>
              <Paper withBorder p="md" ta="center">
                <Text size="xl" fw={700} color="orange">
                  {Object.values(databaseStats.table_counts).reduce((a, b) => Number(a) + Number(b), 0)}
                </Text>
                <Text size="sm" c="dimmed">Total Rows</Text>
              </Paper>
            </SimpleGrid>
            
            <Divider />
            
            <Title order={6}>Table Row Counts & Storage Sizes</Title>
            <SimpleGrid cols={1} spacing="sm">
              {Object.entries(databaseStats.table_counts).map(([table, count]) => {
                const tableSize = databaseStats.table_sizes?.[table];
                return (
                  <Group key={table} justify="space-between" p="xs" style={{ borderBottom: '1px solid #e9ecef' }}>
                    <Group gap="xs">
                      <Text size="sm" fw={500}>{table}</Text>
                      {tableSize?.estimated && (
                        <Badge size="xs" color="orange" variant="light">EST</Badge>
                      )}
                    </Group>
                    <Group gap="md">
                      <Group gap="xs">
                        <Badge size="sm" variant="light" color="blue">{count} rows</Badge>
                        {tableSize && !tableSize.error && (
                          <Badge size="sm" variant="light" color="green">
                            {tableSize.size_mb > 0.01 ? `${tableSize.size_mb} MB` : `${tableSize.size_bytes} B`}
                          </Badge>
                        )}
                        {tableSize?.error && (
                          <Badge size="xs" color="red" variant="light">Size Error</Badge>
                        )}
                      </Group>
                    </Group>
                  </Group>
                );
              })}
            </SimpleGrid>
          </Stack>
        </Card>
      )}

      {/* Sample Data Inspector */}
      <Card withBorder>
        <Stack gap="md">
          <Title order={5}>Sample Data Inspector</Title>
          
          <Group grow>
            <Select
              label="Table Group"
              value={selectedTableGroup}
              onChange={(value) => {
                if (value) {
                  setSelectedTableGroup(value);
                  // Set first table of the group as default
                  const tables = getTablesForGroup(value);
                  if (tables.length > 0) {
                    setSelectedTable(tables[0].value);
                  }
                }
              }}
              data={getTableGroupSelectData()}
            />
            <Select
              label="Table"
              value={selectedTable}
              onChange={(value) => value && setSelectedTable(value)}
              data={getTablesForGroup(selectedTableGroup)}
            />
            <NumberInput
              label="Row Limit"
              value={rowLimit}
              onChange={(value) => setRowLimit(Number(value) || 5)}
              min={1}
              max={20}
            />
          </Group>

          <Button
            leftSection={<IconEye size={16} />}
            onClick={loadSampleRows}
            loading={isLoading}
            fullWidth
          >
            Load Sample Rows from {selectedTable}
          </Button>

          {sampleRows && (
            <Box>
              <Group justify="space-between" mb="md">
                <Text size="sm" fw={500}>
                  {sampleRows.row_count} rows from {sampleRows.table}
                </Text>
                <Text size="xs" c="dimmed">{sampleRows.timestamp}</Text>
              </Group>
              
              <ScrollArea h={400}>
                <Code block style={{ fontSize: '11px' }}>
                  {JSON.stringify(sampleRows.sample_rows, null, 2)}
                </Code>
              </ScrollArea>
            </Box>
          )}
        </Stack>
      </Card>

      {/* Table Schemas Drawer */}
      <Drawer
        opened={schemaDrawerOpen}
        onClose={() => setSchemaDrawerOpen(false)}
        title="Complete Database Schema"
        position="right"
        size="xl"
      >
        <Stack gap="lg">
          {tableGroups.map((group) => (
            <Card key={group.name} withBorder>
              <Stack gap="md">
                <Group>
                  <ThemeIcon color={group.color} variant="light">
                    {group.icon}
                  </ThemeIcon>
                  <Box>
                    <Text fw={500}>{group.name}</Text>
                    <Text size="xs" c="dimmed">{group.description}</Text>
                  </Box>
                </Group>
                
                <Accordion>
                  {group.tables.map((tableName) => {
                    const schema = allTableSchemas[tableName];
                    return (
                      <Accordion.Item key={tableName} value={tableName}>
                        <Accordion.Control>
                          <Group justify="space-between">
                            <Text fw={500}>{tableName}</Text>
                            {schema && (
                              <Badge size="sm" variant="light">
                                {schema.column_count} columns
                              </Badge>
                            )}
                          </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                          {schema ? (
                            <Table striped highlightOnHover>
                              <Table.Thead>
                                <Table.Tr>
                                  <Table.Th>Column</Table.Th>
                                  <Table.Th>Type</Table.Th>
                                  <Table.Th>Constraints</Table.Th>
                                </Table.Tr>
                              </Table.Thead>
                              <Table.Tbody>
                                {schema.columns.map((col) => (
                                  <Table.Tr key={col.name}>
                                    <Table.Td>
                                      <Group gap="xs">
                                        <Text size="sm" fw={col.primary_key ? 600 : 400}>
                                          {col.name}
                                        </Text>
                                        {col.primary_key && (
                                          <Badge size="xs" color="red">PK</Badge>
                                        )}
                                      </Group>
                                    </Table.Td>
                                    <Table.Td>
                                      <Code>{col.type}</Code>
                                    </Table.Td>
                                    <Table.Td>
                                      <Group gap="xs">
                                        {col.not_null && (
                                          <Chip size="xs" color="orange" checked={false}>
                                            NOT NULL
                                          </Chip>
                                        )}
                                        {col.default_value && (
                                          <Chip size="xs" color="gray" checked={false}>
                                            DEFAULT
                                          </Chip>
                                        )}
                                      </Group>
                                    </Table.Td>
                                  </Table.Tr>
                                ))}
                              </Table.Tbody>
                            </Table>
                          ) : (
                            <Text size="sm" c="dimmed">Schema not loaded</Text>
                          )}
                        </Accordion.Panel>
                      </Accordion.Item>
                    );
                  })}
                </Accordion>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Drawer>
      
      {/* All Tables Explanation Modal */}
      <Modal
        opened={allTablesModalOpen}
        onClose={() => setAllTablesModalOpen(false)}
        title="Complete Database Table Breakdown"
        size="xl"
      >
        {allTablesData && (
          <Stack gap="lg">
            <Alert color="blue" icon={<IconDatabase size={16} />}>
              <Stack gap="xs">
                <Text fw={500}>Database Tables: {allTablesData.total_tables}</Text>
                <Text size="sm">{allTablesData.explanation.why_37_tables}</Text>
              </Stack>
            </Alert>
            
            <SimpleGrid cols={3} spacing="md">
              <Paper withBorder p="md" ta="center">
                <Text size="xl" fw={700} color="blue">
                  {allTablesData.by_category['Application Data']?.length || 0}
                </Text>
                <Text size="sm" c="dimmed">Application Tables</Text>
                <Text size="xs" c="dimmed">Your actual data</Text>
              </Paper>
              <Paper withBorder p="md" ta="center">
                <Text size="xl" fw={700} color="orange">
                  {allTablesData.by_category['Full-Text Search (FTS5)']?.length || 0}
                </Text>
                <Text size="sm" c="dimmed">FTS5 Tables</Text>
                <Text size="xs" c="dimmed">Search indexes</Text>
              </Paper>
              <Paper withBorder p="md" ta="center">
                <Text size="xl" fw={700} color="gray">
                  {allTablesData.by_category['SQLite System']?.length || 0}
                </Text>
                <Text size="sm" c="dimmed">System Tables</Text>
                <Text size="xs" c="dimmed">SQLite internals</Text>
              </Paper>
            </SimpleGrid>
            
            <Accordion>
              {Object.entries(allTablesData.by_category).map(([category, tables]) => (
                <Accordion.Item key={category} value={category}>
                  <Accordion.Control>
                    <Group justify="space-between">
                      <Text fw={500}>{category}</Text>
                      <Badge size="sm" variant="light">{tables.length} tables</Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <SimpleGrid cols={2} spacing="xs">
                      {tables.map((tableName) => {
                        const tableInfo = allTablesData.tables.find(t => t.name === tableName);
                        return (
                          <Group key={tableName} justify="space-between" p="xs">
                            <Text size="sm" ff="monospace">{tableName}</Text>
                            <Badge 
                              size="xs" 
                              color={tableInfo?.is_application_table ? 'blue' : 'gray'}
                              variant="light"
                            >
                              {tableInfo?.type}
                            </Badge>
                          </Group>
                        );
                      })}
                    </SimpleGrid>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
            
            <Stack gap="xs">
              <Text size="sm" fw={500}>Key Points:</Text>
              <List spacing="xs" size="sm">
                <List.Item>{allTablesData.explanation.application_tables}</List.Item>
                <List.Item>{allTablesData.explanation.fts_tables}</List.Item>
                <List.Item>{allTablesData.explanation.system_tables}</List.Item>
                <List.Item>The Testing Interface only shows application tables to avoid confusion</List.Item>
              </List>
            </Stack>
          </Stack>
        )}
      </Modal>
    </Stack>
  );

  // Enhanced diary tab with verbose logging
  const renderDiaryTab = () => (
    <Stack gap="lg">
      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={4}>Diary Encryption Testing</Title>
            <Badge color="orange" variant="light">Security</Badge>
          </Group>
          
          <Alert color="blue" variant="light">
            <Text size="sm">
              Test diary encryption by providing your diary password. This will verify the password
              and show detailed encryption information for a sample entry with verbose logging.
            </Text>
          </Alert>
          
          <Group grow>
            <PasswordInput
              label="Diary Encryption Password"
              placeholder="Enter your diary password"
              value={diaryPassword}
              onChange={(event) => setDiaryPassword(event.currentTarget.value)}
              size="md"
            />
            <Button
              leftSection={<IconLock size={16} />}
              onClick={testDiaryEncryption}
              loading={isLoading}
              disabled={!diaryPassword.trim()}
              size="md"
              type="button"
            >
              Test Encryption
            </Button>
          </Group>
        </Stack>
      </Card>

      {/* Diary Test Logs */}
      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={5}>Encryption Test Logs</Title>
            <Badge color="gray" variant="light">{diaryLogs.length} entries</Badge>
          </Group>
          
          <ScrollArea h={200}>
            {diaryLogs.length > 0 ? (
              <List spacing="xs" size="sm">
                {diaryLogs.map((log, index) => (
                  <List.Item key={index}>
                    <Code>{log.message}</Code>
                  </List.Item>
                ))}
              </List>
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="xl">
                Run encryption test to see detailed logs here
              </Text>
            )}
          </ScrollArea>
        </Stack>
      </Card>

      {/* Diary Test Results */}
      {diaryTestResult && (
        <Card withBorder>
          <Stack gap="md">
            <Alert
              color={diaryTestResult.encryption_test ? 'green' : 'red'}
              title={diaryTestResult.status.toUpperCase()}
              icon={diaryTestResult.encryption_test ? <IconCheck size={16} /> : <IconX size={16} />}
            >
              <Text size="sm">{diaryTestResult.message}</Text>
            </Alert>
            
            {diaryTestResult.sample_entry && (
              <SimpleGrid cols={2} spacing="md">
                <Paper withBorder p="md">
                  <Stack gap="xs">
                    <Text size="sm" fw={500}>Entry Information</Text>
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">Entry ID:</Text>
                      <Badge size="sm">{diaryTestResult.sample_entry.id}</Badge>
                    </Group>
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">Date:</Text>
                      <Text size="xs">{diaryTestResult.sample_entry.date}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">Title:</Text>
                      <Text size="xs">{diaryTestResult.sample_entry.title || 'No title'}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">Mood:</Text>
                      <Text size="xs">{diaryTestResult.sample_entry.mood || 'Not set'}</Text>
                    </Group>
                  </Stack>
                </Paper>
                
                <Paper withBorder p="md">
                  <Stack gap="xs">
                    <Text size="sm" fw={500}>Encryption Details</Text>
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">Encrypted Blob:</Text>
                      <Badge size="sm" color="blue">
                        {diaryTestResult.sample_entry.encryption_details?.encrypted_blob_length || 0} bytes
                      </Badge>
                    </Group>
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">IV Length:</Text>
                      <Badge size="sm" color="orange">
                        {diaryTestResult.sample_entry.encryption_details?.iv_length || 0} bytes
                      </Badge>
                    </Group>
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">Tag Length:</Text>
                      <Badge size="sm" color="green">
                        {diaryTestResult.sample_entry.encryption_details?.tag_length || 0} bytes
                      </Badge>
                    </Group>
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">Media Files:</Text>
                      <Badge size="sm" color="purple">
                        {diaryTestResult.media_count || 0}
                      </Badge>
                    </Group>
                  </Stack>
                </Paper>
              </SimpleGrid>
            )}
          </Stack>
        </Card>
      )}
    </Stack>
  );

  // Enhanced advanced tab with collapsible sections and system health
  const renderAdvancedTab = () => (
    <Stack gap="lg">
      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={4}>Advanced Testing & System Monitoring</Title>
            <Badge color="purple" variant="light">Enhanced</Badge>
          </Group>
          
          <Text size="sm" c="dimmed">
            Comprehensive system testing including performance monitoring, data integrity validation, 
            file system operations, CRUD testing, and system health checks.
          </Text>
        </Stack>
      </Card>

      {/* Performance & Integrity Monitoring */}
      <Card withBorder>
        <Stack gap="md">
          <Title order={5}>Performance & Data Monitoring</Title>
          <Text size="xs" c="dimmed">
            Monitor database performance, validate data integrity, and track system resource usage
          </Text>
          
          <SimpleGrid cols={3} spacing="md">
            <Button
              leftSection={<IconDeviceAnalytics size={16} />}
              onClick={loadPerformanceMetrics}
              loading={isLoading}
              color="blue"
              type="button"
            >
              Performance Metrics
            </Button>
            <Button
              leftSection={<IconShield size={16} />}
              onClick={loadDataIntegrityResults}
              loading={isLoading}
              color="green"
              type="button"
            >
              Data Integrity Check
            </Button>
            <Button
              leftSection={<IconServer size={16} />}
              onClick={loadResourceUsage}
              loading={isLoading}
              color="orange"
              type="button"
            >
              Resource Monitoring
            </Button>
          </SimpleGrid>
        </Stack>
      </Card>

      {/* System Health Monitoring */}
      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between" style={{ cursor: 'pointer' }} 
                 onClick={() => setSystemHealthExpanded(!systemHealthExpanded)}>
            <Group>
              <Title order={5}>System Health Monitoring</Title>
              <Badge color="cyan" variant="light">Health Check</Badge>
            </Group>
            <ActionIcon variant="subtle" color="gray">
              {systemHealthExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </ActionIcon>
          </Group>
          
          <Collapse in={systemHealthExpanded}>
            <Stack gap="md">
              <Text size="xs" c="dimmed">
                Comprehensive system health analysis including database connectivity, 
                user session validation, and overall system status
              </Text>
              
              <Button
                leftSection={<IconSettings size={16} />}
                onClick={loadSystemHealth}
                loading={isLoading}
                color="cyan"
                type="button"
                fullWidth
              >
                Run System Health Check
              </Button>
            </Stack>
          </Collapse>
        </Stack>
      </Card>

      {/* File System Testing */}
      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between" style={{ cursor: 'pointer' }} 
                 onClick={() => setFileSystemExpanded(!fileSystemExpanded)}>
            <Group>
              <Title order={5}>File System Testing</Title>
              <Badge color="teal" variant="light">Enhanced</Badge>
            </Group>
            <ActionIcon variant="subtle" color="gray">
              {fileSystemExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </ActionIcon>
          </Group>
          
          <Collapse in={fileSystemExpanded}>
            <Stack gap="md">
              <Text size="xs" c="dimmed">
                Test file system operations including create, read, write, and delete operations 
                with performance metrics and verbose logging
              </Text>
              
              <Group>
                <TextInput
                  label="Test Filename"
                  value={fileSanityOptions.filename}
                  onChange={(event) => setFileSanityOptions((prev: any) => ({
                    ...prev,
                    filename: event.currentTarget.value
                  }))}
                  placeholder="pkms_test_file.txt"
                  size="sm"
                  style={{ flex: 1 }}
                />
                <Chip 
                  checked={fileSanityOptions.verbose}
                  onChange={(checked) => setFileSanityOptions((prev: any) => ({
                    ...prev,
                    verbose: checked
                  }))}
                  color="blue"
                  size="sm"
                >
                  Verbose Output
                </Chip>
              </Group>
              
              <Button
                leftSection={<IconFile size={16} />}
                onClick={runFileSanityCheck}
                loading={isLoading}
                color="teal"
                type="button"
                fullWidth
              >
                Run File System Test
              </Button>
            </Stack>
          </Collapse>
        </Stack>
      </Card>

      {/* CRUD Operations Testing */}
      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between" style={{ cursor: 'pointer' }} 
                 onClick={() => setCrudTestingExpanded(!crudTestingExpanded)}>
            <Group>
              <Title order={5}>CRUD Operations Testing</Title>
              <Badge color="purple" variant="light">Enhanced</Badge>
            </Group>
            <ActionIcon variant="subtle" color="gray">
              {crudTestingExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </ActionIcon>
          </Group>
          
          <Collapse in={crudTestingExpanded}>
            <Stack gap="md">
              <Text size="xs" c="dimmed">
                Test Create, Read, Update, Delete operations across different modules 
                with configurable cleanup and detailed operation tracking
              </Text>
              
              <Group>
                <Select
                  label="Test Modules"
                  value={crudTestOptions.modules}
                  onChange={(value) => setCrudTestOptions((prev: any) => ({
                    ...prev,
                    modules: value || 'notes,documents,todos,archive'
                  }))}
                  data={[
                    { value: 'notes', label: 'Notes Only' },
                    { value: 'documents', label: 'Documents Only' },
                    { value: 'todos', label: 'Todos Only' },
                    { value: 'archive', label: 'Archive Only' },
                    { value: 'notes,documents,todos,archive', label: 'All Modules' }
                  ]}
                  size="sm"
                  style={{ flex: 1 }}
                />
                <Stack gap="xs">
                  <Chip 
                    checked={crudTestOptions.cleanup}
                    onChange={(checked) => setCrudTestOptions((prev: any) => ({
                      ...prev,
                      cleanup: checked
                    }))}
                    color="green"
                    size="sm"
                  >
                    Auto Cleanup
                  </Chip>
                  <Chip 
                    checked={crudTestOptions.verbose}
                    onChange={(checked) => setCrudTestOptions((prev: any) => ({
                      ...prev,
                      verbose: checked
                    }))}
                    color="blue"
                    size="sm"
                  >
                    Verbose Output
                  </Chip>
                </Stack>
              </Group>
              
              <Button
                leftSection={<IconDatabase size={16} />}
                onClick={runCrudTest}
                loading={isLoading}
                color="purple"
                type="button"
                fullWidth
              >
                Run Full CRUD Test
              </Button>
            </Stack>
          </Collapse>
        </Stack>
      </Card>

      {/* Action Buttons */}
      <Card withBorder>
        <Group>
          <Button
            leftSection={<IconDownload size={16} />}
            onClick={downloadTestResults}
            variant="outline"
            color="blue"
            type="button"
          >
            Download Results
          </Button>
          <Button
            leftSection={<IconRefresh size={16} />}
            onClick={() => {
              setPerformanceMetrics(null);
              setDataIntegrityResults(null);
              setResourceUsage(null);
              setFileSanityResult(null);
              setCrudTestResult(null);
              setIndividualCrudResults({});
              setHealthData(null);
            }}
            variant="outline"
            color="gray"
            type="button"
          >
            Clear All Results
          </Button>
        </Group>
      </Card>

      {/* Performance Metrics Results */}
      {performanceMetrics && (
        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={5}>Performance Monitoring Results</Title>
              <Badge color={
                performanceMetrics.performance_score === 'good' ? 'green' : 
                performanceMetrics.performance_score === 'slow' ? 'orange' : 'red'
              }>
                {performanceMetrics.performance_score?.toUpperCase()}
              </Badge>
            </Group>
            
            <SimpleGrid cols={3} spacing="md">
              <Paper withBorder p="sm">
                <Stack gap="xs">
                  <Text size="sm" fw={500}>Query Performance</Text>
                  <Text size="xs">Simple: {performanceMetrics.query_timings_ms?.simple_count}ms</Text>
                  <Text size="xs">Complex: {performanceMetrics.query_timings_ms?.complex_join}ms</Text>
                  <Text size="xs">Total: {performanceMetrics.total_execution_time_ms}ms</Text>
                </Stack>
              </Paper>
              <Paper withBorder p="sm">
                <Stack gap="xs">
                  <Text size="sm" fw={500}>Database Config</Text>
                  <Text size="xs">Page Size: {performanceMetrics.database_configuration?.page_size} bytes</Text>
                  <Text size="xs">Journal: {performanceMetrics.database_configuration?.journal_mode}</Text>
                  <Text size="xs">Cache: {performanceMetrics.database_configuration?.cache_size}</Text>
                </Stack>
              </Paper>
              <Paper withBorder p="sm">
                <Stack gap="xs">
                  <Text size="sm" fw={500}>Recommendations</Text>
                  {performanceMetrics.recommendations?.slice(0, 2).map((rec: string, idx: number) => (
                    <Text key={idx} size="xs" c="dimmed">{rec}</Text>
                  ))}
                </Stack>
              </Paper>
            </SimpleGrid>
          </Stack>
        </Card>
      )}

      {/* Data Integrity Results */}
      {dataIntegrityResults && (
        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={5}>Data Integrity Validation Results</Title>
              <Badge color={dataIntegrityResults.overall_status === 'passed' ? 'green' : 
                            dataIntegrityResults.overall_status === 'warning' ? 'orange' : 'red'}>
                {dataIntegrityResults.overall_status}
              </Badge>
            </Group>
            
            <SimpleGrid cols={2} spacing="md">
              <Paper withBorder p="sm">
                <Stack gap="xs">
                  <Text size="sm" fw={500}>Checks Summary</Text>
                  <Text size="xs">Total: {dataIntegrityResults.summary?.total_checks}</Text>
                  <Text size="xs" color="green">Passed: {dataIntegrityResults.summary?.passed}</Text>
                  <Text size="xs" color="red">Issues: {dataIntegrityResults.summary?.issues}</Text>
                  <Text size="xs" color="orange">Warnings: {dataIntegrityResults.summary?.warnings}</Text>
                </Stack>
              </Paper>
              <Paper withBorder p="sm">
                <Stack gap="xs">
                  <Text size="sm" fw={500}>Validation Status</Text>
                  <Text size="xs">Checks: {dataIntegrityResults.validation_results?.checks_performed?.length || 0}</Text>
                  <Text size="xs">Passed: {dataIntegrityResults.validation_results?.passed_checks?.length || 0}</Text>
                  <Text size="xs">Issues: {dataIntegrityResults.validation_results?.issues_found?.length || 0}</Text>
                </Stack>
              </Paper>
            </SimpleGrid>
            
            {dataIntegrityResults.validation_results && (
              <Accordion>
                <Accordion.Item value="details">
                  <Accordion.Control>Validation Details</Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="xs">
                      {dataIntegrityResults.validation_results.passed_checks?.map((check: string, idx: number) => (
                        <Text key={idx} size="xs" color="green">✓ {check}</Text>
                      ))}
                      {dataIntegrityResults.validation_results.issues_found?.map((issue: string, idx: number) => (
                        <Text key={idx} size="xs" color="red">✗ {issue}</Text>
                      ))}
                      {dataIntegrityResults.validation_results.warnings?.map((warning: string, idx: number) => (
                        <Text key={idx} size="xs" color="orange">⚠ {warning}</Text>
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            )}
          </Stack>
        </Card>
      )}

      {/* Resource Usage Results */}
      {resourceUsage && (
        <Card withBorder>
          <Stack gap="md">
            <Title order={5}>Resource Monitoring Results</Title>
            <SimpleGrid cols={3} spacing="md">
              <Paper withBorder p="sm">
                <Stack gap="xs">
                  <Text size="sm" fw={500}>Memory Usage</Text>
                  <Progress 
                    value={resourceUsage.process_memory?.percent || 0} 
                    color={resourceUsage.process_memory?.percent > 80 ? 'red' : 'blue'}
                  />
                  <Text size="xs">{resourceUsage.process_memory?.rss_mb}MB RSS</Text>
                  <Text size="xs">{resourceUsage.system_resources?.memory_available_mb}MB Available</Text>
                </Stack>
              </Paper>
              <Paper withBorder p="sm">
                <Stack gap="xs">
                  <Text size="sm" fw={500}>CPU Usage</Text>
                  <Progress 
                    value={resourceUsage.process_cpu?.percent || 0} 
                    color={resourceUsage.process_cpu?.percent > 80 ? 'red' : 'green'}
                  />
                  <Text size="xs">{resourceUsage.process_cpu?.percent}% CPU</Text>
                  <Text size="xs">{resourceUsage.process_cpu?.num_threads} threads</Text>
                </Stack>
              </Paper>
              <Paper withBorder p="sm">
                <Stack gap="xs">
                  <Text size="sm" fw={500}>Disk Usage</Text>
                  <Progress 
                    value={resourceUsage.system_resources?.disk_usage_percent || 0} 
                    color={resourceUsage.system_resources?.disk_usage_percent > 90 ? 'red' : 'orange'}
                  />
                  <Text size="xs">{resourceUsage.system_resources?.disk_usage_percent}% Used</Text>
                  <Text size="xs">{resourceUsage.system_resources?.cpu_count} CPU cores</Text>
                </Stack>
              </Paper>
            </SimpleGrid>
            
            {resourceUsage.recommendations && (
              <Paper withBorder p="sm">
                <Stack gap="xs">
                  <Text size="sm" fw={500}>Recommendations</Text>
                  {resourceUsage.recommendations.map((rec: string, idx: number) => (
                    <Text key={idx} size="xs" c="dimmed">{rec}</Text>
                  ))}
                </Stack>
              </Paper>
            )}
          </Stack>
        </Card>
      )}

      {/* System Health Results */}
      {healthData && (
        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={5}>System Health Status</Title>
              <Badge color={healthData.database.connectivity === 'operational' ? 'green' : 'red'}>
                {healthData.database.connectivity}
              </Badge>
            </Group>
            
            <SimpleGrid cols={3} spacing="md">
              <Paper withBorder p="sm">
                <Stack gap="xs">
                  <Text size="sm" fw={500}>Database</Text>
                  <Badge color="blue" size="sm">SQLite {healthData.database.version}</Badge>
                  <Text size="xs" c="dimmed">
                    {healthData.system_info.table_count} tables
                  </Text>
                </Stack>
              </Paper>
              
              <Paper withBorder p="sm">
                <Stack gap="xs">
                  <Text size="sm" fw={500}>User Session</Text>
                  <Text size="xs">ID: {healthData.user_session.user_id}</Text>
                  <Text size="xs">{healthData.user_session.username}</Text>
                </Stack>
              </Paper>
              
              <Paper withBorder p="sm">
                <Stack gap="xs">
                  <Text size="sm" fw={500}>Account</Text>
                  <Text size="xs">
                    Created: {new Date(healthData.user_session.account_created).toLocaleDateString()}
                  </Text>
                </Stack>
              </Paper>
            </SimpleGrid>
          </Stack>
        </Card>
      )}

      {/* File System Test Results */}
      {fileSanityResult && (
        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={5}>File System Test Results</Title>
              <Badge color={fileSanityResult.status === 'success' ? 'green' : 'red'}>
                {fileSanityResult.status}
              </Badge>
            </Group>
            
            <Text size="sm">{fileSanityResult.message}</Text>
            
            {fileSanityResult.operations && (
              <Accordion>
                <Accordion.Item value="operations">
                  <Accordion.Control>
                    File Operations ({fileSanityResult.operations.length} steps)
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="xs">
                      {fileSanityResult.operations.map((op: any, idx: number) => (
                        <Paper key={idx} withBorder p="xs">
                          <Group justify="space-between">
                            <Text size="sm">{op.operation}</Text>
                            <Badge size="xs" color={op.success ? 'green' : 'red'}>
                              {op.success ? 'Success' : 'Failed'}
                            </Badge>
                          </Group>
                          <Text size="xs" c="dimmed">{op.details}</Text>
                          {op.duration && (
                            <Text size="xs" c="blue">Duration: {op.duration}ms</Text>
                          )}
                        </Paper>
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            )}
          </Stack>
        </Card>
      )}

      {/* CRUD Test Results */}
      {crudTestResult && (
        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={5}>CRUD Test Results</Title>
              <Badge color={
                crudTestResult.overall_status === 'all_passed' ? 'green' : 
                crudTestResult.overall_status === 'mostly_passed' ? 'blue' :
                crudTestResult.overall_status === 'partial_failure' ? 'orange' : 'red'
              }>
                {crudTestResult.overall_status?.replace('_', ' ').toUpperCase()}
              </Badge>
            </Group>
            
            {/* Test Summary */}
            {crudTestResult.test_counts && (
              <SimpleGrid cols={4} spacing="md">
                <Paper withBorder p="md" ta="center">
                  <Text size="xl" fw={700} color="blue">
                    {crudTestResult.test_counts.total_tests}
                  </Text>
                  <Text size="sm" c="dimmed">Total Tests</Text>
                </Paper>
                <Paper withBorder p="md" ta="center">
                  <Text size="xl" fw={700} color="green">
                    {crudTestResult.test_counts.passed}
                  </Text>
                  <Text size="sm" c="dimmed">Passed</Text>
                </Paper>
                <Paper withBorder p="md" ta="center">
                  <Text size="xl" fw={700} color="red">
                    {crudTestResult.test_counts.failed}
                  </Text>
                  <Text size="sm" c="dimmed">Failed</Text>
                </Paper>
                <Paper withBorder p="md" ta="center">
                  <Text size="xl" fw={700} color="purple">
                    {crudTestResult.test_counts.success_rate}%
                  </Text>
                  <Text size="sm" c="dimmed">Success Rate</Text>
                </Paper>
              </SimpleGrid>
            )}

            {/* Modules Tested */}
            <Group>
              <Text size="sm" fw={500}>Modules Tested:</Text>
              {crudTestResult.modules_tested?.map((module: string) => (
                <Badge key={module} size="sm" variant="outline">
                  {module}
                </Badge>
              ))}
            </Group>
            
            {/* Cleanup Summary */}
            {crudTestResult.cleanup_summary && (
              <Paper withBorder p="md">
                <Group justify="space-between">
                  <Text size="sm" fw={500}>Cleanup Results</Text>
                  <Badge 
                    color={crudTestResult.cleanup_performed ? 'green' : 'orange'}
                    size="sm"
                  >
                    {crudTestResult.cleanup_performed ? 'Performed' : 'Skipped'}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed">
                  {crudTestResult.cleanup_summary.note || 
                   `${crudTestResult.cleanup_summary.cleaned_count || 0} items cleaned`}
                </Text>
              </Paper>
            )}

            {/* Global Messages */}
            {crudTestResult.global_messages && crudTestResult.global_messages.length > 0 && (
              <Card withBorder>
                <Stack gap="xs">
                  <Text size="sm" fw={500}>Test Log ({crudTestResult.global_messages.length} messages)</Text>
                  <ScrollArea h={200}>
                    <Stack gap="xs">
                      {crudTestResult.global_messages.map((msg: string, idx: number) => (
                        <Text key={idx} size="xs" style={{ fontFamily: 'monospace' }}>
                          {msg}
                        </Text>
                      ))}
                    </Stack>
                  </ScrollArea>
                </Stack>
              </Card>
            )}
            
            {/* Module Results */}
            {crudTestResult.test_summary && (
              <Accordion>
                {Object.entries(crudTestResult.test_summary).map(([module, results]: [string, any]) => (
                  <Accordion.Item key={module} value={module}>
                    <Accordion.Control>
                      <Group>
                        <Badge 
                          color={results.status === 'success' ? 'green' : 'orange'}
                          size="sm"
                        >
                          {results.status}
                        </Badge>
                        <Text>{module.toUpperCase()} Module</Text>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <SimpleGrid cols={2} spacing="sm">
                        {Object.entries(results.operations || {}).map(([op, opDetails]: [string, any]) => (
                          <Paper key={op} withBorder p="sm">
                            <Group justify="space-between" mb="xs">
                              <Text size="sm" fw={500}>{op}</Text>
                              <Badge 
                                size="xs" 
                                color={opDetails.status === 'success' ? 'green' : 'red'}
                              >
                                {opDetails.status}
                              </Badge>
                            </Group>
                            {opDetails.data && (
                              <Code block>
                                {JSON.stringify(opDetails.data, null, 2)}
                              </Code>
                            )}
                            {opDetails.error && (
                              <Text size="xs" color="red">{opDetails.error}</Text>
                            )}
                          </Paper>
                        ))}
                      </SimpleGrid>
                    </Accordion.Panel>
                  </Accordion.Item>
                ))}
              </Accordion>
            )}
          </Stack>
        </Card>
      )}

      {/* Individual CRUD Results */}
      {Object.keys(individualCrudResults).length > 0 && (
        <Card withBorder>
          <Stack gap="md">
            <Title order={5}>Individual CRUD Operation Results</Title>
            <SimpleGrid cols={1} spacing="sm">
              {Object.entries(individualCrudResults).map(([operation, result]: [string, any]) => (
                <Paper key={operation} withBorder p="md">
                  <Group justify="space-between" mb="xs">
                    <Text size="sm" fw={500}>{operation.replace('_', ' ').toUpperCase()}</Text>
                    <Badge 
                      color={result.status === 'success' ? 'green' : 'red'}
                    >
                      {result.status}
                    </Badge>
                  </Group>
                  <Text size="sm">{result.message}</Text>
                  {result.note_id && (
                    <Text size="xs" c="dimmed">Note ID: {result.note_id}</Text>
                  )}
                  {result.document_id && (
                    <Text size="xs" c="dimmed">Document ID: {result.document_id}</Text>
                  )}
                  {result.todo_id && (
                    <Text size="xs" c="dimmed">Todo ID: {result.todo_id}</Text>
                  )}
                </Paper>
              ))}
            </SimpleGrid>
          </Stack>
        </Card>
      )}
    </Stack>
  );

  // Console commands tab with debugging utilities
  const renderConsoleTab = () => (
    <Stack gap="lg">
      {consoleCommands && (
        <>
          {Object.entries(consoleCommands).map(([categoryKey, category]) => {
            // Handle the category structure properly
            const categoryData = category as { title?: string; description?: string; commands?: Record<string, { description?: string; command?: string }> };
            const commands = categoryData.commands || {};
            
            return (
              <Card key={categoryKey} withBorder>
                <Stack gap="md">
                  <Title order={5}>{categoryData.title || categoryKey}</Title>
                  <Text size="sm" c="dimmed">
                    {categoryData.description || 'No description available'}
                  </Text>
                  
                  <Accordion>
                    {Object.entries(commands).map(([cmdKey, cmd]) => {
                      // Handle command structure properly
                      const command = cmd as { description?: string; command?: string };
                      
                      return (
                        <Accordion.Item key={cmdKey} value={cmdKey}>
                          <Accordion.Control>
                            {command.description || cmdKey}
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Stack gap="md">
                              <Code block style={{ fontSize: '12px' }}>
                                {command.command || 'No command available'}
                              </Code>
                              <CopyButton value={command.command || ''}>
                                {({ copied, copy }) => (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    leftSection={<IconCopy size={14} />}
                                    onClick={copy}
                                    color={copied ? 'green' : 'blue'}
                                    type="button"
                                  >
                                    {copied ? 'Copied' : 'Copy Command'}
                                  </Button>
                                )}
                              </CopyButton>
                            </Stack>
                          </Accordion.Panel>
                        </Accordion.Item>
                      );
                    })}
                  </Accordion>
                </Stack>
              </Card>
            );
          })}
        </>
      )}
    </Stack>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="100%"
      title={
        <Group>
          <IconBug size={28} />
          <Title order={2}>PKMS Advanced Testing & Debugging Suite</Title>
        </Group>
      }
      overlayProps={{ opacity: 0.55, blur: 3 }}
      styles={{
        content: { height: '95vh' },
        body: { height: 'calc(95vh - 60px)', display: 'flex', flexDirection: 'column' }
      }}
      closeOnClickOutside={false}
      closeOnEscape={true}
      trapFocus={true}
      lockScroll={true}
    >
      <Container 
        size="100%" 
        p={0} 
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <LoadingOverlay visible={isLoading && !isRunningAuthTests} />
        
        <Stack gap="lg" style={{ flex: 1 }}>
          {/* Quick Action Buttons */}
          <Group>
            <Button
              variant="outline"
              leftSection={<IconTrash size={16} />}
              onClick={clearAllData}
              color="red"
              size="sm"
              type="button"
            >
              Clear All Test Results & Data
            </Button>
            <Button
              variant="outline"
              leftSection={<IconRefresh size={16} />}
              onClick={() => window.location.reload()}
              size="sm"
              type="button"
            >
              Reload Page
            </Button>
            <Badge color="gray" size="lg">
              Testing interface loaded at {new Date().toLocaleString()}
            </Badge>
          </Group>

          {/* Main Testing Tabs */}
          <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'auth')} variant="pills">
            <Tabs.List justify="center" mb="lg">
              <Tabs.Tab value="auth" leftSection={<IconShield size={16} />}>
                Authentication
              </Tabs.Tab>
              <Tabs.Tab value="database" leftSection={<IconDatabase size={16} />}>
                Database
              </Tabs.Tab>
              <Tabs.Tab value="diary" leftSection={<IconLock size={16} />}>
                Diary
              </Tabs.Tab>
              <Tabs.Tab value="advanced" leftSection={<IconDeviceAnalytics size={16} />}>
                Advanced & System
              </Tabs.Tab>
              <Tabs.Tab value="console" leftSection={<IconTerminal size={16} />}>
                Console
              </Tabs.Tab>
            </Tabs.List>

            <Box style={{ flex: 1, overflow: 'auto' }}>
              <Tabs.Panel value="auth">
                {renderAuthTab()}
              </Tabs.Panel>

              <Tabs.Panel value="database">
                {renderDatabaseTab()}
              </Tabs.Panel>

              <Tabs.Panel value="diary">
                {renderDiaryTab()}
              </Tabs.Panel>

              <Tabs.Panel value="advanced">
                {renderAdvancedTab()}
              </Tabs.Panel>

              <Tabs.Panel value="console">
                {renderConsoleTab()}
              </Tabs.Panel>
            </Box>
          </Tabs>
        </Stack>
      </Container>
    </Modal>
  );
} 