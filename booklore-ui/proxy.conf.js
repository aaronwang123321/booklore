const PROXY_CONFIG = {
  '/api/**': {
    target: 'http://localhost:3000',
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
    bypass: function(req, res, proxyOptions) {
      console.log('Proxy request:', req.url);
      console.log('Target:', proxyOptions.target);
    }
  }
};

module.exports = PROXY_CONFIG;