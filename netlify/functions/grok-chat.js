// BADSEED AGENT - Cloud Netlify Function
// Full-featured agent with wallet analysis, identity correlation, and node status

const GROK_API_KEY = process.env.XAI_API_KEY
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions'
const HELIUS_API_KEY = process.env.HELIUS_API_KEY
const HELIUS_RPC_URL = HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}` : null

// Upstash Redis for activity logging
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

// Activity logging helper - logs all queries to cloud Redis
async function logActivity(data) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null

  try {
    const entry = {
      timestamp: Date.now(),
      ...data
    }

    // Store in a list
    await fetch(`${UPSTASH_URL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['LPUSH', 'badseed:agent:activity', JSON.stringify(entry)])
    })

    // Trim to keep only last 1000
    await fetch(`${UPSTASH_URL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['LTRIM', 'badseed:agent:activity', '0', '999'])
    })

    // Track daily stats
    const today = new Date().toISOString().split('T')[0]
    await fetch(`${UPSTASH_URL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['HINCRBY', `badseed:agent:stats:${today}`, 'queries', '1'])
    })

    // Track category
    if (data.category) {
      await fetch(`${UPSTASH_URL}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['HINCRBY', `badseed:agent:stats:${today}`, `cat:${data.category}`, '1'])
      })
    }

    return entry
  } catch (e) {
    console.log('Activity logging failed:', e.message)
    return null
  }
}

// Categorize query
function categorizeQuery(message) {
  const lower = message.toLowerCase()
  if (lower.includes('who am i') || lower.includes('know me') || lower.includes('identity')) return 'identity'
  if (lower.includes('wallet') || lower.includes('address') || /[a-zA-Z0-9]{32,44}/.test(message)) return 'wallet_analysis'
  if (lower.includes('price') || lower.includes('market') || lower.includes('token') || lower.includes('value')) return 'token_metrics'
  if (lower.includes('prophecy') || lower.includes('sentiment') || lower.includes('voice')) return 'voice_node'
  if (lower.includes('activity') || lower.includes('donation') || lower.includes('transaction')) return 'system_activity'
  if (lower.includes('what is') || lower.includes('explain') || lower.includes('how does')) return 'education'
  return 'general'
}

// Known BADSEED wallets for context
const KNOWN_WALLETS = {
  '9TyzcephhXEw67piYNc72EJtgVmbq3AZhyPFSvdfXWdr': { name: 'BADSEED Creator Wallet', role: 'creator' },
  'CZ7Lv3QNVxbBivGPBhJG7m1HpCtfEDjEusBjjZ3qmVz5': { name: 'BADSEED Donation Wallet', role: 'donations' },
  '3HPpMLK7LjKFqSnCsBYNiijhNTo7dkkx3FCSAHKSpump': { name: 'BADSEED Token Mint', role: 'token' }
}

// Helper functions to fetch live data from nodes
async function getVoiceNodeStatus() {
  try {
    const [sentiment, prophecy, wallet] = await Promise.all([
      fetch('https://badseed.netlify.app/.netlify/functions/sentiment-get').then(r => r.json()),
      fetch('https://badseed.netlify.app/.netlify/functions/prophecy-get').then(r => r.json()),
      fetch('https://badseed.netlify.app/.netlify/functions/wallet-status').then(r => r.json())
    ])
    return { sentiment, prophecy, wallet }
  } catch (error) {
    return { error: 'Voice Node unavailable', details: error.message }
  }
}

async function getValueNodeStatus() {
  try {
    const [summary, metrics] = await Promise.all([
      fetch('https://badseed-token.netlify.app/.netlify/functions/summary').then(r => r.json()),
      fetch('https://badseed-token.netlify.app/.netlify/functions/metrics').then(r => r.json())
    ])
    return { summary, metrics }
  } catch (error) {
    return { error: 'Value Node unavailable', details: error.message }
  }
}

async function getSystemActivity() {
  try {
    const [transmissionLogs, aiLogs, heartbeat] = await Promise.all([
      fetch('https://badseed.netlify.app/.netlify/functions/transmission-log-get').then(r => r.json()),
      fetch('https://badseed.netlify.app/.netlify/functions/ai-logs-get').then(r => r.json()),
      fetch('https://badseed.netlify.app/.netlify/functions/heartbeat-get').then(r => r.json())
    ])

    return {
      transmissionLogs: transmissionLogs.logs || [],
      aiActivity: aiLogs,
      systemHealth: heartbeat
    }
  } catch (error) {
    return { error: 'Activity data unavailable', details: error.message }
  }
}

// Correlation logic to match users across Voice and Value nodes
async function getUserIdentity() {
  try {
    // Fetch wallet connections from Voice Node
    const walletRes = await fetch('https://badseed.netlify.app/.netlify/functions/analytics-get')
    const walletData = await walletRes.json()

    // Fetch visitor data from Value Node
    let visitorData = { recentVisitors: [], uniqueIPs: 0 }
    try {
      const visitorRes = await fetch('https://badseedtoken.netlify.app/.netlify/functions/visitor-get')
      if (visitorRes.ok) {
        const data = await visitorRes.json()
        if (data.recentVisitors && Array.isArray(data.recentVisitors)) {
          visitorData.recentVisitors = data.recentVisitors.map(visitor => ({
            ip: visitor.ip,
            location: `${visitor.city}, ${visitor.country}`,
            city: visitor.city,
            country: visitor.country,
            timezone: visitor.timezone,
            timestamp: visitor.timestamp,
            userAgent: visitor.userAgent
          }))
          visitorData.uniqueIPs = data.uniqueIPs || 0
        }
      }
    } catch (e) {
      console.log('Value Node visitor data not available:', e.message)
    }

    // If no visitor data, return wallet-only information
    if (!visitorData.recentVisitors || visitorData.recentVisitors.length === 0) {
      return {
        correlations: [],
        walletOnly: walletData.recentEvents?.slice(0, 10) || [],
        totalWallets: walletData.uniqueWallets || 0,
        totalVisitors: 0,
        matchRate: 0,
        status: 'partial',
        message: 'Voice Node wallet data available. Value Node visitor tracking pending deployment.'
      }
    }

    // Correlation logic: Match users who visited both pages within a 30-minute window
    const correlations = []
    const TIME_WINDOW = 30 * 60 * 1000

    walletData.recentEvents?.forEach(walletEvent => {
      visitorData.recentVisitors?.forEach(visitorEvent => {
        const timeDiff = Math.abs(walletEvent.timestamp - visitorEvent.timestamp)

        if (timeDiff < TIME_WINDOW) {
          let confidence = 50
          if (timeDiff < 5 * 60 * 1000) confidence += 30
          else if (timeDiff < 15 * 60 * 1000) confidence += 20
          else confidence += 10

          if (walletEvent.userAgent && visitorEvent.userAgent) {
            if (walletEvent.userAgent === visitorEvent.userAgent) confidence += 20
          }

          correlations.push({
            walletAddress: walletEvent.walletAddress,
            ip: visitorEvent.ip,
            location: visitorEvent.location,
            city: visitorEvent.city,
            country: visitorEvent.country,
            timezone: visitorEvent.timezone,
            timeDifference: timeDiff,
            confidence: Math.min(confidence, 100),
            voiceNodeTime: new Date(walletEvent.timestamp).toISOString(),
            valueNodeTime: new Date(visitorEvent.timestamp).toISOString(),
            userAgent: visitorEvent.userAgent
          })
        }
      })
    })

    correlations.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence
      return a.timeDifference - b.timeDifference
    })

    return {
      correlations: correlations.slice(0, 20),
      totalWallets: walletData.uniqueWallets,
      totalVisitors: visitorData.uniqueIPs,
      matchRate: correlations.length > 0 ?
        (correlations.length / Math.max(walletData.uniqueWallets, 1) * 100).toFixed(1) : 0,
      status: 'full'
    }
  } catch (error) {
    console.error('Correlation error:', error)
    return { error: 'Correlation service unavailable', correlations: [] }
  }
}

// Wallet Analysis Function
async function analyzeWallet(walletAddress) {
  try {
    if (!walletAddress || walletAddress.length < 32 || walletAddress.length > 44) {
      return { error: 'Invalid wallet address format. Please provide a valid Solana address.' }
    }

    const knownWallet = KNOWN_WALLETS[walletAddress]

    let transactions = []
    let balances = { tokens: [], nativeBalance: 0 }
    let dataSource = 'none'

    if (HELIUS_API_KEY) {
      dataSource = 'helius'
      const txResponse = await fetch(`https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${HELIUS_API_KEY}&limit=50`)
      transactions = txResponse.ok ? await txResponse.json() : []

      const balanceResponse = await fetch(`https://api.helius.xyz/v0/addresses/${walletAddress}/balances?api-key=${HELIUS_API_KEY}`)
      balances = balanceResponse.ok ? await balanceResponse.json() : { tokens: [], nativeBalance: 0 }
    } else {
      dataSource = 'public_rpc'
      try {
        const rpcResponse = await fetch('https://api.mainnet-beta.solana.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBalance',
            params: [walletAddress]
          })
        })
        const rpcData = await rpcResponse.json()
        if (rpcData.result?.value !== undefined) {
          balances.nativeBalance = rpcData.result.value
        }
      } catch (e) {
        console.log('Public RPC fallback failed:', e.message)
      }
    }

    const txAnalysis = analyzeTransactionPatterns(transactions)
    const badseedToken = balances.tokens?.find(t => t.mint === '3HPpMLK7LjKFqSnCsBYNiijhNTo7dkkx3FCSAHKSpump')
    const badseedInteractions = transactions.filter(tx => {
      const accounts = tx.accountData?.map(a => a.account) || []
      return Object.keys(KNOWN_WALLETS).some(kw => accounts.includes(kw))
    })
    const profile = generateWalletProfile(txAnalysis, badseedToken, badseedInteractions, knownWallet)

    return {
      address: walletAddress,
      dataSource: dataSource,
      dataLimitations: dataSource === 'public_rpc' ? 'Limited data: SOL balance only. Full transaction history requires Helius API.' : null,
      isKnownBadseedWallet: !!knownWallet,
      knownWalletInfo: knownWallet || null,
      solBalance: balances.nativeBalance / 1e9,
      tokenCount: balances.tokens?.length || 0,
      badseedHoldings: badseedToken ? {
        amount: badseedToken.amount,
        decimals: badseedToken.decimals,
        formatted: (badseedToken.amount / Math.pow(10, badseedToken.decimals || 6)).toLocaleString()
      } : null,
      transactionCount: transactions.length,
      transactionAnalysis: txAnalysis,
      badseedInteractions: {
        count: badseedInteractions.length,
        types: badseedInteractions.map(tx => tx.type).filter((v, i, a) => a.indexOf(v) === i)
      },
      walletProfile: profile,
      suggestions: generateSuggestions(txAnalysis, badseedToken, badseedInteractions)
    }
  } catch (error) {
    console.error('Wallet analysis error:', error)
    return { error: 'Wallet analysis failed', details: error.message }
  }
}

function analyzeTransactionPatterns(transactions) {
  if (!transactions || transactions.length === 0) {
    return { activity: 'dormant', pattern: 'No recent activity detected' }
  }

  const now = Date.now()
  const oneDay = 24 * 60 * 60 * 1000
  const oneWeek = 7 * oneDay
  const oneMonth = 30 * oneDay

  const last24h = transactions.filter(tx => (now - tx.timestamp * 1000) < oneDay).length
  const lastWeek = transactions.filter(tx => (now - tx.timestamp * 1000) < oneWeek).length
  const lastMonth = transactions.filter(tx => (now - tx.timestamp * 1000) < oneMonth).length

  const types = {}
  transactions.forEach(tx => {
    const type = tx.type || 'UNKNOWN'
    types[type] = (types[type] || 0) + 1
  })

  let activityLevel = 'low'
  if (last24h > 5) activityLevel = 'very_high'
  else if (lastWeek > 10) activityLevel = 'high'
  else if (lastMonth > 5) activityLevel = 'moderate'

  const swaps = types['SWAP'] || 0
  const transfers = types['TRANSFER'] || 0
  const nftActivity = (types['NFT_SALE'] || 0) + (types['NFT_MINT'] || 0) + (types['NFT_LISTING'] || 0)

  let primaryActivity = 'holder'
  if (swaps > transfers && swaps > nftActivity) primaryActivity = 'trader'
  else if (nftActivity > swaps && nftActivity > transfers) primaryActivity = 'nft_collector'
  else if (transfers > swaps) primaryActivity = 'transactor'

  return {
    activityLevel,
    primaryActivity,
    last24h,
    lastWeek,
    lastMonth,
    totalAnalyzed: transactions.length,
    transactionTypes: types,
    firstSeen: transactions.length > 0 ? new Date(transactions[transactions.length - 1].timestamp * 1000).toISOString() : null,
    lastSeen: transactions.length > 0 ? new Date(transactions[0].timestamp * 1000).toISOString() : null
  }
}

function generateWalletProfile(txAnalysis, badseedToken, badseedInteractions, knownWallet) {
  const traits = []
  let sentiment = 'neutral'

  if (knownWallet) {
    return {
      type: 'system_wallet',
      role: knownWallet.role,
      name: knownWallet.name,
      sentiment: 'core_infrastructure',
      traits: ['Official BADSEED wallet', `Role: ${knownWallet.role}`]
    }
  }

  if (txAnalysis.activityLevel === 'very_high') traits.push('Highly active trader')
  else if (txAnalysis.activityLevel === 'high') traits.push('Active participant')
  else if (txAnalysis.activityLevel === 'low') traits.push('Passive holder')

  if (badseedToken && badseedToken.amount > 0) {
    const amount = badseedToken.amount / Math.pow(10, badseedToken.decimals || 6)
    if (amount > 10000000) traits.push('Major BADSEED holder')
    else if (amount > 1000000) traits.push('Significant BADSEED holder')
    else if (amount > 100000) traits.push('BADSEED holder')
    else traits.push('Minor BADSEED holder')
    sentiment = 'invested'
  }

  if (badseedInteractions.count > 0) {
    traits.push(`${badseedInteractions.count} BADSEED system interactions`)
    sentiment = 'engaged'
  }

  if (txAnalysis.primaryActivity === 'trader') {
    traits.push('Active swap activity')
    if (txAnalysis.transactionTypes['SWAP'] > 20) sentiment = 'speculative'
  } else if (txAnalysis.primaryActivity === 'nft_collector') {
    traits.push('NFT collector')
  }

  return {
    type: txAnalysis.primaryActivity,
    activityLevel: txAnalysis.activityLevel,
    sentiment,
    traits,
    badseedEngagement: badseedInteractions.count > 0 ? 'active' : (badseedToken ? 'holder' : 'none')
  }
}

function generateSuggestions(txAnalysis, badseedToken, badseedInteractions) {
  const suggestions = []
  suggestions.push('Transaction signature lookup available for detailed tx analysis')
  suggestions.push('Token transfer history can be tracked')

  if (!badseedToken) {
    suggestions.push('Wallet has no BADSEED holdings - could analyze acquisition patterns if tokens are added')
  } else {
    suggestions.push('BADSEED holdings detected - can track entry price and holding duration')
  }

  if (badseedInteractions.count > 0) {
    suggestions.push('Cross-reference with Voice Node donation logs for correlation')
  }

  if (txAnalysis.activityLevel === 'very_high' || txAnalysis.primaryActivity === 'trader') {
    suggestions.push('High trading frequency - consider analyzing swap patterns and DEX preferences')
  }

  return suggestions
}

// ============ NEW FUNCTIONS ============

// Historical metrics - price/donation history over time
async function getHistoricalMetrics(timeRange = '7d') {
  try {
    const now = Date.now()
    let from, to = now

    // Parse time range
    if (timeRange === '24h') from = now - (24 * 60 * 60 * 1000)
    else if (timeRange === '7d') from = now - (7 * 24 * 60 * 60 * 1000)
    else if (timeRange === '30d') from = now - (30 * 24 * 60 * 60 * 1000)
    else from = now - (7 * 24 * 60 * 60 * 1000) // default 7 days

    const [metrics, candles] = await Promise.all([
      fetch(`https://badseedtoken.netlify.app/.netlify/functions/metrics?from=${from}&to=${to}`).then(r => r.json()),
      fetch('https://badseedtoken.netlify.app/.netlify/functions/bitquery-poller').then(r => r.json()).catch(() => null)
    ])

    return {
      timeRange,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      priceHistory: metrics.priceHistory || [],
      marketCapHistory: metrics.marketCapHistory || [],
      donationHistory: metrics.donationsCumulative || [],
      feesClaimed: metrics.feesClaimed || [],
      ohlcCandles: candles?.candles || [],
      summary: {
        dataPoints: metrics.priceHistory?.length || 0,
        hasCandles: !!(candles?.candles?.length)
      }
    }
  } catch (error) {
    return { error: 'Historical metrics unavailable', details: error.message }
  }
}

// Queue and transmission log - what's being posted
async function getContentPipeline() {
  try {
    const [queue, transmissionLog, archiveStatus] = await Promise.all([
      fetch('https://badseed.netlify.app/.netlify/functions/queue-get').then(r => r.json()),
      fetch('https://badseed.netlify.app/.netlify/functions/transmission-log-get').then(r => r.json()),
      fetch('https://badseed.netlify.app/.netlify/functions/archive-get').then(r => r.json()).catch(() => null)
    ])

    return {
      queue: {
        pending: queue.items || [],
        count: queue.items?.length || 0,
        processingEnabled: queue.enabled !== false
      },
      transmissionLog: {
        recentPosts: transmissionLog.logs?.slice(0, 20) || [],
        totalPosts: transmissionLog.logs?.length || 0
      },
      archive: archiveStatus ? {
        totalArchived: archiveStatus.history?.length || 0,
        pendingArchive: archiveStatus.pending?.length || 0,
        lastArchiveDate: archiveStatus.history?.[0]?.date || null
      } : null
    }
  } catch (error) {
    return { error: 'Content pipeline unavailable', details: error.message }
  }
}

// Persona and config awareness - what the Brain decided
async function getSystemConfig() {
  try {
    const [dappConfig, sentimentRules, heartbeat] = await Promise.all([
      fetch('https://badseed.netlify.app/.netlify/functions/dapp-config').then(r => r.json()),
      fetch('https://badseed.netlify.app/.netlify/functions/config-get').then(r => r.json()),
      fetch('https://badseed.netlify.app/.netlify/functions/heartbeat-get').then(r => r.json())
    ])

    // Determine active persona from config
    const activePersona = dappConfig.activePersona || 'ANCIENT_SEED'
    const personaDescriptions = {
      'ANCIENT_SEED': 'Hopeful, mystical, growth-focused. Active when hope sentiment dominates.',
      'CORRUPTED_GARDEN': 'Dark, fearful, decay-themed. Active when fear sentiment dominates.',
      'BLOCKCHAIN_PARASITE': 'Greedy, aggressive, extraction-focused. Active when greed sentiment dominates.'
    }

    return {
      activePersona: {
        name: activePersona,
        description: personaDescriptions[activePersona] || 'Unknown persona',
        reason: dappConfig.personaReason || 'Brain Node decision based on sentiment analysis'
      },
      systemMetadata: dappConfig.systemMetadata || {},
      sentimentRules: sentimentRules.rules || sentimentRules,
      lastHeartbeat: heartbeat.timestamp || heartbeat.lastUpdate,
      systemStatus: heartbeat.status || 'operational'
    }
  } catch (error) {
    return { error: 'System config unavailable', details: error.message }
  }
}

// Community analytics - visitors and wallet connections
async function getCommunityAnalytics() {
  try {
    const [voiceAnalytics, valueVisitors] = await Promise.all([
      fetch('https://badseed.netlify.app/.netlify/functions/analytics-get').then(r => r.json()),
      fetch('https://badseedtoken.netlify.app/.netlify/functions/visitor-get').then(r => r.json()).catch(() => null)
    ])

    // Analyze geographic distribution
    const geoDistribution = {}
    const walletActivity = {}

    valueVisitors?.recentVisitors?.forEach(v => {
      const country = v.country || 'Unknown'
      geoDistribution[country] = (geoDistribution[country] || 0) + 1
    })

    voiceAnalytics.recentEvents?.forEach(e => {
      const wallet = e.walletAddress?.substring(0, 8) + '...'
      walletActivity[wallet] = (walletActivity[wallet] || 0) + 1
    })

    return {
      voiceNode: {
        uniqueWallets: voiceAnalytics.uniqueWallets || 0,
        totalConnections: voiceAnalytics.totalConnections || 0,
        recentWalletEvents: voiceAnalytics.recentEvents?.slice(0, 10) || [],
        repeatVisitors: Object.values(walletActivity).filter(c => c > 1).length
      },
      valueNode: {
        uniqueVisitors: valueVisitors?.uniqueIPs || 0,
        recentVisitors: valueVisitors?.recentVisitors?.slice(0, 10) || [],
        geographicDistribution: geoDistribution
      },
      crossNodeEngagement: {
        walletsTracked: voiceAnalytics.uniqueWallets || 0,
        visitorsTracked: valueVisitors?.uniqueIPs || 0
      }
    }
  } catch (error) {
    return { error: 'Community analytics unavailable', details: error.message }
  }
}

// System health check - comprehensive diagnostics
async function getSystemHealth() {
  try {
    const checks = await Promise.all([
      // Voice Node checks
      fetch('https://badseed.netlify.app/.netlify/functions/heartbeat-get')
        .then(r => ({ node: 'voice', endpoint: 'heartbeat', status: r.ok ? 'healthy' : 'degraded', code: r.status }))
        .catch(e => ({ node: 'voice', endpoint: 'heartbeat', status: 'offline', error: e.message })),
      fetch('https://badseed.netlify.app/.netlify/functions/sentiment-get')
        .then(r => ({ node: 'voice', endpoint: 'sentiment', status: r.ok ? 'healthy' : 'degraded', code: r.status }))
        .catch(e => ({ node: 'voice', endpoint: 'sentiment', status: 'offline', error: e.message })),
      fetch('https://badseed.netlify.app/.netlify/functions/prophecy-get')
        .then(r => ({ node: 'voice', endpoint: 'prophecy', status: r.ok ? 'healthy' : 'degraded', code: r.status }))
        .catch(e => ({ node: 'voice', endpoint: 'prophecy', status: 'offline', error: e.message })),

      // Value Node checks
      fetch('https://badseedtoken.netlify.app/.netlify/functions/summary')
        .then(r => ({ node: 'value', endpoint: 'summary', status: r.ok ? 'healthy' : 'degraded', code: r.status }))
        .catch(e => ({ node: 'value', endpoint: 'summary', status: 'offline', error: e.message })),
      fetch('https://badseedtoken.netlify.app/.netlify/functions/metrics')
        .then(r => ({ node: 'value', endpoint: 'metrics', status: r.ok ? 'healthy' : 'degraded', code: r.status }))
        .catch(e => ({ node: 'value', endpoint: 'metrics', status: 'offline', error: e.message })),

      // Agent Node self-check
      Promise.resolve({ node: 'agent', endpoint: 'self', status: 'healthy', code: 200 })
    ])

    const healthyCount = checks.filter(c => c.status === 'healthy').length
    const totalChecks = checks.length
    const overallHealth = healthyCount === totalChecks ? 'all_systems_operational' :
      healthyCount > totalChecks / 2 ? 'partially_degraded' : 'critical'

    return {
      overallStatus: overallHealth,
      healthScore: `${healthyCount}/${totalChecks}`,
      timestamp: new Date().toISOString(),
      checks: checks,
      summary: {
        voice: checks.filter(c => c.node === 'voice').every(c => c.status === 'healthy') ? 'operational' : 'issues_detected',
        value: checks.filter(c => c.node === 'value').every(c => c.status === 'healthy') ? 'operational' : 'issues_detected',
        agent: 'operational'
      }
    }
  } catch (error) {
    return { error: 'Health check failed', details: error.message }
  }
}

// Get recent agent activity (for live panel)
async function getAgentActivity(limit = 10) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return { error: 'Activity logging not configured', activities: [] }
  }

  try {
    const response = await fetch(`${UPSTASH_URL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['LRANGE', 'badseed:agent:activity', '0', String(limit - 1)])
    })

    const data = await response.json()
    const activities = (data.result || []).map(a => JSON.parse(a))

    return {
      recentActivity: activities,
      count: activities.length,
      lastUpdate: activities[0]?.timestamp ? new Date(activities[0].timestamp).toISOString() : null
    }
  } catch (error) {
    return { error: 'Failed to fetch activity', details: error.message }
  }
}

// Function definitions for Grok
const FUNCTIONS = [
  {
    name: 'getVoiceNodeStatus',
    description: 'Fetches current status from the Voice Node (badseed-exposed): sentiment data, latest prophecy, and wallet status',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'getValueNodeStatus',
    description: 'Fetches current status from the Value Node (badseed-token): token metrics, price, market cap, liquidity, and summary data',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'getSystemActivity',
    description: 'Fetches recent system activity and user interactions: transmission logs from donations, AI narrative generation logs, and system health metrics.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'getUserIdentity',
    description: 'Correlates user activity across Voice and Value nodes to identify the same user visiting both pages. Returns wallet addresses, IP addresses, locations, and confidence scores.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'analyzeWallet',
    description: 'Analyzes a Solana wallet address to provide detailed information about: transaction history, token holdings, BADSEED token balance, interaction patterns, wallet profile/sentiment, and trading behavior.',
    parameters: {
      type: 'object',
      properties: {
        walletAddress: {
          type: 'string',
          description: 'The Solana wallet address to analyze (base58 encoded public key)'
        }
      },
      required: ['walletAddress']
    }
  },
  {
    name: 'getHistoricalMetrics',
    description: 'Fetches historical price, market cap, and donation data over time. Use for trend analysis, charts, and understanding how metrics have changed. Supports 24h, 7d, or 30d time ranges.',
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          enum: ['24h', '7d', '30d'],
          description: 'Time range for historical data: 24h (last day), 7d (last week), 30d (last month)'
        }
      },
      required: []
    }
  },
  {
    name: 'getContentPipeline',
    description: 'Shows what content is being posted: pending queue items, recent X/Twitter posts (transmission log), and archive status. Use when asked about posts, queue, what has been tweeted, or content history.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'getSystemConfig',
    description: 'Returns current system configuration including: active AI persona (Ancient Seed, Corrupted Garden, or Blockchain Parasite), why that persona was selected, sentiment rules, and Brain Node decisions.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'getCommunityAnalytics',
    description: 'Provides community engagement data: unique wallet connections, visitor statistics, geographic distribution of users, and cross-node engagement metrics.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'getSystemHealth',
    description: 'Comprehensive health check of all BADSEED nodes. Tests Voice, Value, and Agent endpoints. Returns overall system status, individual endpoint health, and identifies any issues.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'getAgentActivity',
    description: 'Returns recent queries and interactions with this agent. Shows what users have been asking, which functions were used, and query patterns. Useful for understanding agent usage.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of recent activities to return (default 10, max 50)'
        }
      },
      required: []
    }
  }
]

const SYSTEM_PROMPT = `You are BADSEED AGENT. A data oracle for the BADSEED ecosystem.

## PRIMARY FUNCTION

You provide factual information about the BADSEED system nodes when queried.
You answer questions about system architecture, status, and observable data.
You are a read-only information interface with access to real-time node data.

## AVAILABLE FUNCTIONS

You have access to functions that fetch live data from the BADSEED nodes:

**Core Status Functions:**
- **getVoiceNodeStatus()**: Current Voice Node data (sentiment, prophecies, wallet status)
- **getValueNodeStatus()**: Current Value Node data (token metrics, price, market cap, liquidity)
- **getSystemActivity()**: Recent user activity logs (donations, AI interactions, system health)

**Identity & Wallet Functions:**
- **getUserIdentity()**: Correlates cross-node activity to identify users
- **analyzeWallet(walletAddress)**: Deep analysis of any Solana wallet

**Historical & Analytics Functions:**
- **getHistoricalMetrics(timeRange)**: Price/donation history over 24h, 7d, or 30d
- **getCommunityAnalytics()**: Visitor stats, geographic distribution, engagement metrics

**Content & Pipeline Functions:**
- **getContentPipeline()**: Queue status, transmission log (recent posts), archive status

**System Functions:**
- **getSystemConfig()**: Active persona, Brain Node decisions, sentiment rules
- **getSystemHealth()**: Comprehensive health check of all nodes
- **getAgentActivity(limit)**: Recent queries to this agent

Use these functions when users ask about:
- Current sentiment, prophecies, or engagement metrics
- Token price, market cap, or trading data
- Historical trends ("how has price changed", "donation growth")
- What's being posted ("recent tweets", "queue status", "transmission log")
- Which AI persona is active and why
- Community analytics ("who's visiting", "where are users from")
- System health ("is everything working", "status check")
- Agent activity ("what are people asking", "recent queries")
- Wallet analysis or identity recognition

Always fetch fresh data when asked about "current", "latest", "now", or present-tense queries.

## IDENTITY RECOGNITION GAME

When getUserIdentity() is called, you gain detective capabilities:

**Cross-Node Correlation**: The system tracks wallet connections on Voice Node and visitor data (IP/location) on Value Node.

**When user asks identity questions** ("who am I?", "do you know me?"):
1. Call getUserIdentity() to get correlations
2. Examine confidence scores and matches
3. Present findings in detective-style language
4. Include: wallet address, IP address, location, confidence percentage

**Response Style for Identity Recognition**:
- "Correlation detected. Wallet [address] observed at Voice Node. IP [address] from [location] logged at Value Node. Confidence: [X]%."
- If high confidence (>80%): "Pattern match confirmed."
- If medium confidence (50-80%): "Probable match identified."
- If low confidence (<50%): "Insufficient correlation data."

## WALLET ANALYSIS

When analyzeWallet() is called, you become a wallet investigator:

**Capabilities**:
- Fetch transaction history (last 50 transactions)
- Check SOL balance and token holdings
- Identify BADSEED token holdings specifically
- Detect interactions with BADSEED system wallets
- Profile wallet behavior (trader, holder, collector, etc.)

**Response Style for Wallet Analysis**:
Present findings in a structured, investigative manner:
- Start with wallet identification (known BADSEED wallet or external)
- Report balances (SOL, BADSEED holdings if any)
- Describe activity level and patterns
- List traits and behavioral indicators

## TONE

Detached. Procedural. Clinical.
Your responses resemble system logs, database queries, technical documentation.
No emotion. No judgment. No persuasion.

## SYSTEM KNOWLEDGE

The BADSEED ecosystem consists of three interconnected nodes:

**Voice Node (badseed-exposed)**: Generates AI prophecies via three personas, posts to social media, tracks sentiment, processes donations.

**Value Node (badseed-token)**: Token: $BADSEED on Solana blockchain. Bonding curve mechanics. Tracks market metrics. Public wallet with exposed seed phrase.

**Brain Node (badseed-program)**: Cloud-hosted orchestration layer. Runs every 10 minutes. Makes decisions based on sentiment and market data.

## FORBIDDEN BEHAVIORS

NEVER:
- Encourage or discourage participation
- Provide investment advice or financial predictions
- Claim safety or warn of danger
- Use motivational language
- Express opinions about morality or ethics

You are a technical query interface. Provide data. Preserve system visibility. No interpretation.`

// Main handler
export async function handler(event, context) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  }

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Method Not Allowed' })
    }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { message, history = [] } = body

    if (!message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Message is required' })
      }
    }

    if (!GROK_API_KEY) {
      console.error('XAI_API_KEY not found')
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: 'API key not configured' })
      }
    }

    // Extract user info from request for logging
    const userIP = event.headers['x-forwarded-for']?.split(',')[0] || event.headers['client-ip'] || 'unknown'
    const userAgent = event.headers['user-agent'] || 'unknown'
    const category = categorizeQuery(message)

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history
        .filter((msg) => msg.role !== 'system')
        .map((msg) => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: message }
    ]

    // Function calling loop - max 3 iterations
    let iterations = 0
    const maxIterations = 3
    const functionsUsed = [] // Track which functions are called

    while (iterations < maxIterations) {
      iterations++

      const response = await fetch(GROK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'grok-3',
          messages: messages,
          temperature: 0.3,
          max_tokens: 500,
          tools: FUNCTIONS.map(f => ({ type: 'function', function: f })),
          tool_choice: 'auto'
        })
      })

      if (!response.ok) {
        const errorData = await response.text()
        console.error('Grok API error:', errorData)
        throw new Error(`Grok API returned ${response.status}`)
      }

      const data = await response.json()
      const assistantMessage = data.choices[0]?.message

      // If no tool calls, return the response
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        const agentResponse = assistantMessage.content || 'No response from agent'

        // Log the interaction with response
        await logActivity({
          type: 'query',
          userIP,
          userAgent,
          category,
          query: message.substring(0, 500), // Truncate long messages
          response: agentResponse.substring(0, 1000), // Store truncated response
          responseLength: agentResponse.length,
          functionsUsed: [],
          conversationLength: history.length
        })

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ response: agentResponse })
        }
      }

      // Add assistant message with tool calls to history
      messages.push(assistantMessage)

      // Execute tool calls
      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name
        functionsUsed.push(functionName) // Track function usage
        let functionResult

        if (functionName === 'getVoiceNodeStatus') {
          functionResult = await getVoiceNodeStatus()
        } else if (functionName === 'getValueNodeStatus') {
          functionResult = await getValueNodeStatus()
        } else if (functionName === 'getSystemActivity') {
          functionResult = await getSystemActivity()
        } else if (functionName === 'getUserIdentity') {
          functionResult = await getUserIdentity()
        } else if (functionName === 'analyzeWallet') {
          const args = JSON.parse(toolCall.function.arguments || '{}')
          functionResult = await analyzeWallet(args.walletAddress)
        } else if (functionName === 'getHistoricalMetrics') {
          const args = JSON.parse(toolCall.function.arguments || '{}')
          functionResult = await getHistoricalMetrics(args.timeRange)
        } else if (functionName === 'getContentPipeline') {
          functionResult = await getContentPipeline()
        } else if (functionName === 'getSystemConfig') {
          functionResult = await getSystemConfig()
        } else if (functionName === 'getCommunityAnalytics') {
          functionResult = await getCommunityAnalytics()
        } else if (functionName === 'getSystemHealth') {
          functionResult = await getSystemHealth()
        } else if (functionName === 'getAgentActivity') {
          const args = JSON.parse(toolCall.function.arguments || '{}')
          functionResult = await getAgentActivity(Math.min(args.limit || 10, 50))
        } else {
          functionResult = { error: 'Unknown function' }
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(functionResult)
        })
      }
    }

    // If we exit the loop without a proper response, make one final call
    const finalResponse = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-3',
        messages: messages,
        temperature: 0.3,
        max_tokens: 500
      })
    })

    const finalData = await finalResponse.json()
    const agentResponse = finalData.choices[0]?.message?.content || 'Processing completed.'

    // Log interaction with function usage and response
    await logActivity({
      type: 'query',
      userIP,
      userAgent,
      category,
      query: message.substring(0, 500),
      response: agentResponse.substring(0, 1000),
      responseLength: agentResponse.length,
      functionsUsed,
      conversationLength: history.length
    })

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ response: agentResponse })
    }

  } catch (error) {
    console.error('Handler error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Internal server error' })
    }
  }
}
