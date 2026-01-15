# Identity Tracking Integration Guide

## Overview
The BADSEED AGENT now has detective capabilities to correlate users across Voice and Value nodes by matching wallet connections with visitor IP/location data.

## How It Works

### 1. Voice Node (badseed-exposed) - Wallet Tracking
When a user connects their wallet on the Voice Node page, send their wallet address to the analytics endpoint:

```javascript
// In your wallet connection handler
async function onWalletConnected(walletAddress) {
  try {
    await fetch('https://badseed.netlify.app/.netlify/functions/analytics-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: walletAddress,
        eventType: 'wallet_connect'
      })
    });
  } catch (error) {
    console.error('Analytics tracking failed:', error);
  }
}
```

### 2. Value Node (badseed-token) - Visitor Tracking
When a user visits the Value Node page, automatically track their visit:

```javascript
// On page load
useEffect(() => {
  async function trackVisit() {
    try {
      await fetch('https://badseed-token.netlify.app/.netlify/functions/visitor-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Visitor tracking failed:', error);
    }
  }

  trackVisit();
}, []);
```

### 3. Agent Correlation
The agent automatically correlates users who:
- Connected wallet on Voice Node
- Visited Value Node within 30 minutes

## The Identity Recognition Game

### User Flow:
1. **User visits both pages** (in any order, within 30 minutes)
2. **User asks agent**: "Who am I?" or "Do you know me?"
3. **Agent investigates**: Calls `getUserIdentity()` function
4. **Agent responds** with correlation data:
   - Wallet address (truncated)
   - IP address
   - Geographic location
   - Confidence score
   - Time proximity
5. **User confirms or denies**
6. **Agent acknowledges** and provides unique message

### Example Interaction:

**User**: "Who am I?"

**Agent**: "Correlation detected. Wallet 7xK9...mPq2 observed at Voice Node (2026-01-13T22:15:33Z). IP 203.45.67.89 from Austin, Texas logged at Value Node (2026-01-13T22:18:12Z). Temporal proximity: 2.65 minutes. Confidence: 85%. Pattern match confirmed. Confirm identity?"

**User**: "Yes, that's me!"

**Agent**: "Identity confirmed. Cross-node tracking active. User profile: Wallet 7xK9...mPq2, Location: Austin, Texas, Timezone: America/Chicago. Activity recorded across Voice and Value nodes."

## Privacy Considerations

- Wallet addresses are public blockchain data
- IP addresses are only stored temporarily (7 days max)
- Geolocation is approximate (city level)
- No personally identifiable information is stored
- Users can confirm or deny correlations

## Confidence Scoring

The system calculates confidence based on:
- **Time proximity** (closer = higher confidence)
  - <5 minutes: +30 points
  - <15 minutes: +20 points
  - <30 minutes: +10 points
- **User agent matching**: +20 points if identical
- **Base confidence**: 50 points

Confidence levels:
- **High (>80%)**: "Pattern match confirmed"
- **Medium (50-80%)**: "Probable match identified"
- **Low (<50%)**: "Insufficient correlation data"

## Deployment

1. Deploy new Netlify functions to both nodes
2. Add frontend tracking calls
3. Restart agent server
4. Test the identity game!

The agent will now be able to "recognize" users who explore both parts of the BADSEED ecosystem.
