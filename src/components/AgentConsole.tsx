import { useState, useRef, useEffect } from 'react'
import { sendMessage } from '../services/grokApi'
import '../styles/AgentConsole.css'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

interface ActivityItem {
  timestamp: number
  time: string
  category: string
  query: string
  response: string | null
  functionsUsed: string[]
  userIP: string
}

interface LiveFeedData {
  activities: ActivityItem[]
  todayStats: {
    totalQueries: number
    categories: Record<string, number>
  }
  totalAllTime: number
  lastUpdate: string | null
}

function AgentConsole() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: 'BADSEED AGENT v2.0 initialized...\nConnected to Voice Node, Value Node, and Brain Node.\n11 data functions available. Type your query below.',
      timestamp: new Date()
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [liveFeed, setLiveFeed] = useState<LiveFeedData | null>(null)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const toggleExpanded = (index: number) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Fetch live feed on mount and after each message
  // Both local and deployed show cloud activity (cloud queries are public)
  // Local queries are logged separately but not displayed
  const fetchLiveFeed = async () => {
    try {
      // Always fetch cloud activity - it's the public feed
      // Local queries are logged to 'local' key but we display 'cloud' everywhere
      const url = `/.netlify/functions/live-feed?limit=10&source=cloud`

      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setLiveFeed(data)
        setFeedError(null)
      } else {
        console.error('Live feed response not ok:', response.status)
        setFeedError(`Feed error: ${response.status}`)
      }
    } catch (err) {
      console.error('Live feed fetch error:', err)
      setFeedError('Feed unavailable')
    }
  }

  useEffect(() => {
    fetchLiveFeed()
    // Poll every 30 seconds
    const interval = setInterval(fetchLiveFeed, 30000)
    return () => clearInterval(interval)
  }, [])

  // Refresh feed and refocus input after sending a message
  useEffect(() => {
    if (!isLoading && messages.length > 1) {
      // Small delay to let the server log the activity
      setTimeout(fetchLiveFeed, 1000)
      // Refocus the input field so user can type again immediately
      inputRef.current?.focus()
    }
  }, [isLoading])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await sendMessage(input.trim(), messages)

      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: Message = {
        role: 'system',
        content: `ERROR: ${error instanceof Error ? error.message : 'Failed to connect to BADSEED AGENT'}`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'identity': '#ff6b6b',
      'wallet_analysis': '#4ecdc4',
      'token_metrics': '#45b7d1',
      'voice_node': '#96ceb4',
      'system_activity': '#dda0dd',
      'education': '#f7dc6f',
      'general': '#00ff41'
    }
    return colors[category] || '#00ff41'
  }

  return (
    <div className="agent-layout">
      {/* Main Console */}
      <div className="console-container">
        <div className="console-header">
          <span className="console-title">// AGENT CONSOLE</span>
          <div className="console-status">
            <span className="status-indicator"></span>
            <span>CONNECTED TO BADSEED NETWORK</span>
          </div>
          <div className="console-controls">
            <button className="control-btn" title="Reload page" onClick={() => window.location.reload()}>
              RELOAD
            </button>
            <button className="control-btn" title="Clear console" onClick={() => setMessages([])}>
              CLEAR
            </button>
          </div>
        </div>

        <div className="console-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message message-${msg.role}`}>
              <span className="message-timestamp">[{formatTime(msg.timestamp)}]</span>
              <span className="message-prefix">
                {msg.role === 'user' ? '> ' : msg.role === 'assistant' ? '< AGENT: ' : '# '}
              </span>
              <span className="message-content">{msg.content}</span>
            </div>
          ))}
          {isLoading && (
            <div className="message message-system">
              <span className="message-prefix"># </span>
              <span className="message-content loading">Processing query...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="console-input-form">
          <span className="input-prompt">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter query..."
            className="console-input"
            disabled={isLoading}
            autoComplete="off"
          />
          <button type="submit" className="submit-btn" disabled={isLoading || !input.trim()}>
            SEND
          </button>
        </form>
      </div>

      {/* Live Output Panel */}
      <div className="live-panel">
        <div className="live-panel-header">
          <span className="live-panel-title">// LIVE AGENT OUTPUT</span>
          <button className="refresh-btn" onClick={fetchLiveFeed} title="Refresh feed">
            REFRESH
          </button>
        </div>

        {/* Stats Section */}
        <div className="live-stats">
          <div className="stat-item">
            <span className="stat-label">TODAY</span>
            <span className="stat-value">{liveFeed?.todayStats?.totalQueries || 0}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">ALL TIME</span>
            <span className="stat-value">{liveFeed?.totalAllTime || 0}</span>
          </div>
        </div>

        {/* Category Breakdown */}
        {liveFeed?.todayStats?.categories && Object.keys(liveFeed.todayStats.categories).length > 0 && (
          <div className="category-breakdown">
            {Object.entries(liveFeed.todayStats.categories).map(([cat, count]) => (
              <span key={cat} className="category-tag" style={{ borderColor: getCategoryColor(cat) }}>
                {cat}: {count}
              </span>
            ))}
          </div>
        )}

        {/* Activity Feed */}
        <div className="activity-feed">
          <div className="feed-title">RECENT QUERIES</div>
          {feedError && <div className="feed-error">{feedError}</div>}
          {!liveFeed?.activities?.length && !feedError && (
            <div className="feed-empty">No activity yet</div>
          )}
          {liveFeed?.activities?.map((activity, idx) => (
            <div
              key={idx}
              className={`activity-item ${expandedItems.has(idx) ? 'expanded' : ''}`}
              onClick={() => toggleExpanded(idx)}
            >
              <div className="activity-header">
                <span className="activity-time">{activity.time}</span>
                <span
                  className="activity-category"
                  style={{ color: getCategoryColor(activity.category) }}
                >
                  {activity.category}
                </span>
                <span className="activity-toggle">{expandedItems.has(idx) ? '▼' : '▶'}</span>
              </div>
              <div className="activity-query">"{activity.query}{activity.query.length >= 150 ? '...' : ''}"</div>
              {activity.functionsUsed?.length > 0 && (
                <div className="activity-functions">
                  {activity.functionsUsed.map((fn, i) => (
                    <span key={i} className="function-tag">{fn}</span>
                  ))}
                </div>
              )}
              {expandedItems.has(idx) && activity.response && (
                <div className="activity-response">
                  <div className="response-label">AGENT RESPONSE:</div>
                  <div className="response-content">{activity.response}</div>
                </div>
              )}
              {expandedItems.has(idx) && !activity.response && (
                <div className="activity-response no-response">
                  <span className="response-label">No response logged</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Last Update */}
        {liveFeed?.lastUpdate && (
          <div className="last-update">
            Last: {new Date(liveFeed.lastUpdate).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  )
}

export default AgentConsole
