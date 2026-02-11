function auth(req, res, next) {
  // /health endpoint is public
  if (req.path === '/v1/health') {
    return next()
  }

  const apiKey = req.headers.authorization?.replace('Bearer ', '')
  
  // Simple API key check (default: test-key)
  if (apiKey === 'test-key') {
    return next()
  }

  res.status(401).json({ error: 'Unauthorized' })
}

module.exports = { auth }