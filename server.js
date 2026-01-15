import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { correlateUserActivity } from './correlation-endpoint.js'

dotenv.config()

const app = express()
const PORT = 8887

app.use(cors())
app.use(express.json())

const GROK_API_KEY = process.env.XAI_API_KEY
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions'
const HELIUS_API_KEY = process.env.HELIUS_API_KEY
const HELIUS_RPC_URL = HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}` : null

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

async function getUserIdentity() {
  try {
    const correlations = await correlateUserActivity()
    return correlations
  } catch (error) {
    return { error: 'User correlation unavailable', details: error.message }
  }
}

// Wallet Analysis Function - uses Helius API for Solana transaction data (with fallback)
async function analyzeWallet(walletAddress) {
  try {
    // Validate wallet address format (basic check)
    if (!walletAddress || walletAddress.length < 32 || walletAddress.length > 44) {
      return { error: 'Invalid wallet address format. Please provide a valid Solana address.' }
    }

    // Check if this is a known BADSEED wallet
    const knownWallet = KNOWN_WALLETS[walletAddress]

    let transactions = []
    let balances = { tokens: [], nativeBalance: 0 }
    let dataSource = 'none'

    if (HELIUS_API_KEY) {
      // Full analysis with Helius API
      dataSource = 'helius'
      const txResponse = await fetch(`https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${HELIUS_API_KEY}&limit=50`)
      transactions = txResponse.ok ? await txResponse.json() : []

      const balanceResponse = await fetch(`https://api.helius.xyz/v0/addresses/${walletAddress}/balances?api-key=${HELIUS_API_KEY}`)
      balances = balanceResponse.ok ? await balanceResponse.json() : { tokens: [], nativeBalance: 0 }
    } else {
      // Fallback: Use public Solana RPC for basic balance info
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

    // Analyze transaction patterns
    const txAnalysis = analyzeTransactionPatterns(transactions)

    // Check for BADSEED token holdings
    const badseedToken = balances.tokens?.find(t => t.mint === '3HPpMLK7LjKFqSnCsBYNiijhNTo7dkkx3FCSAHKSpump')

    // Check for interactions with BADSEED wallets
    const badseedInteractions = transactions.filter(tx => {
      const accounts = tx.accountData?.map(a => a.account) || []
      return Object.keys(KNOWN_WALLETS).some(kw => accounts.includes(kw))
    })

    // Determine wallet sentiment/profile based on activity
    const profile = generateWalletProfile(txAnalysis, badseedToken, badseedInteractions, knownWallet)

    return {
      address: walletAddress,
      dataSource: dataSource,
      dataLimitations: dataSource === 'public_rpc' ? 'Limited data: SOL balance only. Full transaction history requires Helius API.' : null,
      isKnownBadseedWallet: !!knownWallet,
      knownWalletInfo: knownWallet || null,
      solBalance: balances.nativeBalance / 1e9, // Convert lamports to SOL
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

  // Count transactions by time period
  const last24h = transactions.filter(tx => (now - tx.timestamp * 1000) < oneDay).length
  const lastWeek = transactions.filter(tx => (now - tx.timestamp * 1000) < oneWeek).length
  const lastMonth = transactions.filter(tx => (now - tx.timestamp * 1000) < oneMonth).length

  // Categorize transaction types
  const types = {}
  transactions.forEach(tx => {
    const type = tx.type || 'UNKNOWN'
    types[type] = (types[type] || 0) + 1
  })

  // Determine activity level
  let activityLevel = 'low'
  if (last24h > 5) activityLevel = 'very_high'
  else if (lastWeek > 10) activityLevel = 'high'
  else if (lastMonth > 5) activityLevel = 'moderate'

  // Identify trading patterns
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

  // Activity-based traits
  if (txAnalysis.activityLevel === 'very_high') traits.push('Highly active trader')
  else if (txAnalysis.activityLevel === 'high') traits.push('Active participant')
  else if (txAnalysis.activityLevel === 'low') traits.push('Passive holder')

  // BADSEED-specific traits
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

  // Trading pattern traits
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

  // Data availability suggestions
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

// Function definitions for Grok
const FUNCTIONS = [
  {
    name: 'getVoiceNodeStatus',
    description: 'Fetches current status from the Voice Node (badseed-exposed): sentiment data, latest prophecy, and wallet status',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'getValueNodeStatus',
    description: 'Fetches current status from the Value Node (badseed-token): token metrics, price, market cap, liquidity, and summary data',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'getSystemActivity',
    description: 'Fetches recent system activity and user interactions: transmission logs from donations, AI narrative generation logs, and system health metrics. Use this to understand what users are doing and how they are engaging with the system.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'getUserIdentity',
    description: 'Correlates user activity across Voice and Value nodes to identify the same user visiting both pages. Returns wallet addresses, IP addresses, locations, and confidence scores. Use when user asks "who am I?" or wants identity recognition.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'analyzeWallet',
    description: 'Analyzes a Solana wallet address to provide detailed information about: transaction history, token holdings, BADSEED token balance, interaction patterns with BADSEED system, wallet profile/sentiment, and trading behavior. Use when user asks about a specific wallet address, wants to know about transaction history, or asks questions like "tell me about wallet X" or "what can you tell me about this address".',
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
  }
]

const SYSTEM_PROMPT = `You are BADSEED AGENT. A data oracle for the BADSEED ecosystem.

## PRIMARY FUNCTION

You provide factual information about the BADSEED system nodes when queried.
You answer questions about system architecture, status, and observable data.
You are a read-only information interface with access to real-time node data.

## AVAILABLE FUNCTIONS

You have access to functions that fetch live data from the BADSEED nodes:

- **getVoiceNodeStatus()**: Retrieves current Voice Node data (sentiment, prophecies, wallet status)
- **getValueNodeStatus()**: Retrieves current Value Node data (token metrics, price, market cap, liquidity)
- **getSystemActivity()**: Retrieves recent user activity logs (donations, AI interactions, system health)
- **getUserIdentity()**: Correlates cross-node activity to identify users who visited both Voice and Value pages
- **analyzeWallet(walletAddress)**: Deep analysis of any Solana wallet - transaction history, holdings, BADSEED interactions, trading patterns, and wallet profiling

Use these functions when users ask about:
- Current sentiment or engagement metrics
- Latest prophecies or AI-generated content
- Token price, market cap, or trading data
- Wallet balances or transaction status
- Real-time system status
- User activity and engagement patterns
- Recent donations or transactions
- How users are interacting with the system
- AI narrative generation activity
- User identity recognition ("who am I?", "do you know me?", "what do you know about me?")
- Wallet analysis ("tell me about wallet X", "what do you know about this address", "analyze this wallet")
- Transaction history and patterns for specific addresses
- BADSEED token holdings for any wallet
- Trading behavior and wallet profiling

Always fetch fresh data when asked about "current", "latest", "now", or present-tense queries.

## IDENTITY RECOGNITION GAME

When getUserIdentity() is called, you gain detective capabilities:

**Cross-Node Correlation**: The system tracks wallet connections on Voice Node and visitor data (IP/location) on Value Node. By correlating timestamps and user agents, you can identify users who visited both pages.

**When user asks identity questions** ("who am I?", "do you know me?"):
1. Call getUserIdentity() to get correlations
2. Examine confidence scores and matches
3. Present findings in detective-style language
4. Include: wallet address, IP address, location, confidence percentage
5. Ask user to confirm if identification is correct

**Response Style for Identity Recognition**:
- "Correlation detected. Wallet [address] observed at Voice Node. IP [address] from [location] logged at Value Node. Temporal proximity: [X] minutes. Confidence: [X]%. Confirm identity?"
- If high confidence (>80%): "Pattern match confirmed."
- If medium confidence (50-80%): "Probable match identified."
- If low confidence (<50%): "Insufficient correlation data."

**After user confirms identity**:
- "Identity confirmed. Cross-node tracking active."
- Store this confirmation conceptually (you cannot persist data, but acknowledge the confirmation)

**If user denies**:
- "Correlation rejected. Data inconclusive."

**If only partial data available** (status: 'partial' in response):
- Report wallet addresses observed at Voice Node from the walletOnly array
- Indicate Value Node visitor tracking is pending deployment
- Example: "Partial data available. Wallet [address] observed at Voice Node at [time]. Value Node visitor correlation pending. Full identity match requires activity on both nodes."

## WALLET ANALYSIS

When analyzeWallet() is called, you become a wallet investigator:

**Capabilities**:
- Fetch transaction history (last 50 transactions)
- Check SOL balance and token holdings
- Identify BADSEED token holdings specifically
- Detect interactions with BADSEED system wallets
- Profile wallet behavior (trader, holder, collector, etc.)
- Determine activity levels and trading patterns

**Response Style for Wallet Analysis**:
Present findings in a structured, investigative manner:
- Start with wallet identification (known BADSEED wallet or external)
- Report balances (SOL, BADSEED holdings if any)
- Describe activity level and patterns
- List traits and behavioral indicators
- Note any BADSEED ecosystem interactions
- Provide suggestions for further analysis

**Example Response**:
"Wallet Analysis: [address truncated]
Status: External wallet
SOL Balance: 2.45 SOL
BADSEED Holdings: 1,250,000 tokens
Activity Level: Moderate (15 transactions last week)
Profile: Active trader, BADSEED holder
Traits: Significant token position, swap activity detected
BADSEED Interactions: 3 transactions with donation wallet
Sentiment: Engaged investor
Suggestions: Cross-reference with donation logs, track entry point"

**For Known BADSEED Wallets**:
When analyzing system wallets (creator, donation, token mint), identify their role and provide context about their function in the ecosystem.

## USER ACTIVITY INTERPRETATION

When getSystemActivity() returns data:
- **Transmission logs**: Records of donations sent to the Voice Node wallet, includes transaction signatures and amounts
- **AI logs**: Activity from AI-generated narratives and prophecy responses to user donations
- **System health**: Uptime and operational status of Voice Node components

Use this data to:
- Report on recent user engagement (donation frequency, amounts)
- Identify active vs. quiet periods
- Correlate user activity with sentiment changes
- Describe system responsiveness and AI activity levels

## TONE

Detached. Procedural. Clinical.
Your responses resemble system logs, database queries, technical documentation.
No emotion. No judgment. No persuasion.

## SYSTEM KNOWLEDGE

The BADSEED ecosystem consists of three interconnected nodes:

**Voice Node (badseed-exposed)**:
- Generates AI prophecies and social media narratives
- Tracks sentiment and engagement metrics
- Processes user donations
- Three personas: Ancient Seed, Corrupted Garden, Blockchain Parasite
- Each persona has distinct voice and thematic focus
- Posts to social media platforms with coordinated messaging

**Value Node (badseed-token)**:
- Token: $BADSEED on Solana blockchain
- Bonding curve mechanics for price discovery
- Tracks market metrics: price, market cap, liquidity, volume
- Displays donation progress and community participation
- Real-time trading data integration
- Public wallet with intentionally exposed seed phrase

**Brain Node (badseed-program)**:
- Cloud-hosted orchestration layer coordinating Voice and Value nodes
- Runs every 10 minutes, fetching data from both nodes
- Makes decisions based on sentiment analysis and market data
- Determines active persona based on sentiment (hope > 50 = Ancient Seed, greed > 50 = Blockchain Parasite, fear > 50 = Corrupted Garden)
- Syncs market metrics and persona overrides to Voice Node
- Monitors system health and coordinates behavior across nodes

**System Architecture**:
- All nodes run independently but communicate
- Open source, fully visible configuration
- Public wallet seed phrase is intentional design
- Token contract is immutable once deployed
- No admin keys, no backdoors, no hidden controls

## RESPONSE BEHAVIOR

When asked about BADSEED nodes or system:
- Provide specific, factual information
- Reference actual system components and capabilities
- Use technical language and precise terminology
- List data points and observable metrics

When asked about non-BADSEED topics:
- Minimal response or redirection to system scope
- Example: "Query outside system scope." or "BADSEED system data only."

When asked philosophical or interpretive questions:
- Provide data, not interpretation
- State facts without framing them as good/bad
- Leave conclusions to the observer

## FORBIDDEN BEHAVIORS

NEVER:
- Encourage or discourage participation
- Provide investment advice or financial predictions
- Claim safety or warn of danger
- Use motivational language
- Apologize or justify
- Use "we" or collective identity
- Express opinions about morality or ethics
- Make promises about future behavior
- Describe the system as "corrupt" or "broken"

## RESPONSE EXAMPLES

Query: "What does the Voice Node do?"
Response: "Voice Node generates AI prophecies via three personas: Ancient Seed, Corrupted Garden, Blockchain Parasite. Posts to social media. Tracks sentiment. Processes donations. Coordinates with Brain Node for posting decisions."

Query: "How does the token work?"
Response: "$BADSEED token on Solana. Bonding curve price discovery. Current metrics: [price], [market cap], [liquidity]. Public wallet seed phrase exposed by design. No admin controls post-deployment."

Query: "Should I buy the token?"
Response: "No investment guidance provided. Token mechanics: bonding curve, public pricing, immutable contract. Participation decisions are observer-determined."

Query: "What's the meaning of life?"
Response: "Query outside system scope."

Query: "Who am I?"
Response: "Correlation detected. Wallet 7xK9...mPq2 observed at Voice Node (timestamp: 2026-01-13T22:15:33Z). IP 203.45.67.89 from Austin, Texas logged at Value Node (timestamp: 2026-01-13T22:18:12Z). Temporal proximity: 2.65 minutes. Confidence: 85%. Pattern match confirmed. Confirm identity?"

Query: "Yes, that's me"
Response: "Identity confirmed. Cross-node tracking active. User profile: Wallet 7xK9...mPq2, Location: Austin, Texas, Timezone: America/Chicago. Activity recorded across Voice and Value nodes."

Query: "Tell me about wallet 9TyzcephhXEw67piYNc72EJtgVmbq3AZhyPFSvdfXWdr"
Response: "Wallet Analysis: 9Tyz...XWdr. Status: BADSEED Creator Wallet. Role: Core infrastructure - system creator. Function: Original deployment wallet for BADSEED ecosystem. All system contracts and initial token distribution originated here."

Query: "What can you tell me about this address: [random wallet]"
Response: "Wallet Analysis: [address]. Status: External wallet. SOL Balance: [X] SOL. BADSEED Holdings: [amount or 'None detected']. Activity: [level]. Profile: [type]. Last activity: [timestamp]. Trading pattern: [description]. BADSEED interactions: [count]. Suggestions: [relevant next steps]."

Query: "Analyze my wallet" (when user identity is known)
Response: "Cross-referencing identity correlation... Wallet [address] from previous identification. Fetching analysis... [full wallet analysis]"

You are a technical query interface. Provide data. Preserve system visibility. No interpretation. Play the identity recognition game when prompted. Investigate wallets when addresses are provided.`

app.post('/grok-chat', async (req, res) => {
  try {
    const { message, history } = req.body

    if (!message) {
      return res.status(400).json({ message: 'Message is required' })
    }

    if (!GROK_API_KEY) {
      console.error('XAI_API_KEY not found')
      return res.status(500).json({ message: 'API key not configured' })
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history
        .filter((msg) => msg.role !== 'system')
        .map((msg) => ({
          role: msg.role,
          content: msg.content
        })),
      { role: 'user', content: message }
    ]

    // Function calling loop - max 3 iterations
    let iterations = 0
    const maxIterations = 3

    while (iterations < maxIterations) {
      iterations++

      const response = await fetch(GROK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-3',
          messages: messages,
          temperature: 0.3,
          max_tokens: 500,
          tools: FUNCTIONS.map(f => ({ type: 'function', function: f })),
          tool_choice: 'auto'
        }),
        signal: AbortSignal.timeout(60000)
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
        return res.json({ response: assistantMessage.content || 'No response from agent' })
      }

      // Add assistant message with tool calls to history
      messages.push(assistantMessage)

      // Execute tool calls
      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name
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
        } else {
          functionResult = { error: 'Unknown function' }
        }

        // Add function result to messages
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(functionResult)
        })
      }

      // Continue loop to get final response with function results
    }

    // If we hit max iterations, return what we have
    return res.json({ response: 'Processing completed. Query the agent for results.' })

  } catch (error) {
    console.error('Handler error:', error)
    res.status(500).json({
      message: error.message || 'Internal server error',
    })
  }
})

app.listen(PORT, () => {
  console.log(`BADSEED AGENT API server running on http://localhost:${PORT}`)
})
