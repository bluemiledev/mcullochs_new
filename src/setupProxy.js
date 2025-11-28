const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/reet_python',
    createProxyMiddleware({
      target: 'https://smartdatalink.com.au',
      changeOrigin: true,
      secure: true,
      logLevel: 'debug',
      onProxyReq: (proxyReq, req, res) => {
        console.log('Proxying request to:', proxyReq.path);
      },
      onProxyRes: (proxyRes, req, res) => {
        // Add CORS headers if needed
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
      },
      onError: (err, req, res) => {
        console.error('Proxy error:', err);
      }
    })
  );
};
