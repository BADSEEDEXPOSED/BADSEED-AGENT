// BADSEED AGENT - Dynamic Badge Generator
// Returns SVG badge showing agent status and today's query count

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

export async function handler(event) {
  const headers = {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Access-Control-Allow-Origin': '*'
  }

  // Get today's stats
  let todayQueries = 0
  let status = 'online'
  let statusColor = '#4c1' // green

  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch(UPSTASH_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['HGET', `badseed:agent:stats:${today}`, 'queries'])
      })
      const data = await res.json()
      todayQueries = parseInt(data.result) || 0
    } catch (e) {
      status = 'error'
      statusColor = '#e05d44' // red
    }
  } else {
    status = 'offline'
    statusColor = '#9f9f9f' // gray
  }

  // Determine display text
  const label = 'GROK Agent'
  const message = status === 'online' ? `${todayQueries} today` : status

  // Generate SVG badge (shields.io style)
  const labelWidth = label.length * 6.5 + 10
  const messageWidth = message.length * 6.5 + 10
  const totalWidth = labelWidth + messageWidth

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="a">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#a)">
    <path fill="#555" d="M0 0h${labelWidth}v20H0z"/>
    <path fill="${statusColor}" d="M${labelWidth} 0h${messageWidth}v20H${labelWidth}z"/>
    <path fill="url(#b)" d="M0 0h${totalWidth}v20H0z"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + messageWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${message}</text>
    <text x="${labelWidth + messageWidth / 2}" y="14">${message}</text>
  </g>
</svg>`

  return {
    statusCode: 200,
    headers,
    body: svg
  }
}
