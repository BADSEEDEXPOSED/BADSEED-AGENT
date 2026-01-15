export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

export interface VoiceNodeData {
  latestProphecy: {
    content: string
    sentiment: string
    timestamp: string
  }
  dailyPostStatus: string
  queueLength: number
  lastPostedAt: string
}

export interface ValueNodeData {
  tokenMetrics: {
    price: number
    marketCap: number
    bondingProgress: number
    totalDonations: number
  }
  tradingActivity: {
    volume24h: number
    priceChange24h: number
  }
  mode: string
}

export interface BrainNodeData {
  status: string
  lastThoughtCycle: string
  activeConnections: string[]
}

export interface NodeDataResponse {
  node: 'voice' | 'value' | 'brain'
  data: VoiceNodeData | ValueNodeData | BrainNodeData
  timestamp: string
}
