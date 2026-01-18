import AgentConsole from './components/AgentConsole'
import VideoBackground from './components/VideoBackground'
import './styles/App.css'

function App() {
  return (
    <div className="app-container">
      <VideoBackground />
      <div className="page-title">
        BADSEED AGENT<br />
        <span className="page-subtitle">Query Interface // Data Oracle</span>
      </div>

      <main className="app-main">
        <AgentConsole />
      </main>
    </div>
  )
}

export default App
