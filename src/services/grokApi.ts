interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function sendMessage(userMessage: string, conversationHistory: Message[]): Promise<string> {
  try {
    const response = await fetch('/api/grok-chat', {
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
    const response = await fetch(`/.netlify/functions/fetch-node-data?node=${nodeType}`)

    if (!response.ok) {
      throw new Error(`Failed to fetch ${nodeType} node data`)
    }

    return await response.json()
  } catch (error) {
    console.error(`Node data fetch error (${nodeType}):`, error)
    throw error
  }
}
