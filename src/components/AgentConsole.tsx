import { useState, useRef, useEffect } from 'react'
import { sendMessage } from '../services/grokApi'
import '../styles/AgentConsole.css'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

function AgentConsole() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: 'BADSEED AGENT v1.0 initialized...\nConnected to Voice Node, Value Node, and Brain Node.\nType your query below.',
      timestamp: new Date()
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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

  return (
    <div className="console-container">
      <div className="console-header">
        <span className="console-title">// AGENT CONSOLE</span>
        <div className="console-status">
          <span className="status-indicator">●</span>
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
  )
}

export default AgentConsole
