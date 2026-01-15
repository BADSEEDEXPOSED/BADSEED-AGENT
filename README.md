# BADSEED AGENT

Virtual Assistant Query Interface for the BADSEED Ecosystem

## Overview

BADSEED AGENT is a read-only AI assistant powered by xAI's Grok that provides information about the BADSEED ecosystem, aggregating data from:

- **Voice Node** (badseed.netlify.app) - Prophecies, narratives, sentiment
- **Value Node** (badseedtoken.netlify.app) - Token metrics, market data, donations
- **Brain Node** (badseed-program) - Orchestration and coordination

## Features

- Terminal-style console interface
- Real-time chat with Grok-3 AI
- Query aggregation across all BADSEED nodes
- Identity correlation across nodes ("who am I?")
- Wallet analysis for any Solana address
- Dark cyberpunk theme matching BADSEED aesthetic
- Read-only information queries (no actions)

## Deployment Modes

### Cloud Deployment (Production)
The agent runs on Netlify as a serverless function. All functionality is self-contained.

### Local Development
For testing before deployment, run locally with the Express server.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file:

```env
# Required
XAI_API_KEY=your-xai-api-key-here

# Optional - enables full wallet analysis (get free key at helius.dev)
HELIUS_API_KEY=your-helius-api-key
```

### 3. Local Development

```bash
# Option A: Full Netlify dev environment
npm run start

# Option B: Express server for API testing
node server.js
```

### 4. Testing Against Cloud

To test the local frontend against the deployed cloud API, create `.env.local`:

```env
VITE_AGENT_API_URL=https://your-deployed-netlify-url.netlify.app
```

### 5. Deploy to Netlify

1. Push to GitHub repository
2. Connect repository to Netlify
3. Set environment variables in Netlify dashboard:
   - `XAI_API_KEY` (required)
   - `HELIUS_API_KEY` (optional, for wallet analysis)
4. Deploy

## Usage

Ask questions like:
- "What's the current token price?"
- "Show me the latest prophecy"
- "Who am I?" (identity correlation)
- "Tell me about wallet 9Tyz..." (wallet analysis)
- "What's the system activity?"

## Agent Capabilities

### Node Status Queries
- `getVoiceNodeStatus()` - Sentiment, prophecies, wallet status
- `getValueNodeStatus()` - Token metrics, price, market cap
- `getSystemActivity()` - Donations, AI logs, health

### Identity Recognition
- `getUserIdentity()` - Correlates users across Voice and Value nodes
- Matches wallet addresses with IP/location data
- Provides confidence scores for identification

### Wallet Analysis
- `analyzeWallet(address)` - Deep analysis of any Solana wallet
- Transaction history and patterns
- BADSEED token holdings detection
- Trading behavior profiling

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **AI**: xAI Grok-3 with function calling
- **Blockchain**: Helius API for Solana data
- **Styling**: Custom CSS (terminal theme)
- **Deployment**: Netlify Functions
- **Port**: 3003 (local dev)

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

## Project Structure

```
badseed-agent/
├── src/
│   ├── components/
│   │   └── AgentConsole.tsx
│   ├── services/
│   │   └── grokApi.ts
│   ├── styles/
│   └── App.tsx
├── netlify/
│   └── functions/
│       └── grok-chat.js      # Main agent function
├── server.js                  # Local Express server
├── correlation-endpoint.js    # User correlation logic
├── netlify.toml
└── package.json
```

## License

Part of the BADSEED project ecosystem
