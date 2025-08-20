// Artillery processor for custom logic and metrics

module.exports = {
  // Custom functions available in scenarios
  generateRandomEmail,
  generateRandomString,
  logResponse,
  validatePerformance,
  
  // Hooks
  beforeRequest,
  afterResponse,
};

function generateRandomEmail(context, events, done) {
  context.vars.randomEmail = `test-${Math.random().toString(36).substring(7)}@example.com`;
  return done();
}

function generateRandomString(context, events, done) {
  context.vars.randomString = Math.random().toString(36).substring(7);
  return done();
}

function logResponse(requestParams, response, context, events, done) {
  // Log slow responses
  if (response.timings && response.timings.response > 200) {
    console.log(`SLOW RESPONSE: ${requestParams.url} - ${response.timings.response}ms`);
  }
  
  // Log errors
  if (response.statusCode >= 400) {
    console.log(`ERROR: ${requestParams.url} - ${response.statusCode} - ${response.body}`);
  }
  
  return done();
}

function validatePerformance(requestParams, response, context, events, done) {
  // Custom performance validation
  const responseTime = response.timings ? response.timings.response : 0;
  
  // Emit custom metrics
  events.emit('customStat', {
    stat: 'response_time_by_endpoint',
    value: responseTime,
    tags: {
      endpoint: requestParams.url,
      method: requestParams.method || 'GET',
    }
  });
  
  // Check cache headers
  if (response.headers && response.headers['x-cache-status']) {
    events.emit('customStat', {
      stat: 'cache_hit_rate',
      value: response.headers['x-cache-status'] === 'HIT' ? 1 : 0,
    });
  }
  
  // Check database query time
  if (response.headers && response.headers['x-db-query-time']) {
    events.emit('customStat', {
      stat: 'db_query_time',
      value: parseFloat(response.headers['x-db-query-time']),
    });
  }
  
  return done();
}

function beforeRequest(requestParams, context, events, done) {
  // Add request ID for tracing
  requestParams.headers = requestParams.headers || {};
  requestParams.headers['X-Request-ID'] = `artillery-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  // Add user agent
  requestParams.headers['User-Agent'] = 'Artillery-Performance-Test/1.0';
  
  return done();
}

function afterResponse(requestParams, response, context, events, done) {
  // Validate response structure for API endpoints
  if (requestParams.url.includes('/api/v1/')) {
    try {
      const body = JSON.parse(response.body);
      
      // Check for standard API response structure
      if (response.statusCode === 200 && !body.data && !Array.isArray(body) && !body.id) {
        console.warn(`Unexpected API response structure for ${requestParams.url}`);
      }
    } catch (e) {
      if (response.statusCode === 200) {
        console.warn(`Invalid JSON response for ${requestParams.url}`);
      }
    }
  }
  
  // Track memory usage if available
  if (response.headers && response.headers['x-memory-usage']) {
    events.emit('customStat', {
      stat: 'memory_usage',
      value: parseInt(response.headers['x-memory-usage']),
    });
  }
  
  return done();
}