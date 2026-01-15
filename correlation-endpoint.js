// Correlation logic to match users across Voice and Value nodes
// This would ideally be a Netlify function, but for now it's in the agent backend

export async function correlateUserActivity() {
    try {
        // Fetch wallet connections from Voice Node
        const walletRes = await fetch('https://badseed.netlify.app/.netlify/functions/analytics-get');
        const walletData = await walletRes.json();

        // Fetch visitor data from Value Node (using visitor-get endpoint)
        let visitorData = { recentVisitors: [], uniqueIPs: 0 };
        try {
            const visitorRes = await fetch('https://badseedtoken.netlify.app/.netlify/functions/visitor-get');
            if (visitorRes.ok) {
                const data = await visitorRes.json();
                // Transform visitor-get format to correlation format
                if (data.recentVisitors && Array.isArray(data.recentVisitors)) {
                    visitorData.recentVisitors = data.recentVisitors.map(visitor => ({
                        ip: visitor.ip,
                        location: `${visitor.city}, ${visitor.country}`,
                        city: visitor.city,
                        country: visitor.country,
                        timezone: visitor.timezone,
                        timestamp: visitor.timestamp,
                        userAgent: visitor.userAgent
                    }));
                    visitorData.uniqueIPs = data.uniqueIPs || 0;
                }
            }
        } catch (e) {
            console.log('Value Node visitor data not available:', e.message);
        }

        // If no visitor data, return wallet-only information
        if (!visitorData.recentVisitors || visitorData.recentVisitors.length === 0) {
            return {
                correlations: [],
                walletOnly: walletData.recentEvents?.slice(0, 10) || [],
                totalWallets: walletData.uniqueWallets || 0,
                totalVisitors: 0,
                matchRate: 0,
                status: 'partial',
                message: 'Voice Node wallet data available. Value Node visitor tracking pending deployment.'
            };
        }

        // Correlation logic: Match users who visited both pages within a 30-minute window
        const correlations = [];
        const TIME_WINDOW = 30 * 60 * 1000; // 30 minutes

        walletData.recentEvents?.forEach(walletEvent => {
            visitorData.recentVisitors?.forEach(visitorEvent => {
                const timeDiff = Math.abs(walletEvent.timestamp - visitorEvent.timestamp);

                // If visits happened within 30 minutes, likely same user
                if (timeDiff < TIME_WINDOW) {
                    const confidence = calculateConfidence(walletEvent, visitorEvent, timeDiff);

                    correlations.push({
                        walletAddress: walletEvent.walletAddress,
                        ip: visitorEvent.ip,
                        location: visitorEvent.location,
                        city: visitorEvent.city,
                        country: visitorEvent.country,
                        timezone: visitorEvent.timezone,
                        timeDifference: timeDiff,
                        confidence: confidence,
                        voiceNodeTime: new Date(walletEvent.timestamp).toISOString(),
                        valueNodeTime: new Date(visitorEvent.timestamp).toISOString(),
                        userAgent: visitorEvent.userAgent
                    });
                }
            });
        });

        // Sort by confidence and time proximity
        correlations.sort((a, b) => {
            if (b.confidence !== a.confidence) return b.confidence - a.confidence;
            return a.timeDifference - b.timeDifference;
        });

        return {
            correlations: correlations.slice(0, 20), // Top 20 matches
            totalWallets: walletData.uniqueWallets,
            totalVisitors: visitorData.uniqueIPs,
            matchRate: correlations.length > 0 ?
                (correlations.length / Math.max(walletData.uniqueWallets, 1) * 100).toFixed(1) : 0,
            status: 'full'
        };
    } catch (error) {
        console.error('Correlation error:', error);
        return { error: 'Correlation service unavailable', correlations: [] };
    }
}

function calculateConfidence(walletEvent, visitorEvent, timeDiff) {
    let confidence = 50; // Base confidence

    // Time proximity increases confidence
    if (timeDiff < 5 * 60 * 1000) confidence += 30; // Within 5 minutes: +30
    else if (timeDiff < 15 * 60 * 1000) confidence += 20; // Within 15 minutes: +20
    else confidence += 10; // Within 30 minutes: +10

    // User agent similarity (rough check)
    if (walletEvent.userAgent && visitorEvent.userAgent) {
        if (walletEvent.userAgent === visitorEvent.userAgent) confidence += 20;
    }

    return Math.min(confidence, 100);
}
