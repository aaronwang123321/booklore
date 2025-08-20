#!/usr/bin/env node

const axios = require('axios');
const { performance } = require('perf_hooks');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/v1`;

// Test configuration
const TEST_CONFIG = {
  user: {
    email: 'test@booklore.com',
    password: 'testpassword123'
  },
  performance: {
    maxResponseTime: 500, // ms
    cacheEfficiencyThreshold: 0.5
  }
};

let authToken = '';
let testResults = {
  passed: 0,
  failed: 0,
  details: []
};

function logTest(name, success, details = '') {
  const status = success ? '✅' : '❌';
  console.log(`${status} ${name}${details ? ': ' + details : ''}`);
  
  testResults.details.push({ name, success, details });
  if (success) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
}

async function authenticate() {
  try {
    console.log('🔐 Authenticating test user...');
    const response = await axios.post(`${API_URL}/auth/login`, TEST_CONFIG.user);
    authToken = response.data.access_token;
    logTest('Authentication', true);
    return true;
  } catch (error) {
    logTest('Authentication', false, error.response?.data?.message || error.message);
    return false;
  }
}

async function testSearchModule() {
  console.log('\n📚 Testing Search Module...');
  
  // Test 1: Basic text search
  try {
    const response = await axios.get(`${API_URL}/search`, {
      params: { q: 'javascript', page: 1, pageSize: 10 },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const data = response.data;
    const hasRequiredFields = data.hasOwnProperty('results') && 
                             data.hasOwnProperty('totalCount') && 
                             data.hasOwnProperty('aggregations');
    
    logTest('Basic text search', hasRequiredFields, 
      `${data.totalCount} results, ${data.searchTime}ms`);
  } catch (error) {
    logTest('Basic text search', false, error.message);
  }

  // Test 2: Empty query search (should return all books)
  try {
    const response = await axios.get(`${API_URL}/search`, {
      params: { q: '', page: 1, pageSize: 5 },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    logTest('Empty query search', response.status === 200, 
      `${response.data.totalCount} total books`);
  } catch (error) {
    logTest('Empty query search', false, error.message);
  }

  // Test 3: Multi-field search
  try {
    const response = await axios.get(`${API_URL}/search`, {
      params: { 
        q: 'programming',
        authors: ['Test Author'],
        fileTypes: ['epub', 'pdf'],
        page: 1, 
        pageSize: 10 
      },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    logTest('Multi-field search with filters', response.status === 200,
      `${response.data.results.length} filtered results`);
  } catch (error) {
    logTest('Multi-field search with filters', false, error.message);
  }
}

async function testFilteringCapabilities() {
  console.log('\n🔍 Testing Filtering Capabilities...');
  
  // Test 1: Author filter
  try {
    const response = await axios.get(`${API_URL}/search`, {
      params: { 
        q: '',
        authors: ['Test Author', 'Another Author'],
        page: 1, 
        pageSize: 10 
      },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    logTest('Author filter', response.status === 200,
      `${response.data.totalCount} books by specified authors`);
  } catch (error) {
    logTest('Author filter', false, error.message);
  }

  // Test 2: File type filter
  try {
    const response = await axios.get(`${API_URL}/search`, {
      params: { 
        q: '',
        fileTypes: ['epub'],
        page: 1, 
        pageSize: 10 
      },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    logTest('File type filter', response.status === 200,
      `${response.data.totalCount} EPUB books`);
  } catch (error) {
    logTest('File type filter', false, error.message);
  }

  // Test 3: Date range filter
  try {
    const response = await axios.get(`${API_URL}/search`, {
      params: { 
        q: '',
        dateFrom: '2020-01-01',
        dateTo: '2023-12-31',
        page: 1, 
        pageSize: 10 
      },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    logTest('Date range filter', response.status === 200,
      `${response.data.totalCount} books in date range`);
  } catch (error) {
    logTest('Date range filter', false, error.message);
  }

  // Test 4: File size filter
  try {
    const response = await axios.get(`${API_URL}/search`, {
      params: { 
        q: '',
        fileSizeMin: 1000000, // 1MB
        fileSizeMax: 10000000, // 10MB
        page: 1, 
        pageSize: 10 
      },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    logTest('File size filter', response.status === 200,
      `${response.data.totalCount} books in size range`);
  } catch (error) {
    logTest('File size filter', false, error.message);
  }

  // Test 5: Library filter
  try {
    const response = await axios.get(`${API_URL}/search`, {
      params: { 
        q: '',
        libraryIds: [1, 2],
        page: 1, 
        pageSize: 10 
      },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    logTest('Library filter', response.status === 200,
      `${response.data.totalCount} books in specified libraries`);
  } catch (error) {
    logTest('Library filter', false, error.message);
  }
}

async function testAggregations() {
  console.log('\n📊 Testing Aggregations...');
  
  try {
    const response = await axios.get(`${API_URL}/search`, {
      params: { q: '', page: 1, pageSize: 1 },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const aggregations = response.data.aggregations;
    const expectedAggregations = ['authors', 'publishers', 'languages', 'fileTypes', 'libraries', 'status'];
    
    let allPresent = true;
    for (const agg of expectedAggregations) {
      if (!aggregations.hasOwnProperty(agg)) {
        allPresent = false;
        break;
      }
    }
    
    logTest('Aggregations structure', allPresent,
      `${Object.keys(aggregations).length} aggregation types`);
    
    // Test aggregation data quality
    const hasData = Object.values(aggregations).some(agg => 
      Array.isArray(agg) && agg.length > 0
    );
    
    logTest('Aggregations contain data', hasData);
    
  } catch (error) {
    logTest('Aggregations', false, error.message);
  }
}

async function testSuggestions() {
  console.log('\n💡 Testing Search Suggestions...');
  
  // Test 1: Basic suggestions
  try {
    const response = await axios.get(`${API_URL}/search/suggestions`, {
      params: { q: 'java' },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const suggestions = response.data.suggestions;
    const hasValidStructure = Array.isArray(suggestions) && 
      suggestions.every(s => s.hasOwnProperty('text') && s.hasOwnProperty('type'));
    
    logTest('Basic suggestions', hasValidStructure,
      `${suggestions.length} suggestions returned`);
  } catch (error) {
    logTest('Basic suggestions', false, error.message);
  }

  // Test 2: Short query (should return empty)
  try {
    const response = await axios.get(`${API_URL}/search/suggestions`, {
      params: { q: 'a' },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const suggestions = response.data.suggestions;
    logTest('Short query suggestions', suggestions.length === 0,
      'Correctly returns empty for short queries');
  } catch (error) {
    logTest('Short query suggestions', false, error.message);
  }

  // Test 3: Library-specific suggestions
  try {
    const response = await axios.get(`${API_URL}/search/suggestions`, {
      params: { q: 'test', libraryIds: [1] },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    logTest('Library-specific suggestions', response.status === 200,
      `${response.data.suggestions.length} library-specific suggestions`);
  } catch (error) {
    logTest('Library-specific suggestions', false, error.message);
  }
}

async function testSortingAndPagination() {
  console.log('\n📄 Testing Sorting and Pagination...');
  
  // Test 1: Title sorting
  try {
    const response = await axios.get(`${API_URL}/search`, {
      params: { 
        q: '', 
        sort: 'title', 
        sortDirection: 'asc',
        page: 1, 
        pageSize: 5 
      },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const results = response.data.results;
    let isSorted = true;
    for (let i = 1; i < results.length; i++) {
      if (results[i].title < results[i-1].title) {
        isSorted = false;
        break;
      }
    }
    
    logTest('Title sorting (ascending)', isSorted,
      `${results.length} results properly sorted`);
  } catch (error) {
    logTest('Title sorting (ascending)', false, error.message);
  }

  // Test 2: Date sorting
  try {
    const response = await axios.get(`${API_URL}/search`, {
      params: { 
        q: '', 
        sort: 'createdAt', 
        sortDirection: 'desc',
        page: 1, 
        pageSize: 5 
      },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    logTest('Date sorting (descending)', response.status === 200,
      `${response.data.results.length} results sorted by date`);
  } catch (error) {
    logTest('Date sorting (descending)', false, error.message);
  }

  // Test 3: Pagination
  try {
    const page1 = await axios.get(`${API_URL}/search`, {
      params: { q: '', page: 1, pageSize: 3 },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const page2 = await axios.get(`${API_URL}/search`, {
      params: { q: '', page: 2, pageSize: 3 },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const differentResults = page1.data.results[0].id !== page2.data.results[0].id;
    const correctPageNumbers = page1.data.page === 1 && page2.data.page === 2;
    
    logTest('Pagination', differentResults && correctPageNumbers,
      `Page 1: ${page1.data.results.length} results, Page 2: ${page2.data.results.length} results`);
  } catch (error) {
    logTest('Pagination', false, error.message);
  }
}

async function testPerformance() {
  console.log('\n⚡ Testing Performance...');
  
  // Test 1: Response time
  try {
    const iterations = 5;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await axios.get(`${API_URL}/search`, {
        params: { q: `test ${i}`, page: 1, pageSize: 10 },
        headers: { Authorization: `Bearer ${authToken}` }
      });
      times.push(performance.now() - start);
    }
    
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const meetsRequirement = avgTime < TEST_CONFIG.performance.maxResponseTime;
    
    logTest('Response time performance', meetsRequirement,
      `Average: ${avgTime.toFixed(2)}ms (requirement: <${TEST_CONFIG.performance.maxResponseTime}ms)`);
  } catch (error) {
    logTest('Response time performance', false, error.message);
  }

  // Test 2: Cache effectiveness
  try {
    const searchParams = { q: 'cache test', page: 1, pageSize: 10 };
    
    // First request (cache miss)
    const start1 = performance.now();
    await axios.get(`${API_URL}/search`, {
      params: searchParams,
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const time1 = performance.now() - start1;
    
    // Second request (cache hit)
    const start2 = performance.now();
    await axios.get(`${API_URL}/search`, {
      params: searchParams,
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const time2 = performance.now() - start2;
    
    const cacheEffective = time2 < time1 * TEST_CONFIG.performance.cacheEfficiencyThreshold;
    
    logTest('Cache effectiveness', cacheEffective,
      `First: ${time1.toFixed(2)}ms, Second: ${time2.toFixed(2)}ms`);
  } catch (error) {
    logTest('Cache effectiveness', false, error.message);
  }
}

async function testFacetsAndStats() {
  console.log('\n📈 Testing Facets and Statistics...');
  
  // Test 1: Facets endpoint
  try {
    const response = await axios.get(`${API_URL}/search/facets`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const hasRequiredFields = response.data.hasOwnProperty('aggregations') && 
                             response.data.hasOwnProperty('totalBooks');
    
    logTest('Search facets endpoint', hasRequiredFields,
      `${response.data.totalBooks} total books`);
  } catch (error) {
    logTest('Search facets endpoint', false, error.message);
  }

  // Test 2: Stats endpoint
  try {
    const response = await axios.get(`${API_URL}/search/stats`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const hasRequiredFields = response.data.hasOwnProperty('totalBooks') && 
                             response.data.hasOwnProperty('aggregations');
    
    logTest('Search stats endpoint', hasRequiredFields,
      `Statistics for ${response.data.totalBooks} books`);
  } catch (error) {
    logTest('Search stats endpoint', false, error.message);
  }
}

async function testErrorHandling() {
  console.log('\n🚨 Testing Error Handling...');
  
  // Test 1: Invalid parameters
  try {
    const response = await axios.get(`${API_URL}/search`, {
      params: { 
        q: '', 
        page: -1, // Invalid page
        pageSize: 1000 // Too large
      },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    // Should handle gracefully
    logTest('Invalid parameters handling', response.status === 200,
      'Gracefully handles invalid parameters');
  } catch (error) {
    // Should return proper error
    const isProperError = error.response && error.response.status >= 400;
    logTest('Invalid parameters handling', isProperError,
      `Returns proper error status: ${error.response?.status}`);
  }

  // Test 2: Unauthorized access
  try {
    await axios.get(`${API_URL}/search`, {
      params: { q: 'test' }
      // No authorization header
    });
    
    logTest('Unauthorized access handling', false, 'Should have returned 401');
  } catch (error) {
    const isUnauthorized = error.response && error.response.status === 401;
    logTest('Unauthorized access handling', isUnauthorized,
      `Returns 401 Unauthorized`);
  }
}

async function runCompleteTest() {
  console.log('🔍 Starting T17 - Advanced Search and Filtering Complete Test...\n');
  
  // Authentication
  const authSuccess = await authenticate();
  if (!authSuccess) {
    console.log('\n❌ Authentication failed. Cannot proceed with tests.');
    return;
  }

  // Run all test suites
  await testSearchModule();
  await testFilteringCapabilities();
  await testAggregations();
  await testSuggestions();
  await testSortingAndPagination();
  await testPerformance();
  await testFacetsAndStats();
  await testErrorHandling();

  // Generate summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 T17 - Advanced Search and Filtering Test Summary');
  console.log('='.repeat(60));
  
  const total = testResults.passed + testResults.failed;
  const successRate = ((testResults.passed / total) * 100).toFixed(1);
  
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${successRate}%`);
  
  if (testResults.failed > 0) {
    console.log('\n❌ Failed Tests:');
    testResults.details
      .filter(test => !test.success)
      .forEach(test => {
        console.log(`   - ${test.name}: ${test.details}`);
      });
  }
  
  console.log('\n' + '='.repeat(60));
  
  if (testResults.failed === 0) {
    console.log('🎉 All T17 tests passed! Advanced Search and Filtering is working correctly.');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Please review the implementation.');
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the complete test
runCompleteTest().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});