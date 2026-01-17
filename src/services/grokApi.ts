interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// Configuration: Set to deployed URL when testing against cloud, empty for local
// When deployed on Netlify, this should be empty (uses relative paths)
// For local testing against cloud, set to your deployed Netlify URL
const AGENT_API_BASE = import.meta.env.VITE_AGENT_API_URL || ''

export async function sendMessage(userMessage: string, conversationHistory: Message[]): Promise<string> {
  try {
    // Use the cloud API if configured, otherwise use relative path
    // Relative path works for both local (netlify dev) and deployed
    const apiUrl = AGENT_API_BASE
      ? `${AGENT_API_BASE}/.netlify/functions/grok-chat`
      : '/.netlify/functions/grok-chat'

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: userMessage,
        history: conversationHistory.slice(-10) // Keep last 10 messages for context
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to get response from BADSEED AGENT')
    }

    const data = await response.json()
    return data.response
  } catch (error) {
    console.error('Grok API Error:', error)
    throw error
  }
}

export async function fetchNodeData(nodeType: 'voice' | 'value' | 'brain'): Promise<any> {
  try {
    const apiUrl = AGENT_API_BASE
      ? `${AGENT_API_BASE}/.netlify/functions/fetch-node-data?node=${nodeType}`
      : `/.netlify/functions/fetch-node-data?node=${nodeType}`

    const response = await fetch(apiUrl)

    if (!response.ok) {
      throw new Error(`Failed to fetch ${nodeType} node data`)
    }

    return await response.json()
  } catch (error) {
    console.error(`Node data fetch error (${nodeType}):`, error)
    throw error
  }
}
