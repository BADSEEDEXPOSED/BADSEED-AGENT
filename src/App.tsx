import AgentConsole from './components/AgentConsole'
import './styles/App.css'

function App() {
  return (
    <div className="app-container">
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
