#!/usr/bin/env node

/**
 * Test script for T12 - CBX漫画阅读器
 * 
 * This script validates the CBX reader implementation by testing:
 * 1. CBX file parsing (ZIP format)
 * 2. Page extraction and listing
 * 3. Image streaming and optimization
 * 4. Caching functionality
 * 5. API endpoints
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = 'cbx-test@example.com';
const TEST_PASSWORD = 'testpassword123';

let authToken = '';
let testLibraryId = null;
let testBookId = null;

async function log(message) {
  console.log(`[CBX Test] ${new Date().toISOString()} - ${message}`);
}

async function createTestUser() {
  try {
    await axios.post(`${BASE_URL}/auth/register`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: 'CBX Test User',
    });
    log('✅ Test user created');
  } catch (error) {
    if (error.response?.status === 409) {
      log('ℹ️  Test user already exists');
    } else {
      throw error;
    }
  }
}

async function loginUser() {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    
    authToken = response.data.access_token;
    log('✅ User logged in successfully');
    return authToken;
  } catch (error) {
    log(`❌ Login failed: ${error.message}`);
    throw error;
  }
}

async function createTestLibrary() {
  try {
    const response = await axios.post(
      `${BASE_URL}/libraries`,
      {
        name: 'CBX Test Library',
        description: 'Library for testing CBX functionality',
        isPublic: false,
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    
    testLibraryId = response.data.id;
    log(`✅ Test library created with ID: ${testLibraryId}`);
    return testLibraryId;
  } catch (error) {
    log(`❌ Failed to create test library: ${error.message}`);
    throw error;
  }
}

async function createMockCbzFile() {
  const AdmZip = require('adm-zip');
  
  try {
    const zip = new AdmZip();
    
    // Create mock comic pages (simple text files for testing)
    for (let i = 1; i <= 5; i++) {
      // Create a simple mock image file (just text content for testing)
      const mockImageContent = Buffer.from(`Mock image data for page ${i}`);
      zip.addFile(`page${i.toString().padStart(3, '0')}.jpg`, mockImageContent);
    }
    
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const cbzPath = path.join(tempDir, 'test-comic.cbz');
    zip.writeZip(cbzPath);
    
    log('✅ Mock CBZ file created');
    return cbzPath;
  } catch (error) {
    log(`❌ Failed to create mock CBZ file: ${error.message}`);
    throw error;
  }
}

async function uploadCbxBook() {
  try {
    const cbzPath = await createMockCbzFile();
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(cbzPath));
    formData.append('title', 'Test Comic Book');
    formData.append('author', 'Test Author');
    formData.append('libraryId', testLibraryId.toString());
    
    const response = await axios.post(
      `${BASE_URL}/books`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          ...formData.getHeaders(),
        },
      }
    );
    
    testBookId = response.data.id;
    log(`✅ CBX book uploaded with ID: ${testBookId}`);
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return testBookId;
  } catch (error) {
    log(`❌ Failed to upload CBX book: ${error.message}`);
    throw error;
  }
}

async function testCbxPageList() {
  try {
    const response = await axios.get(
      `${BASE_URL}/books/${testBookId}/cbx/pages`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    
    const { pages, totalPages } = response.data;
    
    if (totalPages !== 5) {
      throw new Error(`Expected 5 pages, got ${totalPages}`);
    }
    
    if (pages.length !== 5) {
      throw new Error(`Expected 5 pages in array, got ${pages.length}`);
    }
    
    // Validate page structure
    const firstPage = pages[0];
    if (firstPage.pageNumber !== 1 || firstPage.totalPages !== 5) {
      throw new Error('Invalid page structure');
    }
    
    log('✅ CBX page list test passed');
    return pages;
  } catch (error) {
    log(`❌ CBX page list test failed: ${error.message}`);
    throw error;
  }
}

async function testCbxPageInfo() {
  try {
    const response = await axios.get(
      `${BASE_URL}/books/${testBookId}/cbx/pages/3`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    
    const pageInfo = response.data;
    
    if (pageInfo.pageNumber !== 3) {
      throw new Error(`Expected page number 3, got ${pageInfo.pageNumber}`);
    }
    
    if (pageInfo.totalPages !== 5) {
      throw new Error(`Expected total pages 5, got ${pageInfo.totalPages}`);
    }
    
    if (pageInfo.nextPage !== 4) {
      throw new Error(`Expected next page 4, got ${pageInfo.nextPage}`);
    }
    
    if (pageInfo.previousPage !== 2) {
      throw new Error(`Expected previous page 2, got ${pageInfo.previousPage}`);
    }
    
    log('✅ CBX page info test passed');
    return pageInfo;
  } catch (error) {
    log(`❌ CBX page info test failed: ${error.message}`);
    throw error;
  }
}

async function testCbxImageStreaming() {
  try {
    // Test basic image streaming
    const response = await axios.get(
      `${BASE_URL}/books/${testBookId}/cbx/pages/1/image`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        responseType: 'arraybuffer',
      }
    );
    
    if (response.headers['content-type'] !== 'image/jpeg') {
      throw new Error(`Expected image/jpeg, got ${response.headers['content-type']}`);
    }
    
    if (response.data.length === 0) {
      throw new Error('Empty image response');
    }
    
    log('✅ CBX basic image streaming test passed');
    
    // Test image with parameters
    const optimizedResponse = await axios.get(
      `${BASE_URL}/books/${testBookId}/cbx/pages/2/image?quality=70&maxWidth=600&format=webp`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        responseType: 'arraybuffer',
      }
    );
    
    if (optimizedResponse.headers['content-type'] !== 'image/webp') {
      throw new Error(`Expected image/webp, got ${optimizedResponse.headers['content-type']}`);
    }
    
    log('✅ CBX optimized image streaming test passed');
    
    return true;
  } catch (error) {
    log(`❌ CBX image streaming test failed: ${error.message}`);
    throw error;
  }
}

async function testCbxThumbnail() {
  try {
    const response = await axios.get(
      `${BASE_URL}/books/${testBookId}/cbx/thumbnail?width=150&height=200`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        responseType: 'arraybuffer',
      }
    );
    
    if (response.headers['content-type'] !== 'image/jpeg') {
      throw new Error(`Expected image/jpeg, got ${response.headers['content-type']}`);
    }
    
    if (response.data.length === 0) {
      throw new Error('Empty thumbnail response');
    }
    
    log('✅ CBX thumbnail test passed');
    return true;
  } catch (error) {
    log(`❌ CBX thumbnail test failed: ${error.message}`);
    throw error;
  }
}

async function testCbxPreloading() {
  try {
    const response = await axios.post(
      `${BASE_URL}/books/${testBookId}/cbx/preload`,
      {
        startPage: 1,
        endPage: 3,
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    
    if (response.data.message !== 'Preloading started') {
      throw new Error(`Unexpected response: ${response.data.message}`);
    }
    
    log('✅ CBX preloading test passed');
    return true;
  } catch (error) {
    log(`❌ CBX preloading test failed: ${error.message}`);
    throw error;
  }
}

async function testCbxCacheOperations() {
  try {
    // First, load an image to populate cache
    await axios.get(
      `${BASE_URL}/books/${testBookId}/cbx/pages/1/image`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        responseType: 'arraybuffer',
      }
    );
    
    // Clear cache
    const response = await axios.post(
      `${BASE_URL}/books/${testBookId}/cbx/cache/clear`,
      {},
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    
    if (response.data.message !== 'Cache cleared successfully') {
      throw new Error(`Unexpected response: ${response.data.message}`);
    }
    
    log('✅ CBX cache operations test passed');
    return true;
  } catch (error) {
    log(`❌ CBX cache operations test failed: ${error.message}`);
    throw error;
  }
}

async function testErrorHandling() {
  try {
    // Test invalid page number
    try {
      await axios.get(
        `${BASE_URL}/books/${testBookId}/cbx/pages/999/image`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      throw new Error('Should have failed for invalid page number');
    } catch (error) {
      if (error.response?.status !== 400) {
        throw new Error(`Expected 400 error, got ${error.response?.status}`);
      }
    }
    
    // Test invalid quality parameter
    try {
      await axios.get(
        `${BASE_URL}/books/${testBookId}/cbx/pages/1/image?quality=150`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      throw new Error('Should have failed for invalid quality');
    } catch (error) {
      if (error.response?.status !== 400) {
        throw new Error(`Expected 400 error, got ${error.response?.status}`);
      }
    }
    
    log('✅ CBX error handling test passed');
    return true;
  } catch (error) {
    log(`❌ CBX error handling test failed: ${error.message}`);
    throw error;
  }
}

async function cleanup() {
  try {
    // Delete test book
    if (testBookId) {
      await axios.delete(
        `${BASE_URL}/books/${testBookId}`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      log('✅ Test book deleted');
    }
    
    // Delete test library
    if (testLibraryId) {
      await axios.delete(
        `${BASE_URL}/libraries/${testLibraryId}`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      log('✅ Test library deleted');
    }
    
    // Clean up temp files
    const tempDir = path.join(__dirname, '../temp');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      log('✅ Temp files cleaned up');
    }
    
  } catch (error) {
    log(`⚠️  Cleanup warning: ${error.message}`);
  }
}

async function runTests() {
  try {
    log('🚀 Starting CBX Reader Tests (T12)');
    
    // Setup
    await createTestUser();
    await loginUser();
    await createTestLibrary();
    await uploadCbxBook();
    
    // Core functionality tests
    await testCbxPageList();
    await testCbxPageInfo();
    await testCbxImageStreaming();
    await testCbxThumbnail();
    await testCbxPreloading();
    await testCbxCacheOperations();
    await testErrorHandling();
    
    log('🎉 All CBX Reader tests passed!');
    
    // Cleanup
    await cleanup();
    
    return true;
  } catch (error) {
    log(`💥 Test failed: ${error.message}`);
    
    // Attempt cleanup even on failure
    await cleanup();
    
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };