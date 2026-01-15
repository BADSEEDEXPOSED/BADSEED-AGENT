// Local script to fetch and analyze BADSEED AGENT cloud activity
// Usage: node fetch-activity.js [--limit 100] [--token your-token]

import dotenv from 'dotenv'
dotenv.config()

const AGENT_URL = process.env.VITE_AGENT_API_URL || 'https://badseed-agent.netlify.app'
const ADMIN_TOKEN = process.env.AGENT_ADMIN_TOKEN || 'badseed-agent-admin'

async function fetchActivity(limit = 50) {
  const url = `${AGENT_URL}/.netlify/functions/activity-log?limit=${limit}&token=${ADMIN_TOKEN}`

  console.log(`\n📡 Fetching activity from: ${AGENT_URL}`)
  console.log('─'.repeat(60))

  try {
    const response = await fetch(url)

    if (!response.ok) {
      if (response.status === 401) {
        console.error('❌ Unauthorized. Check your AGENT_ADMIN_TOKEN.')
        return
      }
      if (response.status === 503) {
        console.error('❌ Activity logging not configured on cloud agent.')
        console.log('   Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Netlify env vars.')
        return
      }
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    displayActivity(data)
  } catch (error) {
    console.error('❌ Failed to fetch activity:', error.message)
  }
}

function displayActivity(data) {
  const { activities, stats, pagination } = data

  // Display stats
  console.log('\n📊 DAILY STATISTICS (Last 7 Days)')
  console.log('─'.repeat(60))

  if (Object.keys(stats).length === 0) {
    console.log('   No stats recorded yet.')
  } else {
    Object.entries(stats).sort().reverse().forEach(([date, dayStats]) => {
      console.log(`\n   ${date}:`)
      console.log(`      Total queries: ${dayStats.queries || 0}`)

      // Show category breakdown
      const categories = Object.entries(dayStats)
        .filter(([k]) => k.startsWith('cat:'))
        .map(([k, v]) => [k.replace('cat:', ''), v])

      if (categories.length > 0) {
        console.log('      Categories:')
        categories.forEach(([cat, count]) => {
          console.log(`         ${cat}: ${count}`)
        })
      }
    })
  }

  // Display recent activity
  console.log('\n\n📝 RECENT QUERIES')
  console.log('─'.repeat(60))

  if (!activities || activities.length === 0) {
    console.log('   No activity recorded yet.')
    return
  }

  activities.forEach((activity, index) => {
    const time = new Date(activity.timestamp).toLocaleString()
    const query = activity.query?.substring(0, 80) || 'N/A'

    console.log(`\n${index + 1}. [${time}]`)
    console.log(`   Query: "${query}${activity.query?.length > 80 ? '...' : ''}"`)
    console.log(`   Category: ${activity.category || 'unknown'}`)
    console.log(`   IP: ${activity.userIP || 'unknown'}`)

    if (activity.functionsUsed?.length > 0) {
      console.log(`   Functions: ${activity.functionsUsed.join(', ')}`)
    }
  })

  // Pagination info
  console.log('\n')
  console.log('─'.repeat(60))
  console.log(`Showing ${activities.length} of ${pagination.total} total entries`)
  if (pagination.hasMore) {
    console.log(`Use --limit ${pagination.total} to see all`)
  }
}

function analyzePatterns(activities) {
  console.log('\n\n🔍 PATTERN ANALYSIS')
  console.log('─'.repeat(60))

  // Category distribution
  const categoryCount = {}
  const functionCount = {}
  const hourlyActivity = Array(24).fill(0)
  const uniqueIPs = new Set()

  activities.forEach(a => {
    // Count categories
    const cat = a.category || 'unknown'
    categoryCount[cat] = (categoryCount[cat] || 0) + 1

    // Count functions
    a.functionsUsed?.forEach(f => {
      functionCount[f] = (functionCount[f] || 0) + 1
    })

    // Hourly distribution
    const hour = new Date(a.timestamp).getHours()
    hourlyActivity[hour]++

    // Unique users
    if (a.userIP) uniqueIPs.add(a.userIP)
  })

  console.log(`\n   Unique visitors: ${uniqueIPs.size}`)

  console.log('\n   Category Distribution:')
  Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      const pct = ((count / activities.length) * 100).toFixed(1)
      console.log(`      ${cat}: ${count} (${pct}%)`)
    })

  console.log('\n   Function Usage:')
  Object.entries(functionCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([func, count]) => {
      console.log(`      ${func}: ${count}`)
    })

  // Find peak hours
  const maxHour = hourlyActivity.indexOf(Math.max(...hourlyActivity))
  console.log(`\n   Peak activity hour: ${maxHour}:00`)
}

// Parse command line args
const args = process.argv.slice(2)
let limit = 50

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    limit = parseInt(args[i + 1])
  }
}

console.log('╔════════════════════════════════════════════════════════════╗')
console.log('║           BADSEED AGENT - Activity Monitor                 ║')
console.log('╚════════════════════════════════════════════════════════════╝')

fetchActivity(limit)
