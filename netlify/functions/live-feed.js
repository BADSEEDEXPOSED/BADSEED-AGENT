// BADSEED AGENT - Live Activity Feed
// Returns recent agent activity for the live output panel

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        activities: [],
        stats: {},
        message: 'Activity logging not configured'
      })
    }
  }

  try {
    const params = event.queryStringParameters || {}
    const limit = Math.min(parseInt(params.limit) || 20, 50)

    // Get recent activities
    const activitiesRes = await fetch(`${UPSTASH_URL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['LRANGE', 'badseed:agent:activity', '0', String(limit - 1)])
    })

    const activitiesData = await activitiesRes.json()
    const activities = (activitiesData.result || []).map(a => JSON.parse(a))

    // Get today's stats
    const today = new Date().toISOString().split('T')[0]
    const statsRes = await fetch(`${UPSTASH_URL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['HGETALL', `badseed:agent:stats:${today}`])
    })

    const statsData = await statsRes.json()
    const statsArray = statsData.result || []
    const stats = {}
    for (let i = 0; i < statsArray.length; i += 2) {
      stats[statsArray[i]] = parseInt(statsArray[i + 1])
    }

    // Get total activity count
    const countRes = await fetch(`${UPSTASH_URL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['LLEN', 'badseed:agent:activity'])
    })

    const countData = await countRes.json()

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        activities: activities.map(a => ({
          timestamp: a.timestamp,
          time: new Date(a.timestamp).toLocaleTimeString(),
          category: a.category || 'general',
          query: a.query?.substring(0, 150) || '',
          response: a.response || null,
          functionsUsed: a.functionsUsed || [],
          userIP: a.userIP?.substring(0, 10) + '...' || 'unknown'
        })),
        todayStats: {
          totalQueries: stats.queries || 0,
          categories: Object.entries(stats)
            .filter(([k]) => k.startsWith('cat:'))
            .reduce((acc, [k, v]) => ({ ...acc, [k.replace('cat:', '')]: v }), {})
        },
        totalAllTime: countData.result || 0,
        lastUpdate: activities[0]?.timestamp ? new Date(activities[0].timestamp).toISOString() : null
      })
    }
  } catch (error) {
    console.error('Live feed error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch live feed' })
    }
  }
}
