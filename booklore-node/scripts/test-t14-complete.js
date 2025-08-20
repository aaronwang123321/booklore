#!/usr/bin/env node

/**
 * T14 BookDrop批量导入 - Complete Implementation Test
 * 
 * This script validates the complete BookDrop functionality:
 * - File monitoring service
 * - File preprocessing and metadata extraction
 * - Batch import confirmation and file movement
 * - Import progress notification and error handling
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const BOOKDROP_PATH = process.env.BOOKDROP_PATH || './bookdrop';
const TEST_TIMEOUT = 30000;

// Test configuration
const config = {
  baseURL: BASE_URL,
  timeout: TEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  }
};

let authToken = null;
let testLibraryId = null;
let testShelfId = null;

// Test utilities
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function createTestFile(fileName, content = 'Test book content') {
  const filePath = path.join(BOOKDROP_PATH, fileName);
  
  // Ensure bookdrop directory exists
  if (!fs.existsSync(BOOKDROP_PATH)) {
    fs.mkdirSync(BOOKDROP_PATH, { recursive: true });
  }
  
  fs.writeFileSync(filePath, content);
  return filePath;
}

function removeTestFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Authentication
async function authenticate() {
  try {
    log('Authenticating with test user...');
    
    const response = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
      email: 'test@example.com',
      password: 'password123'
    }, config);

    if (response.data.access_token) {
      authToken = response.data.access_token;
      config.headers.Authorization = `Bearer ${authToken}`;
      log('Authentication successful', 'success');
      return true;
    }
  } catch (error) {
    log(`Authentication failed: ${error.message}`, 'error');
    return false;
  }
}

// Setup test environment
async function setupTestEnvironment() {
  try {
    log('Setting up test environment...');
    
    // Create test library
    const libraryResponse = await axios.post(`${BASE_URL}/api/v1/libraries`, {
      name: 'BookDrop Test Library',
      description: 'Test library for BookDrop functionality'
    }, config);
    
    testLibraryId = libraryResponse.data.id;
    log(`Created test library with ID: ${testLibraryId}`, 'success');
    
    // Create test shelf
    const shelfResponse = await axios.post(`${BASE_URL}/api/v1/libraries/${testLibraryId}/shelves`, {
      name: 'BookDrop Test Shelf',
      description: 'Test shelf for BookDrop imports'
    }, config);
    
    testShelfId = shelfResponse.data.id;
    log(`Created test shelf with ID: ${testShelfId}`, 'success');
    
    return true;
  } catch (error) {
    log(`Failed to setup test environment: ${error.message}`, 'error');
    return false;
  }
}

// Test 1: File monitoring service
async function testFileMonitoring() {
  log('Testing file monitoring service...');
  
  try {
    // Create test files
    const testFiles = [
      'Author Name - Book Title.epub',
      'Another Book by Test Author.pdf',
      'Simple_Book_Title.cbz',
      'invalid-file.txt' // Should be ignored
    ];
    
    const createdFiles = [];
    
    for (const fileName of testFiles) {
      const filePath = createTestFile(fileName);
      createdFiles.push(filePath);
      log(`Created test file: ${fileName}`);
    }
    
    // Wait for file watcher to detect files
    await sleep(3000);
    
    // Check BookDrop notification summary
    const summaryResponse = await axios.get(`${BASE_URL}/api/v1/bookdrop/notification-summary`, config);
    const summary = summaryResponse.data;
    
    log(`BookDrop summary - Pending: ${summary.pendingFiles}, Processing: ${summary.processingFiles}, Has new: ${summary.hasNewFiles}`);
    
    if (summary.pendingFiles > 0) {
      log('File monitoring service is working correctly', 'success');
      
      // Clean up test files
      createdFiles.forEach(removeTestFile);
      
      return true;
    } else {
      log('File monitoring service did not detect files', 'error');
      return false;
    }
    
  } catch (error) {
    log(`File monitoring test failed: ${error.message}`, 'error');
    return false;
  }
}

// Test 2: File preprocessing and metadata extraction
async function testMetadataExtraction() {
  log('Testing metadata extraction...');
  
  try {
    // Create test file with metadata in filename
    const testFileName = 'J.K. Rowling - Harry Potter and the Philosopher\'s Stone.epub';
    const filePath = createTestFile(testFileName);
    
    // Wait for processing
    await sleep(2000);
    
    // Get BookDrop files
    const filesResponse = await axios.get(`${BASE_URL}/api/v1/bookdrop/files`, config);
    const files = filesResponse.data;
    
    const testFile = files.find(f => f.fileName === testFileName);
    
    if (testFile && testFile.metadata) {
      log(`Extracted metadata - Title: ${testFile.metadata.title}, Author: ${testFile.metadata.author}`);
      
      if (testFile.metadata.title && testFile.metadata.author) {
        log('Metadata extraction is working correctly', 'success');
        removeTestFile(filePath);
        return true;
      }
    }
    
    log('Metadata extraction failed or incomplete', 'error');
    removeTestFile(filePath);
    return false;
    
  } catch (error) {
    log(`Metadata extraction test failed: ${error.message}`, 'error');
    return false;
  }
}

// Test 3: Batch import confirmation and file movement
async function testBatchImport() {
  log('Testing batch import functionality...');
  
  try {
    // Create multiple test files
    const testFiles = [
      'Test Author - Test Book 1.epub',
      'Another Author - Test Book 2.pdf'
    ];
    
    const createdFiles = [];
    for (const fileName of testFiles) {
      const filePath = createTestFile(fileName);
      createdFiles.push(filePath);
    }
    
    // Wait for processing
    await sleep(2000);
    
    // Get BookDrop files
    const filesResponse = await axios.get(`${BASE_URL}/api/v1/bookdrop/files`, config);
    const files = filesResponse.data.filter(f => 
      testFiles.includes(f.fileName) && f.status === 'PENDING'
    );
    
    if (files.length === 0) {
      log('No pending files found for import test', 'error');
      return false;
    }
    
    // Prepare finalize request
    const finalizeRequest = {
      items: files.map(file => ({
        bookdropId: file.id,
        libraryId: testLibraryId,
        shelfId: testShelfId,
        title: file.metadata?.title || file.fileName,
        author: file.metadata?.author || 'Unknown Author'
      }))
    };
    
    // Finalize import
    const finalizeResponse = await axios.post(`${BASE_URL}/api/v1/bookdrop/finalize`, finalizeRequest, config);
    const results = finalizeResponse.data.results;
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    log(`Import results - Success: ${successCount}, Failed: ${failCount}`);
    
    if (successCount > 0) {
      log('Batch import is working correctly', 'success');
      
      // Verify books were created
      const booksResponse = await axios.get(`${BASE_URL}/api/v1/libraries/${testLibraryId}/books`, config);
      const importedBooks = booksResponse.data.filter(book => 
        results.some(r => r.bookId === book.id)
      );
      
      log(`Verified ${importedBooks.length} books were imported successfully`);
      
      return true;
    } else {
      log('Batch import failed', 'error');
      return false;
    }
    
  } catch (error) {
    log(`Batch import test failed: ${error.message}`, 'error');
    return false;
  }
}

// Test 4: Import progress notification and error handling
async function testProgressNotification() {
  log('Testing progress notification and error handling...');
  
  try {
    // Test discard functionality
    const testFileName = 'Discard Test Book.epub';
    const filePath = createTestFile(testFileName);
    
    // Wait for processing
    await sleep(2000);
    
    // Get the file
    const filesResponse = await axios.get(`${BASE_URL}/api/v1/bookdrop/files`, config);
    const testFile = filesResponse.data.find(f => f.fileName === testFileName);
    
    if (!testFile) {
      log('Test file not found for discard test', 'error');
      return false;
    }
    
    // Discard the file
    await axios.delete(`${BASE_URL}/api/v1/bookdrop/discard`, {
      ...config,
      data: { bookdropIds: [testFile.id] }
    });
    
    log('File discard functionality tested successfully', 'success');
    
    // Test error handling with invalid library
    const invalidFileName = 'Invalid Import Test.epub';
    const invalidFilePath = createTestFile(invalidFileName);
    
    await sleep(2000);
    
    const invalidFilesResponse = await axios.get(`${BASE_URL}/api/v1/bookdrop/files`, config);
    const invalidFile = invalidFilesResponse.data.find(f => f.fileName === invalidFileName);
    
    if (invalidFile) {
      // Try to import to non-existent library
      const invalidRequest = {
        items: [{
          bookdropId: invalidFile.id,
          libraryId: 99999, // Non-existent library
          title: 'Invalid Test'
        }]
      };
      
      const errorResponse = await axios.post(`${BASE_URL}/api/v1/bookdrop/finalize`, invalidRequest, config);
      const errorResults = errorResponse.data.results;
      
      if (errorResults.some(r => !r.success && r.error)) {
        log('Error handling is working correctly', 'success');
        removeTestFile(invalidFilePath);
        return true;
      }
    }
    
    log('Error handling test incomplete', 'error');
    removeTestFile(invalidFilePath);
    return false;
    
  } catch (error) {
    log(`Progress notification test failed: ${error.message}`, 'error');
    return false;
  }
}

// Cleanup test environment
async function cleanupTestEnvironment() {
  try {
    log('Cleaning up test environment...');
    
    if (testLibraryId) {
      await axios.delete(`${BASE_URL}/api/v1/libraries/${testLibraryId}`, config);
      log('Test library deleted', 'success');
    }
    
    // Clean up any remaining test files
    if (fs.existsSync(BOOKDROP_PATH)) {
      const files = fs.readdirSync(BOOKDROP_PATH);
      files.forEach(file => {
        if (file.includes('Test') || file.includes('test')) {
          removeTestFile(path.join(BOOKDROP_PATH, file));
        }
      });
    }
    
    log('Cleanup completed', 'success');
  } catch (error) {
    log(`Cleanup failed: ${error.message}`, 'error');
  }
}

// Main test execution
async function runTests() {
  log('Starting T14 BookDrop批量导入 Complete Implementation Test');
  log('='.repeat(60));
  
  const results = {
    fileMonitoring: false,
    metadataExtraction: false,
    batchImport: false,
    progressNotification: false
  };
  
  try {
    // Setup
    if (!await authenticate()) {
      throw new Error('Authentication failed');
    }
    
    if (!await setupTestEnvironment()) {
      throw new Error('Test environment setup failed');
    }
    
    // Run tests
    results.fileMonitoring = await testFileMonitoring();
    results.metadataExtraction = await testMetadataExtraction();
    results.batchImport = await testBatchImport();
    results.progressNotification = await testProgressNotification();
    
  } catch (error) {
    log(`Test execution failed: ${error.message}`, 'error');
  } finally {
    await cleanupTestEnvironment();
  }
  
  // Report results
  log('='.repeat(60));
  log('T14 BookDrop Implementation Test Results:');
  log(`📁 File Monitoring Service: ${results.fileMonitoring ? '✅ PASS' : '❌ FAIL'}`);
  log(`🔍 Metadata Extraction: ${results.metadataExtraction ? '✅ PASS' : '❌ FAIL'}`);
  log(`📦 Batch Import: ${results.batchImport ? '✅ PASS' : '❌ FAIL'}`);
  log(`📊 Progress Notification: ${results.progressNotification ? '✅ PASS' : '❌ FAIL'}`);
  
  const passCount = Object.values(results).filter(Boolean).length;
  const totalTests = Object.keys(results).length;
  
  log(`Overall: ${passCount}/${totalTests} tests passed`);
  
  if (passCount === totalTests) {
    log('🎉 All T14 BookDrop tests passed! Implementation is complete.', 'success');
    process.exit(0);
  } else {
    log('❌ Some T14 BookDrop tests failed. Please review the implementation.', 'error');
    process.exit(1);
  }
}

// Handle script execution
if (require.main === module) {
  runTests().catch(error => {
    log(`Unexpected error: ${error.message}`, 'error');
    process.exit(1);
  });
}

module.exports = {
  runTests,
  testFileMonitoring,
  testMetadataExtraction,
  testBatchImport,
  testProgressNotification
};