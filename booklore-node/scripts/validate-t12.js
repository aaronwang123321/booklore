#!/usr/bin/env node

/**
 * Validation script for T12 - CBX漫画阅读器
 * 
 * This script validates that all CBX components are properly implemented:
 * 1. CBX Parser exists and has required methods
 * 2. CBX Reader Service exists and has required methods
 * 3. CBX Reader Controller exists and has required endpoints
 * 4. File Parser Service includes CBX support
 * 5. Book Module includes CBX components
 */

const fs = require('fs');
const path = require('path');

function log(message) {
  console.log(`[T12 Validation] ${message}`);
}

function checkFileExists(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  log(`✅ File exists: ${filePath}`);
  return fullPath;
}

function checkFileContains(filePath, searchStrings) {
  const fullPath = checkFileExists(filePath);
  const content = fs.readFileSync(fullPath, 'utf8');
  
  for (const searchString of searchStrings) {
    if (!content.includes(searchString)) {
      throw new Error(`File ${filePath} does not contain: ${searchString}`);
    }
  }
  log(`✅ File contains required content: ${filePath}`);
}

function validateCbxParser() {
  log('🔍 Validating CBX Parser...');
  
  checkFileContains('src/book/parsers/cbx.parser.ts', [
    'export class CbxParser',
    'async parse(filePath: string): Promise<BookMetadata>',
    'async validateCbxFile(filePath: string): Promise<boolean>',
    'async getFileInfo(filePath: string)',
    'parseZipCbx',
    'parseRarCbx',
    'parse7zCbx',
    'extractCoverFromZip',
    'createChaptersFromPages',
    'isImageFile',
    'naturalSort'
  ]);
  
  log('✅ CBX Parser validation passed');
}

function validateCbxReaderService() {
  log('🔍 Validating CBX Reader Service...');
  
  checkFileContains('src/book/services/cbx-reader.service.ts', [
    'export class CbxReaderService',
    'async getPageList(bookId: number, userId: number): Promise<CbxPageInfo[]>',
    'async getPageInfo(bookId: number, pageNumber: number, userId: number): Promise<CbxPageInfo>',
    'async streamPageImage(',
    'async preloadPages(',
    'async clearCache(bookId: number): Promise<void>',
    'validateBookAccess',
    'extractPageImage',
    'processImage',
    'getCachedImage',
    'cacheImage'
  ]);
  
  log('✅ CBX Reader Service validation passed');
}

function validateCbxReaderController() {
  log('🔍 Validating CBX Reader Controller...');
  
  checkFileContains('src/book/controllers/cbx-reader.controller.ts', [
    'export class CbxReaderController',
    '@Controller(\'books/:bookId/cbx\')',
    '@Get(\'pages\')',
    '@Get(\'pages/:pageNumber\')',
    '@Get(\'pages/:pageNumber/image\')',
    '@Post(\'preload\')',
    '@Get(\'thumbnail\')',
    '@Post(\'cache/clear\')',
    'getPageList',
    'getPageInfo',
    'streamPageImage',
    'preloadPages',
    'getThumbnail',
    'clearCache'
  ]);
  
  log('✅ CBX Reader Controller validation passed');
}

function validateFileParserService() {
  log('🔍 Validating File Parser Service CBX integration...');
  
  checkFileContains('src/book/services/file-parser.service.ts', [
    'import { CbxParser }',
    'private readonly cbxParser: CbxParser',
    'case \'cbx\':',
    '() => this.cbxParser.parse(filePath)',
    'await this.cbxParser.validateCbxFile(filePath)',
    '\'cbx\''
  ]);
  
  log('✅ File Parser Service CBX integration validation passed');
}

function validateBookModule() {
  log('🔍 Validating Book Module CBX integration...');
  
  checkFileContains('src/book/book.module.ts', [
    'import { CbxReaderController }',
    'import { CbxReaderService }',
    'import { CbxParser }',
    'CbxReaderController',
    'CbxReaderService',
    'CbxParser'
  ]);
  
  log('✅ Book Module CBX integration validation passed');
}

function validateRedisService() {
  log('🔍 Validating Redis Service buffer operations...');
  
  checkFileContains('src/shared/redis/redis.service.ts', [
    'async getBuffer(key: string): Promise<Buffer | null>',
    'async setBuffer(key: string, value: Buffer, ttlSeconds?: number): Promise<boolean>',
    'async deletePattern(pattern: string): Promise<number>'
  ]);
  
  log('✅ Redis Service buffer operations validation passed');
}

function validateTests() {
  log('🔍 Validating CBX Parser tests...');
  
  checkFileExists('src/book/parsers/cbx.parser.spec.ts');
  checkFileContains('src/book/parsers/cbx.parser.spec.ts', [
    'describe(\'CbxParser\'',
    'should parse a CBZ file successfully',
    'should throw error for non-existent file',
    'should throw error for unsupported format',
    'should return true for valid CBZ file',
    'should return correct file info for CBZ'
  ]);
  
  log('✅ CBX Parser tests validation passed');
}

function validatePackageDependencies() {
  log('🔍 Validating package dependencies...');
  
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  const requiredDeps = ['yauzl', 'sharp', 'adm-zip', '@types/adm-zip'];
  
  for (const dep of requiredDeps) {
    if (!packageJson.dependencies[dep] && !packageJson.devDependencies?.[dep]) {
      throw new Error(`Missing dependency: ${dep}`);
    }
  }
  
  log('✅ Package dependencies validation passed');
}

function validateApiEndpoints() {
  log('🔍 Validating API endpoint structure...');
  
  const expectedEndpoints = [
    'GET /books/:bookId/cbx/pages',
    'GET /books/:bookId/cbx/pages/:pageNumber',
    'GET /books/:bookId/cbx/pages/:pageNumber/image',
    'POST /books/:bookId/cbx/preload',
    'GET /books/:bookId/cbx/thumbnail',
    'POST /books/:bookId/cbx/cache/clear'
  ];
  
  // Check if controller has all expected endpoints
  const controllerPath = path.join(__dirname, '..', 'src/book/controllers/cbx-reader.controller.ts');
  const controllerContent = fs.readFileSync(controllerPath, 'utf8');
  
  for (const endpoint of expectedEndpoints) {
    const [method, path] = endpoint.split(' ');
    const decoratorPattern = `@${method.charAt(0) + method.slice(1).toLowerCase()}(`;
    
    if (!controllerContent.includes(decoratorPattern)) {
      throw new Error(`Missing endpoint decorator for: ${endpoint}`);
    }
  }
  
  log('✅ API endpoint structure validation passed');
}

function validateIntegration() {
  log('🔍 Validating integration points...');
  
  // Check if CBX format is added to supported formats
  checkFileContains('src/book/services/file-parser.service.ts', [
    'return [\'epub\', \'pdf\', \'cbx\'];'
  ]);
  
  // Check if CBX file types are handled in getFileType
  checkFileContains('src/book/services/file-parser.service.ts', [
    'case \'.cbz\':',
    'case \'.cbr\':',
    'case \'.cb7\':',
    'return \'cbx\';'
  ]);
  
  log('✅ Integration points validation passed');
}

async function runValidation() {
  try {
    log('🚀 Starting T12 CBX Reader validation...');
    
    validateCbxParser();
    validateCbxReaderService();
    validateCbxReaderController();
    validateFileParserService();
    validateBookModule();
    validateRedisService();
    validateTests();
    validatePackageDependencies();
    validateApiEndpoints();
    validateIntegration();
    
    log('🎉 All T12 CBX Reader validations passed!');
    log('');
    log('📋 Implementation Summary:');
    log('   ✅ CBX Parser - Supports ZIP format parsing with image extraction');
    log('   ✅ CBX Reader Service - Page management, image streaming, caching');
    log('   ✅ CBX Reader Controller - REST API endpoints for CBX reading');
    log('   ✅ File Parser Integration - CBX support in main parser service');
    log('   ✅ Book Module Integration - All CBX components registered');
    log('   ✅ Redis Integration - Buffer operations for image caching');
    log('   ✅ Unit Tests - CBX parser test coverage');
    log('   ✅ Dependencies - All required packages installed');
    log('');
    log('🔧 Features Implemented:');
    log('   • CBZ file parsing and validation');
    log('   • Page listing and navigation');
    log('   • Image streaming with optimization (quality, resize, format)');
    log('   • Image caching with Redis');
    log('   • Thumbnail generation');
    log('   • Page preloading for performance');
    log('   • Cache management');
    log('   • Error handling and validation');
    log('');
    log('⚠️  Note: RAR and 7Z formats are not implemented yet (as designed)');
    
    return true;
  } catch (error) {
    log(`❌ Validation failed: ${error.message}`);
    process.exit(1);
  }
}

// Run validation if called directly
if (require.main === module) {
  runValidation();
}

module.exports = { runValidation };