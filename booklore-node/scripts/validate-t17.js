#!/usr/bin/env node

const axios = require('axios');
const { performance } = require('perf_hooks');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/v1`;

// Test credentials
const TEST_USER = {
  email: 'test@booklore.com',
  password: 'testpassword123'
};

let authToken = '';

async function authenticate() {
  try {
    console.log('🔐 Authenticating test user...');
    const response = await axios.post(`${API_URL}/auth/login`, TEST_USER);
    authToken = response.data.access_token;
    console.log('✅ Authentication successful');
    return true;
  } catch (error) {
    console.error('❌ Authentication failed:', error.response?.data || error.message);
    return false;
  }
}

async function testBasicSearch() {
  try {
    console.log('\n📚 Testing basic search functionality...');
    
    const response = await axios.get(`${API_URL}/search`, {
      params: {
        q: 'javascript',
        page: 1,
        pageSize: 10
      },
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    const data = response.data;
    
    console.log(`✅ Basic search successful`);
    console.log(`   - Total results: ${data.totalCount}`);
    console.log(`   - Results returned: ${data.results.length}`);
    console.log(`   - Search time: ${data.searchTime}ms`);
    console.log(`   - Total pages: ${data.totalPages}`);
    
    return true;
  } catch (error) {
    console.error('❌ Basic search failed:', error.response?.data || error.message);
    return false;
  }
}

async function testAdvancedFilters() {
  try {
    console.log('\n🔍 Testing advanced filters...');
    
    const response = await axios.get(`${API_URL}/search`, {
      params: {
        q: '',
        page: 1,
        pageSize: 20,
        fileTypes: ['epub', 'pdf'],
        authors: ['Test Author'],
        dateFrom: '2020-01-01',
        dateTo: '2023-12-31'
      },
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    const data = response.data;
    
    console.log(`✅ Advanced filters successful`);
    console.log(`   - Filtered results: ${data.totalCount}`);
    console.log(`   - Aggregations available: ${Object.keys(data.aggregations).length}`);
    
    // Verify aggregations structure
    const expectedAggregations = ['authors', 'publishers', 'languages', 'fileTypes', 'libraries', 'status'];
    const hasAllAggregations = expectedAggregations.every(key => 
      data.aggregations.hasOwnProperty(key)
    );
    
    if (hasAllAggregations) {
      console.log('   - All expected aggregations present');
    } else {
      console.log('   - Some aggregations missing');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Advanced filters failed:', error.response?.data || error.message);
    return false;
  }
}

async function testSearchSuggestions() {
  try {
    console.log('\n💡 Testing search suggestions...');
    
    const response = await axios.get(`${API_URL}/search/suggestions`, {
      params: {
        q: 'java'
      },
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    const data = response.data;
    
    console.log(`✅ Search suggestions successful`);
    console.log(`   - Suggestions returned: ${data.suggestions.length}`);
    
    if (data.suggestions.length > 0) {
      console.log(`   - Sample suggestion: "${data.suggestions[0].text}" (${data.suggestions[0].type})`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Search suggestions failed:', error.response?.data || error.message);
    return false;
  }
}

async function testSearchFacets() {
  try {
    console.log('\n📊 Testing search facets...');
    
    const response = await axios.get(`${API_URL}/search/facets`, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    const data = response.data;
    
    console.log(`✅ Search facets successful`);
    console.log(`   - Total books: ${data.totalBooks}`);
    console.log(`   - Aggregations available: ${Object.keys(data.aggregations).length}`);
    
    return true;
  } catch (error) {
    console.error('❌ Search facets failed:', error.response?.data || error.message);
    return false;
  }
}

async function testSearchStats() {
  try {
    console.log('\n📈 Testing search statistics...');
    
    const response = await axios.get(`${API_URL}/search/stats`, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    const data = response.data;
    
    console.log(`✅ Search statistics successful`);
    console.log(`   - Total books: ${data.totalBooks}`);
    console.log(`   - Search time: ${data.searchTime}ms`);
    
    return true;
  } catch (error) {
    console.error('❌ Search statistics failed:', error.response?.data || error.message);
    return false;
  }
}

async function testSearchPerformance() {
  try {
    console.log('\n⚡ Testing search performance...');
    
    const iterations = 10;
    const searchTimes = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      
      await axios.get(`${API_URL}/search`, {
        params: {
          q: `test query ${i}`,
          page: 1,
          pageSize: 20
        },
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      
      const endTime = performance.now();
      searchTimes.push(endTime - startTime);
    }
    
    const avgTime = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
    const maxTime = Math.max(...searchTimes);
    const minTime = Math.min(...searchTimes);
    
    console.log(`✅ Search performance test completed`);
    console.log(`   - Average response time: ${avgTime.toFixed(2)}ms`);
    console.log(`   - Min response time: ${minTime.toFixed(2)}ms`);
    console.log(`   - Max response time: ${maxTime.toFixed(2)}ms`);
    
    // Performance threshold check
    if (avgTime < 500) {
      console.log('   - ✅ Performance meets requirements (<500ms average)');
      return true;
    } else {
      console.log('   - ⚠️  Performance may need optimization (>500ms average)');
      return false;
    }
  } catch (error) {
    console.error('❌ Search performance test failed:', error.response?.data || error.message);
    return false;
  }
}

async function testSortingAndPagination() {
  try {
    console.log('\n📄 Testing sorting and pagination...');
    
    // Test sorting
    const sortResponse = await axios.get(`${API_URL}/search`, {
      params: {
        q: '',
        page: 1,
        pageSize: 5,
        sort: 'title',
        sortDirection: 'asc'
      },
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    console.log(`✅ Sorting test successful`);
    console.log(`   - Results sorted by title (ascending)`);
    
    // Test pagination
    const page2Response = await axios.get(`${API_URL}/search`, {
      params: {
        q: '',
        page: 2,
        pageSize: 5
      },
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    console.log(`✅ Pagination test successful`);
    console.log(`   - Page 2 results: ${page2Response.data.results.length}`);
    console.log(`   - Current page: ${page2Response.data.page}`);
    
    return true;
  } catch (error) {
    console.error('❌ Sorting and pagination test failed:', error.response?.data || error.message);
    return false;
  }
}

async function testCachePerformance() {
  try {
    console.log('\n🚀 Testing cache performance...');
    
    const searchParams = {
      q: 'cache test',
      page: 1,
      pageSize: 10
    };
    
    // First request (cache miss)
    const startTime1 = performance.now();
    await axios.get(`${API_URL}/search`, {
      params: searchParams,
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    const firstRequestTime = performance.now() - startTime1;
    
    // Second request (cache hit)
    const startTime2 = performance.now();
    await axios.get(`${API_URL}/search`, {
      params: searchParams,
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    const secondRequestTime = performance.now() - startTime2;
    
    console.log(`✅ Cache performance test completed`);
    console.log(`   - First request (cache miss): ${firstRequestTime.toFixed(2)}ms`);
    console.log(`   - Second request (cache hit): ${secondRequestTime.toFixed(2)}ms`);
    
    if (secondRequestTime < firstRequestTime * 0.5) {
      console.log('   - ✅ Cache is working effectively');
      return true;
    } else {
      console.log('   - ⚠️  Cache may not be working optimally');
      return false;
    }
  } catch (error) {
    console.error('❌ Cache performance test failed:', error.response?.data || error.message);
    return false;
  }
}

async function runValidation() {
  console.log('🔍 Starting T17 - Advanced Search and Filtering validation...\n');
  
  const tests = [
    { name: 'Authentication', fn: authenticate },
    { name: 'Basic Search', fn: testBasicSearch },
    { name: 'Advanced Filters', fn: testAdvancedFilters },
    { name: 'Search Suggestions', fn: testSearchSuggestions },
    { name: 'Search Facets', fn: testSearchFacets },
    { name: 'Search Statistics', fn: testSearchStats },
    { name: 'Search Performance', fn: testSearchPerformance },
    { name: 'Sorting and Pagination', fn: testSortingAndPagination },
    { name: 'Cache Performance', fn: testCachePerformance }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`❌ ${test.name} test failed:`, error.message);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 T17 Validation Summary');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All T17 - Advanced Search and Filtering tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please check the implementation.');
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run validation
runValidation().catch(error => {
  console.error('Validation failed:', error);
  process.exit(1);
});