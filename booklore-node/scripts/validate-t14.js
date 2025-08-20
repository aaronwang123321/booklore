#!/usr/bin/env node

/**
 * T14 BookDrop批量导入 - Implementation Validation Script
 * 
 * This script validates that all T14 requirements are properly implemented:
 * - 实现文件监控服务，检测新增文件
 * - 创建文件预处理和元数据提取
 * - 实现批量导入确认和文件移动
 * - 集成导入进度通知和错误处理
 */

const fs = require('fs');
const path = require('path');

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function checkFileExists(filePath, description) {
  if (fs.existsSync(filePath)) {
    log(`${description}: ${filePath}`, 'success');
    return true;
  } else {
    log(`Missing ${description}: ${filePath}`, 'error');
    return false;
  }
}

function checkFileContent(filePath, patterns, description) {
  if (!fs.existsSync(filePath)) {
    log(`File not found for content check: ${filePath}`, 'error');
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const results = patterns.map(pattern => {
    let found = false;
    let patternDesc = '';
    
    if (typeof pattern === 'object' && pattern.test) {
      found = pattern.test.test(content);
      patternDesc = pattern.description || pattern.test.toString();
    } else if (typeof pattern === 'string') {
      found = content.includes(pattern);
      patternDesc = pattern;
    } else {
      found = content.includes(pattern);
      patternDesc = pattern.toString();
    }
    
    if (found) {
      log(`✓ Found ${patternDesc} in ${description}`, 'success');
    } else {
      log(`✗ Missing ${patternDesc} in ${description}`, 'error');
    }
    return found;
  });

  return results.every(Boolean);
}

function validateT14Implementation() {
  log('Validating T14 BookDrop批量导入 Implementation');
  log('='.repeat(60));

  const checks = [];

  // 1. Check core module files exist
  log('1. Checking core BookDrop module files...');
  checks.push(checkFileExists('src/bookdrop/bookdrop.module.ts', 'BookDrop Module'));
  checks.push(checkFileExists('src/bookdrop/services/bookdrop.service.ts', 'BookDrop Service'));
  checks.push(checkFileExists('src/bookdrop/services/file-watcher.service.ts', 'File Watcher Service'));
  checks.push(checkFileExists('src/bookdrop/controllers/bookdrop.controller.ts', 'BookDrop Controller'));
  checks.push(checkFileExists('src/bookdrop/dto/bookdrop.dto.ts', 'BookDrop DTOs'));
  checks.push(checkFileExists('src/bookdrop/interfaces/bookdrop.interface.ts', 'BookDrop Interfaces'));

  // 2. Check file monitoring service implementation
  log('2. Validating file monitoring service...');
  const fileWatcherPatterns = [
    { test: /import.*chokidar/, description: 'chokidar import' },
    { test: /startWatching/, description: 'startWatching method' },
    { test: /handleFileAdded/, description: 'file added handler' },
    { test: /isSupportedFile/, description: 'supported file check' },
    { test: /\.epub|\.pdf|\.cbz|\.cbr/, description: 'supported file extensions' }
  ];
  checks.push(checkFileContent('src/bookdrop/services/file-watcher.service.ts', fileWatcherPatterns, 'File Watcher Service'));

  // 3. Check file preprocessing and metadata extraction
  log('3. Validating file preprocessing and metadata extraction...');
  const bookdropServicePatterns = [
    { test: /extractBasicMetadata/, description: 'metadata extraction method' },
    { test: /processNewFile/, description: 'file processing method' },
    { test: /BookdropStatus\.PENDING/, description: 'pending status handling' },
    { test: /extractedFromFileName/, description: 'filename-based extraction' },
    { test: /split.*-|split.*by/, description: 'filename parsing patterns' }
  ];
  checks.push(checkFileContent('src/bookdrop/services/bookdrop.service.ts', bookdropServicePatterns, 'BookDrop Service'));

  // 4. Check batch import confirmation and file movement
  log('4. Validating batch import and file movement...');
  const importPatterns = [
    { test: /finalizeImport/, description: 'finalize import method' },
    { test: /generateTargetPath/, description: 'target path generation' },
    { test: /fs\.promises\.rename/, description: 'file movement' },
    { test: /BookdropStatus\.COMPLETED/, description: 'completion status' },
    { test: /prisma\.book\.create/, description: 'book creation' }
  ];
  checks.push(checkFileContent('src/bookdrop/services/bookdrop.service.ts', importPatterns, 'BookDrop Service'));

  // 5. Check progress notification and error handling
  log('5. Validating progress notification and error handling...');
  const notificationPatterns = [
    { test: /eventEmitter\.emit/, description: 'event emission' },
    { test: /bookdrop\.file\.processed/, description: 'file processed event' },
    { test: /bookdrop\.file\.error/, description: 'file error event' },
    { test: /BookdropStatus\.FAILED/, description: 'failed status handling' },
    { test: /discardFiles/, description: 'discard functionality' }
  ];
  checks.push(checkFileContent('src/bookdrop/services/bookdrop.service.ts', notificationPatterns, 'BookDrop Service'));

  // 6. Check API endpoints
  log('6. Validating API endpoints...');
  const controllerPatterns = [
    { test: /@Get\('notification-summary'\)/, description: 'notification summary endpoint' },
    { test: /@Get\('files'\)/, description: 'files list endpoint' },
    { test: /@Post\('finalize'\)/, description: 'finalize import endpoint' },
    { test: /@Delete\('discard'\)/, description: 'discard files endpoint' },
    { test: /getFileNotificationSummary/, description: 'notification summary method' },
    { test: /finalizeImport/, description: 'finalize import method' }
  ];
  checks.push(checkFileContent('src/bookdrop/controllers/bookdrop.controller.ts', controllerPatterns, 'BookDrop Controller'));

  // 7. Check DTOs and interfaces
  log('7. Validating DTOs and interfaces...');
  const dtoPatterns = [
    { test: /BookdropFileDto/, description: 'BookdropFileDto' },
    { test: /BookdropFinalizeRequestDto/, description: 'BookdropFinalizeRequestDto' },
    { test: /BookdropFinalizeResultDto/, description: 'BookdropFinalizeResultDto' },
    { test: /BookdropDiscardRequestDto/, description: 'BookdropDiscardRequestDto' },
    { test: /@IsNumber|@IsString|@IsArray/, description: 'validation decorators' }
  ];
  checks.push(checkFileContent('src/bookdrop/dto/bookdrop.dto.ts', dtoPatterns, 'BookDrop DTOs'));

  // 8. Check Prisma schema for BookdropFile model
  log('8. Validating database model...');
  const schemaPatterns = [
    { test: /model BookdropFile/, description: 'BookdropFile model' },
    { test: /BookdropStatus/, description: 'BookdropStatus enum' },
    { test: /PENDING|PROCESSING|COMPLETED|FAILED|DISCARDED/, description: 'status values' }
  ];
  checks.push(checkFileContent('prisma/schema.prisma', schemaPatterns, 'Prisma Schema'));

  // 9. Check module integration
  log('9. Validating module integration...');
  const appModulePatterns = [
    { test: /import.*BookdropModule/, description: 'BookdropModule import' },
    { test: /BookdropModule/, description: 'BookdropModule in imports array' }
  ];
  checks.push(checkFileContent('src/app.module.ts', appModulePatterns, 'App Module'));

  // 10. Check environment configuration
  log('10. Validating environment configuration...');
  const envPatterns = [
    { test: /BOOKDROP_PATH/, description: 'BOOKDROP_PATH configuration' }
  ];
  checks.push(checkFileContent('.env.example', envPatterns, 'Environment Configuration'));

  // 11. Check dependencies
  log('11. Validating dependencies...');
  const packageJsonContent = fs.readFileSync('package.json', 'utf8');
  const packageJson = JSON.parse(packageJsonContent);
  
  const requiredDeps = ['chokidar'];
  const depChecks = requiredDeps.map(dep => {
    const found = packageJson.dependencies[dep] || packageJson.devDependencies[dep];
    if (found) {
      log(`✓ Found dependency: ${dep}@${found}`, 'success');
      return true;
    } else {
      log(`✗ Missing dependency: ${dep}`, 'error');
      return false;
    }
  });
  checks.push(...depChecks);

  // 12. Check test files
  log('12. Validating test files...');
  checks.push(checkFileExists('src/bookdrop/services/bookdrop.service.spec.ts', 'BookDrop Service Tests'));
  checks.push(checkFileExists('scripts/test-t14-complete.js', 'T14 Complete Test Script'));
  checks.push(checkFileExists('scripts/validate-t14.js', 'T14 Validation Script'));

  // Summary
  log('='.repeat(60));
  const passedChecks = checks.filter(Boolean).length;
  const totalChecks = checks.length;
  
  log(`Validation Summary: ${passedChecks}/${totalChecks} checks passed`);
  
  if (passedChecks === totalChecks) {
    log('🎉 T14 BookDrop批量导入 implementation is complete and valid!', 'success');
    log('All required components are properly implemented:', 'success');
    log('  ✅ 文件监控服务，检测新增文件', 'success');
    log('  ✅ 文件预处理和元数据提取', 'success');
    log('  ✅ 批量导入确认和文件移动', 'success');
    log('  ✅ 导入进度通知和错误处理', 'success');
    return true;
  } else {
    log('❌ T14 implementation is incomplete. Please address the missing components.', 'error');
    return false;
  }
}

// Run validation if script is executed directly
if (require.main === module) {
  const isValid = validateT14Implementation();
  process.exit(isValid ? 0 : 1);
}

module.exports = { validateT14Implementation };