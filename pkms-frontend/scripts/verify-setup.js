#!/usr/bin/env node

/**
 * PKMS Frontend Setup Verification Script
 * 
 * This script verifies that all necessary files and configurations are in place
 * for the PKMS frontend application to run properly.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkFile(filePath, description) {
  const fullPath = path.join(projectRoot, filePath);
  if (fs.existsSync(fullPath)) {
    log(`✅ ${description}`, 'green');
    return true;
  } else {
    log(`❌ ${description} - Missing: ${filePath}`, 'red');
    return false;
  }
}

function checkDirectory(dirPath, description) {
  const fullPath = path.join(projectRoot, dirPath);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    log(`✅ ${description}`, 'green');
    return true;
  } else {
    log(`❌ ${description} - Missing: ${dirPath}`, 'red');
    return false;
  }
}

function checkPackageJson() {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    log(`❌ package.json not found`, 'red');
    return false;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Check required dependencies
    const requiredDeps = [
      '@mantine/core',
      '@mantine/dates',
      '@mantine/dropzone',
      '@mantine/form',
      '@mantine/hooks',
      '@mantine/notifications',
      '@tabler/icons-react',
      '@tanstack/react-query',
      'axios',
      'react',
      'react-dom',
      'react-router-dom',
      'zustand'
    ];

    const requiredDevDeps = [
      '@testing-library/jest-dom',
      '@testing-library/react',
      '@testing-library/user-event',
      '@vitejs/plugin-react',
      '@vitest/coverage-v8',
      '@vitest/ui',
      'jsdom',
      'msw',
      'typescript',
      'vite',
      'vitest'
    ];

    let allDepsPresent = true;

    requiredDeps.forEach(dep => {
      if (packageJson.dependencies && packageJson.dependencies[dep]) {
        log(`✅ Dependency: ${dep}`, 'green');
      } else {
        log(`❌ Missing dependency: ${dep}`, 'red');
        allDepsPresent = false;
      }
    });

    requiredDevDeps.forEach(dep => {
      if (packageJson.devDependencies && packageJson.devDependencies[dep]) {
        log(`✅ Dev dependency: ${dep}`, 'green');
      } else {
        log(`❌ Missing dev dependency: ${dep}`, 'red');
        allDepsPresent = false;
      }
    });

    // Check scripts
    const requiredScripts = ['dev', 'build', 'test', 'test:coverage', 'test:ui'];
    requiredScripts.forEach(script => {
      if (packageJson.scripts && packageJson.scripts[script]) {
        log(`✅ Script: ${script}`, 'green');
      } else {
        log(`❌ Missing script: ${script}`, 'red');
        allDepsPresent = false;
      }
    });

    return allDepsPresent;
  } catch (error) {
    log(`❌ Error reading package.json: ${error.message}`, 'red');
    return false;
  }
}

function main() {
  log('\n🔍 PKMS Frontend Setup Verification\n', 'bold');

  let allChecksPassed = true;

  // Check configuration files
  log('\n📋 Configuration Files:', 'blue');
  allChecksPassed &= checkFile('package.json', 'Package configuration');
  allChecksPassed &= checkFile('vitest.config.ts', 'Vitest configuration');
  allChecksPassed &= checkFile('tsconfig.json', 'TypeScript configuration');
  allChecksPassed &= checkFile('vite.config.ts', 'Vite configuration');

  // Check source structure
  log('\n📁 Source Structure:', 'blue');
  allChecksPassed &= checkDirectory('src', 'Source directory');
  allChecksPassed &= checkDirectory('src/components', 'Components directory');
  allChecksPassed &= checkDirectory('src/pages', 'Pages directory');
  allChecksPassed &= checkDirectory('src/stores', 'Stores directory');
  allChecksPassed &= checkDirectory('src/services', 'Services directory');
  allChecksPassed &= checkDirectory('src/types', 'Types directory');
  allChecksPassed &= checkDirectory('src/utils', 'Utils directory');
  allChecksPassed &= checkDirectory('src/hooks', 'Hooks directory');

  // Check test structure
  log('\n🧪 Test Structure:', 'blue');
  allChecksPassed &= checkDirectory('src/test', 'Test configuration');
  allChecksPassed &= checkFile('src/test/setup.ts', 'Test setup');
  allChecksPassed &= checkFile('src/test/server.ts', 'MSW server');
  allChecksPassed &= checkFile('src/test/testUtils.tsx', 'Test utilities');
  allChecksPassed &= checkDirectory('src/components/__tests__', 'Component tests');
  allChecksPassed &= checkDirectory('src/stores/__tests__', 'Store tests');

  // Check key components
  log('\n🧩 Key Components:', 'blue');
  allChecksPassed &= checkFile('src/components/common/ActionMenu.tsx', 'ActionMenu component');
  allChecksPassed &= checkFile('src/components/common/LoadingSkeleton.tsx', 'LoadingSkeleton component');
  allChecksPassed &= checkFile('src/components/common/DateRangePicker.tsx', 'DateRangePicker component');
  allChecksPassed &= checkFile('src/components/todos/TodoCard.tsx', 'TodoCard component');
  allChecksPassed &= checkFile('src/components/todos/TodoForm.tsx', 'TodoForm component');
  allChecksPassed &= checkFile('src/components/search/UnifiedSearchEmbedded.tsx', 'UnifiedSearchEmbedded component');

  // Check stores
  log('\n🗄️ Stores:', 'blue');
  allChecksPassed &= checkFile('src/stores/todosStore.ts', 'Todos store');
  allChecksPassed &= checkFile('src/stores/notesStore.ts', 'Notes store');
  allChecksPassed &= checkFile('src/stores/backupStore.ts', 'Backup store');
  allChecksPassed &= checkFile('src/stores/tagsStore.ts', 'Tags store');
  allChecksPassed &= checkFile('src/stores/authStore.ts', 'Auth store');

  // Check pages
  log('\n📄 Pages:', 'blue');
  allChecksPassed &= checkFile('src/pages/TodosPage.tsx', 'Todos page');
  allChecksPassed &= checkFile('src/pages/TodosPageNew.tsx', 'New Todos page');
  allChecksPassed &= checkFile('src/pages/BackupPage.tsx', 'Backup page');
  allChecksPassed &= checkFile('src/pages/TagsPage.tsx', 'Tags page');
  allChecksPassed &= checkFile('src/pages/SettingsPage.tsx', 'Settings page');

  // Check types
  log('\n📝 Types:', 'blue');
  allChecksPassed &= checkFile('src/types/enums.ts', 'Enums');
  allChecksPassed &= checkFile('src/types/common.ts', 'Common types');
  allChecksPassed &= checkFile('src/types/todo.ts', 'Todo types');
  allChecksPassed &= checkFile('src/types/project.ts', 'Project types');
  allChecksPassed &= checkFile('src/types/note.ts', 'Note types');

  // Check services
  log('\n🔧 Services:', 'blue');
  allChecksPassed &= checkFile('src/services/BaseService.ts', 'Base service');
  allChecksPassed &= checkFile('src/services/todosService.ts', 'Todos service');
  allChecksPassed &= checkFile('src/services/backupService.ts', 'Backup service');
  allChecksPassed &= checkFile('src/services/tagsService.ts', 'Tags service');

  // Check utilities
  log('\n🛠️ Utilities:', 'blue');
  allChecksPassed &= checkFile('src/utils/dragAndDrop.ts', 'Drag and drop utilities');
  allChecksPassed &= checkFile('src/utils/nepaliConstants.ts', 'Nepali constants');
  allChecksPassed &= checkFile('src/utils/nepaliDateCache.ts', 'Nepali date cache');
  allChecksPassed &= checkFile('src/theme/colors.ts', 'Theme colors');

  // Check package.json dependencies
  log('\n📦 Dependencies:', 'blue');
  allChecksPassed &= checkPackageJson();

  // Summary
  log('\n📊 Summary:', 'blue');
  if (allChecksPassed) {
    log('\n🎉 All checks passed! The PKMS frontend is properly set up.', 'green');
    log('\nNext steps:', 'yellow');
    log('1. Run: npm install', 'yellow');
    log('2. Run: npm run dev', 'yellow');
    log('3. Run: npm test', 'yellow');
    log('4. Run: npm run test:coverage', 'yellow');
  } else {
    log('\n⚠️  Some checks failed. Please review the missing files and dependencies.', 'red');
    log('\nCommon fixes:', 'yellow');
    log('1. Run: npm install', 'yellow');
    log('2. Check file paths and names', 'yellow');
    log('3. Verify all components are created', 'yellow');
  }

  log('\n', 'reset');
}

main();
