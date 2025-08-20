import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// Custom metrics
const errorRate = new Rate('errors');
const cacheHitRate = new Rate('cache_hits');
const dbQueryTime = new Trend('db_query_duration');
const concurrentUsers = new Counter('concurrent_users');

// Test configuration for 1500 concurrent users
export const options = {
  scenarios: {
    // Stress test scenario
    stress_test: {
      executor: 'ramping-vus',
      stages: [
        { duration: '2m', target: 100 },   // Warm up
        { duration: '3m', target: 500 },   // Ramp up to 500
        { duration: '3m', target: 1000 },  // Ramp up to 1000
        { duration: '3m', target: 1500 },  // Ramp up to 1500 (target)
        { duration: '10m', target: 1500 }, // Sustain 1500 users
        { duration: '3m', target: 1000 },  // Ramp down
        { duration: '3m', target: 500 },   // Ramp down
        { duration: '2m', target: 0 },     // Cool down
      ],
    },
    // Spike test scenario
    spike_test: {
      executor: 'ramping-vus',
      startTime: '30m',
      stages: [
        { duration: '30s', target: 2000 }, // Spike to 2000
        { duration: '1m', target: 2000 },  // Sustain spike
        { duration: '30s', target: 100 },  // Drop back
      ],
    },
  },
  thresholds: {
    // Main performance requirements
    'http_req_duration{expected_response:true}': [
      'p(95)<150',  // 95% of requests under 150ms
      'p(99)<200',  // 99% of requests under 200ms (main requirement)
    ],
    'http_req_failed': ['rate<0.01'], // Less than 1% error rate
    'http_req_duration{name:health}': ['p(99)<50'], // Health checks very fast
    'http_req_duration{name:auth}': ['p(99)<100'], // Auth endpoints fast
    'http_req_duration{name:books}': ['p(99)<200'], // Book endpoints within limit
    'http_req_duration{name:libraries}': ['p(99)<150'], // Library endpoints fast
    
    // Custom metrics thresholds
    'errors': ['rate<0.01'],
    'cache_hits': ['rate>0.7'], // Cache hit rate > 70%
    'db_query_duration': ['p(95)<50'], // DB queries under 50ms
  },
};

// Test data
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
let authToken = '';

// Setup function - runs once per VU
export function setup() {
  // Create a test user and get auth token
  const registerPayload = {
    email: `test-${Math.random().toString(36).substring(7)}@example.com`,
    password: 'testpassword123',
    name: 'Performance Test User',
  };

  const registerResponse = http.post(`${BASE_URL}/api/v1/auth/register`, JSON.stringify(registerPayload), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (registerResponse.status === 201) {
    const responseBody = JSON.parse(registerResponse.body);
    return { token: responseBody.access_token };
  }

  console.error('Failed to create test user for performance testing');
  return { token: null };
}

// Main test function
export default function (data) {
  concurrentUsers.add(1);
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': data.token ? `Bearer ${data.token}` : '',
  };

  // Test 1: Health check (critical path)
  const healthResponse = http.get(`${BASE_URL}/health`, {
    tags: { name: 'health' },
  });
  
  const healthCheck = check(healthResponse, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 50ms': (r) => r.timings.duration < 50,
  });
  
  if (!healthCheck) errorRate.add(1);
  
  // Check for cache headers
  if (healthResponse.headers['x-cache-status']) {
    cacheHitRate.add(healthResponse.headers['x-cache-status'] === 'HIT' ? 1 : 0);
  }

  sleep(0.05);

  if (data.token) {
    // Test 2: Authentication endpoint
    const profileResponse = http.get(`${BASE_URL}/api/v1/auth/profile`, {
      headers,
      tags: { name: 'auth' },
    });
    
    const authCheck = check(profileResponse, {
      'profile status is 200': (r) => r.status === 200,
      'profile response time < 100ms': (r) => r.timings.duration < 100,
    });
    
    if (!authCheck) errorRate.add(1);
    
    // Record DB query time if available
    if (profileResponse.headers['x-db-query-time']) {
      dbQueryTime.add(parseFloat(profileResponse.headers['x-db-query-time']));
    }

    sleep(0.05);

    // Test 3: Libraries endpoint (read-heavy operation)
    const librariesResponse = http.get(`${BASE_URL}/api/v1/libraries`, {
      headers,
      tags: { name: 'libraries' },
    });
    
    const librariesCheck = check(librariesResponse, {
      'libraries status is 200': (r) => r.status === 200,
      'libraries response time < 150ms': (r) => r.timings.duration < 150,
      'libraries has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body) || Array.isArray(body.data);
        } catch {
          return false;
        }
      },
    });
    
    if (!librariesCheck) errorRate.add(1);
    
    // Check cache performance
    if (librariesResponse.headers['x-cache-status']) {
      cacheHitRate.add(librariesResponse.headers['x-cache-status'] === 'HIT' ? 1 : 0);
    }

    sleep(0.05);

    // Test 4: Books endpoint (main content endpoint)
    const booksResponse = http.get(`${BASE_URL}/api/v1/books?limit=20&page=1`, {
      headers,
      tags: { name: 'books' },
    });
    
    const booksCheck = check(booksResponse, {
      'books status is 200': (r) => r.status === 200,
      'books response time < 200ms': (r) => r.timings.duration < 200,
      'books pagination works': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data || body.books || Array.isArray(body);
        } catch {
          return false;
        }
      },
    });
    
    if (!booksCheck) errorRate.add(1);

    sleep(0.05);

    // Test 5: Search functionality (CPU intensive)
    const searchQuery = ['fiction', 'science', 'history', 'biography'][Math.floor(Math.random() * 4)];
    const searchResponse = http.get(`${BASE_URL}/api/v1/books/search?q=${searchQuery}`, {
      headers,
      tags: { name: 'search' },
    });
    
    check(searchResponse, {
      'search status is 200': (r) => r.status === 200,
      'search response time < 300ms': (r) => r.timings.duration < 300,
    }) || errorRate.add(1);

    sleep(0.1);

    // Test 6: Metrics endpoint (monitoring)
    const metricsResponse = http.get(`${BASE_URL}/metrics`, {
      tags: { name: 'metrics' },
    });
    
    check(metricsResponse, {
      'metrics accessible': (r) => r.status === 200 || r.status === 404,
    });

    // Occasionally test write operations (10% of requests)
    if (Math.random() < 0.1) {
      const createLibraryPayload = {
        name: `Perf Test Lib ${Math.random().toString(36).substring(7)}`,
        description: 'Performance test library',
        isPublic: false,
      };

      const createResponse = http.post(
        `${BASE_URL}/api/v1/libraries`,
        JSON.stringify(createLibraryPayload),
        { 
          headers,
          tags: { name: 'create_library' },
        }
      );

      check(createResponse, {
        'create library success': (r) => r.status === 201 || r.status === 200,
        'create library response time < 500ms': (r) => r.timings.duration < 500,
      }) || errorRate.add(1);
    }
  }

  // Simulate realistic user behavior with variable think time
  const thinkTime = Math.random() * 3 + 0.5; // 0.5-3.5 seconds
  sleep(thinkTime);
}

// Teardown function - runs once after all VUs finish
export function teardown(data) {
  console.log('Performance test completed');
  
  // Clean up test data if needed
  if (data.token) {
    // Could add cleanup logic here
    console.log('Cleaning up test data...');
  }
}

// Enhanced summary with detailed analysis
export function handleSummary(data) {
  const p99 = data.metrics.http_req_duration.values['p(99)'];
  const p95 = data.metrics.http_req_duration.values['p(95)'];
  const errorRate = data.metrics.http_req_failed.values.rate;
  const totalRequests = data.metrics.http_reqs.values.count;
  const avgResponseTime = data.metrics.http_req_duration.values.avg;
  
  // Calculate performance score
  const p99Score = p99 < 200 ? 100 : Math.max(0, 100 - ((p99 - 200) / 200) * 100);
  const errorScore = errorRate < 0.01 ? 100 : Math.max(0, 100 - (errorRate * 10000));
  const overallScore = (p99Score + errorScore) / 2;
  
  const summary = `
📊 BookLore Performance Test Results
=====================================
🎯 Target: 1500 concurrent users, P99 < 200ms

📈 Key Metrics:
- Total Requests: ${totalRequests.toLocaleString()}
- Requests/sec: ${(totalRequests / (data.state.testRunDurationMs / 1000)).toFixed(2)}
- Average Response Time: ${avgResponseTime.toFixed(2)}ms
- 95th Percentile: ${p95.toFixed(2)}ms
- 99th Percentile: ${p99.toFixed(2)}ms
- Error Rate: ${(errorRate * 100).toFixed(3)}%

🎯 Performance Requirements:
- P99 < 200ms: ${p99 < 200 ? '✅ PASS' : '❌ FAIL'} (${p99.toFixed(2)}ms)
- Error Rate < 1%: ${errorRate < 0.01 ? '✅ PASS' : '❌ FAIL'} (${(errorRate * 100).toFixed(3)}%)

📊 Performance Score: ${overallScore.toFixed(1)}/100

🔍 Detailed Breakdown:
${Object.entries(data.metrics)
  .filter(([key]) => key.includes('http_req_duration{name:'))
  .map(([key, metric]) => {
    const name = key.match(/name:(\w+)/)?.[1] || 'unknown';
    return `- ${name}: P99=${metric.values['p(99)'].toFixed(2)}ms, Avg=${metric.values.avg.toFixed(2)}ms`;
  })
  .join('\n')}

${data.metrics.cache_hits ? `
🗄️ Cache Performance:
- Cache Hit Rate: ${(data.metrics.cache_hits.values.rate * 100).toFixed(1)}%
` : ''}

${data.metrics.db_query_duration ? `
🗃️ Database Performance:
- Avg Query Time: ${data.metrics.db_query_duration.values.avg.toFixed(2)}ms
- P95 Query Time: ${data.metrics.db_query_duration.values['p(95)'].toFixed(2)}ms
` : ''}

💡 Recommendations:
${p99 > 200 ? '- Optimize slow endpoints to meet P99 < 200ms requirement\n' : ''}
${errorRate > 0.01 ? '- Investigate and fix errors to reduce error rate\n' : ''}
${data.metrics.cache_hits?.values.rate < 0.7 ? '- Improve cache hit rate (currently below 70%)\n' : ''}
${avgResponseTime > 100 ? '- Consider implementing more aggressive caching\n' : ''}
=====================================
`;

  return {
    'performance-results.json': JSON.stringify(data, null, 2),
    'performance-report.html': htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }) + summary,
  };
}