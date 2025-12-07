const { Perplexity } = require('@perplexity-ai/perplexity_ai');
const axios = require('axios');


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


class IndianStockIntelligence {
    constructor() {
        this.perplexity = new Perplexity({
            apiKey: process.env.PERPLEXITY_API_KEY
        });
        this.cache = new Map();
    }

    async analyze(symbol, companyName) {
        const cacheKey = `${symbol}:${new Date().toDateString()}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        const analysis = await this.perplexity.chat.completions.create({
            model: 'sonar',
            messages: [{ role: 'user', content: STOCK_ANALYSIS_PROMPT(symbol, companyName) }],
            temperature: 0.1,
            max_tokens: 4000,
            top_p: 0.9,
            stream: false
        })

        const jsonMatch = analysis.choices[0].message.content.match(/\{[\s\S]*\}/);

        console.log(jsonMatch);

        if (!jsonMatch) throw new Error('Invalid JSON from Perplexity');

        const data = JSON.parse(jsonMatch[0]);
        this.cache.set(cacheKey, data);

        return data;
    }
}

module.exports = IndianStockIntelligence;