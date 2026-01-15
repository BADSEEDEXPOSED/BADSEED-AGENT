# BADSEED AGENT

Virtual Assistant Query Interface for the BADSEED Ecosystem

## Overview

BADSEED AGENT is a read-only AI assistant powered by xAI's Grok that provides information about the BADSEED ecosystem, aggregating data from:

- **Voice Node** (badseed-exposed) - Prophecies, narratives, sentiment
- **Value Node** (badseed-token) - Token metrics, market data, donations
- **Brain Node** (badseed-program) - Orchestration and coordination

## Features

- Terminal-style console interface
- Real-time chat with Grok AI
- Query aggregation across all BADSEED nodes
- Dark cyberpunk theme matching BADSEED aesthetic
- Read-only information queries (no actions)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file with your xAI API key:

```env
XAI_API_KEY=your-xai-api-key-here
```

### 3. Development

```bash
npm run dev
```

Runs on http://localhost:3003

### 4. Build

```bash
npm run build
```

### 5. Deploy to Netlify

1. Connect repository to Netlify
2. Set environment variable: `XAI_API_KEY`
3. Deploy

## Usage

Ask questions like:
- "What's the current token price?"
- "Show me the latest prophecy"
- "What's the bonding curve progress?"
- "Explain the BADSEED ecosystem"

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **AI**: xAI Grok API
- **Styling**: Custom CSS (terminal theme)
- **Deployment**: Netlify Functions
- **Port**: 3003

## Project Structure

```
badseed-agent/
├── src/
│   ├── components/
│   │   └── AgentConsole.tsx
│   ├── services/
│   │   └── grokApi.ts
│   ├── styles/
│   │   ├── index.css
│   │   ├── App.css
│   │   └── AgentConsole.css
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   └── main.tsx
├── netlify/
│   └── functions/
│       ├── grok-chat.ts
│       └── fetch-node-data.ts
├── package.json
├── vite.config.ts
└── netlify.toml
```

## API Endpoints

### POST /.netlify/functions/grok-chat
Send messages to Grok AI assistant

**Request:**
```json
{
  "message": "What is BADSEED?",
  "history": []
}
```

**Response:**
```json
{
  "response": "BADSEED is a decentralized..."
}
```

### GET /.netlify/functions/fetch-node-data?node={type}
Fetch data from specific nodes

**Parameters:**
- `node`: "voice" | "value" | "brain"

**Response:**
```json
{
  "node": "value",
  "data": { ... },
  "timestamp": "2026-01-12T..."
}
```

## License

Part of the BADSEED project ecosystem
