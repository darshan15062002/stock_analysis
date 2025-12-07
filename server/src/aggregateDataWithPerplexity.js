// ==================== INSTALL ====================
// npm install perplexity-ai

const { Perplexity } = require('perplexity-ai');

// Initialize Perplexity (get key from perplexity.ai/api)
const perplexity = new Perplexity({
    apiKey: process.env.PERPLEXITY_API_KEY
});

// ==================== PROMPT ENGINEERING ====================
const STOCK_ANALYSIS_PROMPT = (symbol, name) => `
You are a Senior Indian Stock Market Analyst. Provide a COMPREHENSIVE analysis of ${name} (${symbol}) in valid JSON format.

CRITICAL REQUIREMENTS:
- Return ONLY valid JSON, no markdown, no explanations
- Use EXACT keys specified below
- Provide current market data as of today's date
- Include price, technical, fundamental, news, and risk data
- Quantify everything with numbers

OUTPUT FORMAT:
{
  "symbol": "${symbol}",
  "company_name": "${name}",
  "last_updated": "DD-MM-YYYY HH:MM IST",
  
  "price_data": {
    "current_price": number (₹),
    "day_change": number (₹),
    "day_change_percent": number (%),
    "previous_close": number (₹),
    "day_high": number (₹),
    "day_low": number (₹),
    "volume": number (shares),
    "vwap": number (₹)
  },
  
  "technical_analysis": {
    "trend": "bullish/bearish/neutral",
    "rsi_14": number (0-100),
    "sma_20": number (₹),
    "sma_50": number (₹),
    "support_level": number (₹),
    "resistance_level": number (₹),
    "volatility": "low/medium/high",
    "chart_pattern": "consolidation/uptrend/downtrend"
  },
  
  "fundamental_insights": {
    "pe_ratio": number,
    "pb_ratio": number,
    "roe_percent": number,
    "market_cap": "₹X.XX Cr",
    "dividend_yield": number (%),
    "q2_2024_revenue_growth": number (%),
    "q2_2024_profit_growth": number (%)
  },
  "recent_news": [
    {
      "headline": "string",
      "impact": "positive/negative/neutral",
      "date": "DD-MM-YYYY",
      "source": "Economic Times/Moneycontrol/etc"
    }
  ],
  
  "corporate_actions": {
    "ex_dividend_date": "DD-MM-YYYY or null",
    "bonus_ratio": "string or null",
    "split_ratio": "string or null",
    "board_meeting_date": "DD-MM-YYYY or null"
  },
  
  "risk_alerts": [
    {
      "type": "regulatory/earnings/market",
      "severity": "high/medium/low",
      "description": "string"
    }
  ],
  
  "analyst_consensus": {
    "recommendation": "buy/hold/sell",
    "target_price": number (₹),
    "upside_potential": number (%)
  },
  
  "your_recommendation": {
    "action": "buy_more/hold/partial_profit/full_exit",
    "confidence": "high/medium/low",
    "rationale": "3 bullet points as single string"
  }
}

DATA TO ANALYZE:
- Current NSE/BSE trading price and day's movement
- 20-day and 50-day moving averages
- Key support and resistance levels
- Latest quarterly results (Q2 FY25 if available)
- Major news in last 7 days
- Upcoming corporate actions
- SEBI filings or announcements
- Technical chart pattern
- Fundamental valuation vs peers
- Material risk factors

STOCK: ${name} (${symbol})`;


async function aggregateDataWithPerplexity(symbol, companyName) {
    try {
        console.log(`🤖 Querying Perplexity for ${symbol}...`);

        const response = await perplexity.search(STOCK_ANALYSIS_PROMPT(symbol, companyName), {
            model: 'llama-3.1-sonar-small-128k-online', // Optimized for web search
            return_citations: true,
            temperature: 0.2 // Factual, low creativity
        });

        // Parse JSON from response
        const jsonMatch = response.result.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in Perplexity response');
        }

        const structuredData = JSON.parse(jsonMatch[0]);

        return {
            source: 'Perplexity AI',
            reliability: 0.92, // High due to multi-source synthesis
            market: 'INDIAN',
            data: structuredData,
            citations: response.citations
        };

    } catch (error) {
        console.error(`Perplexity failed for ${symbol}:`, error.message);
        return null;
    }
}
