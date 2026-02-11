const express = require('express')
const cors = require('cors')
const { auth } = require('./auth/middleware')
const newsRoutes = require('./news/routes')

const app = express()
app.use(cors())
app.use(express.json())

// Health check (public)
app.get('/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() })
})

// Apply auth middleware to all routes except /health
app.use(auth)

// Routes
app.use(newsRoutes)

const port = process.env.PORT || 3001
app.listen(port, '127.0.0.1', () => {
  console.log(`Server listening at http://127.0.0.1:${port}`)
})