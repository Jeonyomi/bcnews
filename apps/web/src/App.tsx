// [이전 코드는 그대로...]

// API 호출 부분만 수정
useEffect(() => {
  const fetchNews = async () => {
    try {
      const res = await fetch('http://127.0.0.1:3001/v1/news', {
        headers: {
          'Authorization': 'Bearer test-key'
        }
      })
      const data = await res.json()
      setNews(data.items || [])
      setStats({
        total: data.items?.length || 0,
        filtered: data.items?.length || 0
      })
    } catch (error) {
      console.error('Failed to fetch news:', error)
    }
  }

  fetchNews()
  const interval = setInterval(fetchNews, 30000) // Refresh every 30s
  return () => clearInterval(interval)
}, [])

// [나머지 코드는 그대로...]