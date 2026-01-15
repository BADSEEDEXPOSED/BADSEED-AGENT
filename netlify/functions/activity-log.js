// BADSEED AGENT - Activity Logging
// Stores user interactions for analysis

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

async function redisCommand(command, args = []) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.log('Upstash not configured - logging disabled')
    return null
  }

  const response = await fetch(`${UPSTASH_URL}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([command, ...args])
  })

  if (!response.ok) {
    throw new Error(`Redis error: ${response.status}`)
  }

  const data = await response.json()
  return data.result
}

// Log a user interaction
export async function logActivity(data) {
  if (!UPSTASH_URL) return null

  const entry = {
    timestamp: Date.now(),
    ...data
  }

  // Store in a list (most recent first)
  await redisCommand('LPUSH', ['badseed:agent:activity', JSON.stringify(entry)])

  // Keep only last 1000 entries
  await redisCommand('LTRIM', ['badseed:agent:activity', '0', '999'])

  // Also track daily stats
  const today = new Date().toISOString().split('T')[0]
  await redisCommand('HINCRBY', [`badseed:agent:stats:${today}`, 'queries', '1'])

  // Track query categories
  if (data.category) {
    await redisCommand('HINCRBY', [`badseed:agent:stats:${today}`, `cat:${data.category}`, '1'])
  }

  return entry
}

// Categorize a query based on content
export function categorizeQuery(message) {
  const lower = message.toLowerCase()

  if (lower.includes('who am i') || lower.includes('know me') || lower.includes('identity')) {
    return 'identity'
  }
  if (lower.includes('wallet') || lower.includes('address') || /[a-zA-Z0-9]{32,44}/.test(message)) {
    return 'wallet_analysis'
  }
  if (lower.includes('price') || lower.includes('market') || lower.includes('token') || lower.includes('value')) {
    return 'token_metrics'
  }
  if (lower.includes('prophecy') || lower.includes('sentiment') || lower.includes('voice')) {
    return 'voice_node'
  }
  if (lower.includes('activity') || lower.includes('donation') || lower.includes('transaction')) {
    return 'system_activity'
  }
  if (lower.includes('what is') || lower.includes('explain') || lower.includes('how does')) {
    return 'education'
  }
  return 'general'
}

// Main handler - retrieves activity logs
export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  // Simple auth check - require a token to view logs
  const authToken = event.headers['authorization'] || event.queryStringParameters?.token
  const expectedToken = process.env.AGENT_ADMIN_TOKEN || 'badseed-agent-admin'

  if (authToken !== expectedToken && authToken !== `Bearer ${expectedToken}`) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Unauthorized' })
    }
  }

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: 'Activity logging not configured' })
    }
  }

  try {
    const params = event.queryStringParameters || {}
    const limit = Math.min(parseInt(params.limit) || 50, 200)
    const offset = parseInt(params.offset) || 0

    // Get recent activity
    const activities = await redisCommand('LRANGE', ['badseed:agent:activity', offset.toString(), (offset + limit - 1).toString()])

    // Get stats for last 7 days
    const stats = {}
    for (let i = 0; i < 7; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      const dayStats = await redisCommand('HGETALL', [`badseed:agent:stats:${dateStr}`])
      if (dayStats && dayStats.length > 0) {
        stats[dateStr] = {}
        for (let j = 0; j < dayStats.length; j += 2) {
          stats[dateStr][dayStats[j]] = parseInt(dayStats[j + 1])
        }
      }
    }

    // Get total count
    const totalCount = await redisCommand('LLEN', ['badseed:agent:activity'])

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        activities: activities.map(a => JSON.parse(a)),
        stats,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount
        }
      })
    }
  } catch (error) {
    console.error('Activity log error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to retrieve activity logs' })
    }
  }
}
