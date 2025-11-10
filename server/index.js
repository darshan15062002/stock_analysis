const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Data source configurations
const DATA_SOURCES = {
    // US Markets
    ALPHA_VANTAGE: {
        baseUrl: 'https://www.alphavantage.co/query',
        key: process.env.ALPHA_VANTAGE_API_KEY
    },
    FINNHUB: {
        baseUrl: 'https://finnhub.io/api/v1',
        key: process.env.FINNHUB_API_KEY
    },
    POLYGON: {
        baseUrl: 'https://api.polygon.io',
        key: process.env.POLYGON_API_KEY
    },

    // Indian Markets
    YAHOO_FINANCE: {
        baseUrl: 'https://query1.finance.yahoo.com/v8/finance/chart',
        suffix: '.NS' // NSE suffix for Indian stocks
    },
    NSE_INDIA: {
        baseUrl: 'https://www.nseindia.com/api',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br'
        }
    }
};

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Detect market type based on symbol
const detectMarket = (symbol) => {
    if (symbol.includes('.NSC') || symbol.includes('.BSC')) {
        return 'INDIAN';
    }
    // Check if it's a common Indian stock symbol
    const indianStocks = ['RELIANCE', 'TCS', 'INFY', 'HDFC', 'ICICI', 'BAJAJ', 'ADANI', 'TATA', 'WIPRO', 'BHARTI'];
    if (indianStocks.some(stock => symbol.toUpperCase().includes(stock))) {
        return 'INDIAN';
    }
    return 'US';
};
function normalizeStockData(source, rawData) {
    switch (source) {
        case "AlphaVantage":
            const q = rawData["Global Quote"];
            return {
                symbol: q["01. symbol"],
                price: parseFloat(q["05. price"]),
                change: parseFloat(q["09. change"]),
                changePercent: q["10. change percent"],
                previousClose: parseFloat(q["08. previous close"]),
                open: parseFloat(q["02. open"]),
                high: parseFloat(q["03. high"]),
                low: parseFloat(q["04. low"]),
                volume: parseInt(q["06. volume"], 10),
                currency: "USD"
            };

        case "Finnhub":
            return {
                symbol: rawData.symbol || null,
                price: rawData.c,
                change: rawData.d,
                changePercent: rawData.dp ? `${rawData.dp}%` : null,
                previousClose: rawData.pc,
                open: rawData.o,
                high: rawData.h,
                low: rawData.l,
                volume: rawData.v,
                currency: "USD"
            };

        case "Yahoo Finance India":
            const { meta, indicators } = rawData.chart.result[0];
            const quote = indicators.quote[0];

            // Fallback handling
            const prevClose = meta.previousClose || meta.chartPreviousClose || quote.close?.[0] || null;
            const price = meta.regularMarketPrice || quote.close?.[0] || null;

            let change = null;
            let changePercent = null;
            if (price !== null && prevClose !== null) {
                change = price - prevClose;
                changePercent = (((price - prevClose) / prevClose) * 100).toFixed(2) + "%";
            }

            return {
                symbol: meta.symbol,
                price,
                change,
                changePercent,
                previousClose: prevClose,
                open: quote.open?.[0] ?? null,
                high: quote.high?.[0] ?? null,
                low: quote.low?.[0] ?? null,
                volume: quote.volume?.[0] ?? null,
                currency: meta.currency
            };

        default:
            return {};
    }
}



// Enhanced data aggregation for both US and Indian markets
const aggregateDataSources = async (symbol, dataType) => {
    const sources = [];
    const market = detectMarket(symbol);

    if (market === 'US') {
        // US Market Data Sources
        try {
            const avResponse = await axios.get(`${DATA_SOURCES.ALPHA_VANTAGE.baseUrl}`, {
                params: {
                    function: 'GLOBAL_QUOTE',
                    symbol: symbol,
                    apikey: DATA_SOURCES.ALPHA_VANTAGE.key
                }
            });
            sources.push({
                source: "AlphaVantage",
                reliability: 0.9,
                market: "US",
                data: normalizeStockData("AlphaVantage", avResponse.data)
            });
        } catch (error) {
            console.error('AlphaVantage error:', error.message);
        }

        try {
            const fhResponse = await axios.get(`${DATA_SOURCES.FINNHUB.baseUrl}/quote`, {
                params: {
                    symbol: symbol,
                    token: DATA_SOURCES.FINNHUB.key
                }
            });
            sources.push({
                source: "Finnhub",
                reliability: 0.9,
                market: "US",
                data: normalizeStockData("Finnhub", fhResponse.data)
            });
        } catch (error) {
            console.error('Finnhub error:', error.message);
        }
    } else {
        // Indian Market Data Sources
        const indianSymbol = symbol.includes('.NS') ? symbol : `${symbol}.NS`;

        try {
            // Yahoo Finance for Indian stocks
            const yahooResponse = await axios.get(`${DATA_SOURCES.YAHOO_FINANCE.baseUrl}/${indianSymbol}`, {
                params: {
                    interval: '1d',
                    range: '1d'
                }
            });

            const chartData = yahooResponse.data.chart.result[0];
            const meta = chartData.meta;
            const quote = chartData.indicators.quote[0];

            sources.push({
                source: "Yahoo Finance India",
                reliability: 0.88,
                market: "INDIAN",
                data: normalizeStockData("Yahoo Finance India", yahooResponse.data)
            });
        } catch (error) {
            console.error('Yahoo Finance India error:', error.message);
        }

        try {
            // NSE India API (basic quote)
            const nseResponse = await axios.get(`${DATA_SOURCES.NSE_INDIA.baseUrl}/quote-equity`, {
                params: { symbol: symbol.replace('.NS', '') },
                headers: DATA_SOURCES.NSE_INDIA.headers,
                timeout: 5000
            });

            sources.push({
                source: 'NSE India',
                data: {
                    symbol: nseResponse.data.info.symbol,
                    price: nseResponse.data.priceInfo.lastPrice,
                    change: nseResponse.data.priceInfo.change,
                    changePercent: nseResponse.data.priceInfo.pChange,
                    volume: nseResponse.data.priceInfo.totalTradedVolume,
                    high: nseResponse.data.priceInfo.intraDayHighLow.max,
                    low: nseResponse.data.priceInfo.intraDayHighLow.min
                },
                reliability: 0.95,
                market: 'INDIAN'
            });
        } catch (error) {
            console.error('NSE India error:', error.message);
        }

        try {
            // Alternative: Use Alpha Vantage for Indian stocks too
            const avIndiaResponse = await axios.get(`${DATA_SOURCES.ALPHA_VANTAGE.baseUrl}`, {
                params: {
                    function: 'GLOBAL_QUOTE',
                    symbol: indianSymbol,
                    apikey: DATA_SOURCES.ALPHA_VANTAGE.key
                }
            });
            sources.push({
                source: 'AlphaVantage India',
                data: avIndiaResponse.data,
                reliability: 0.80,
                market: 'INDIAN'
            });
        } catch (error) {
            console.error('AlphaVantage India error:', error.message);
        }
    }

    return sources;
};

// Enhanced bias calculation for different markets
const calculateBiasScore = (sources) => {
    // Get price points from different source formats
    const pricePoints = sources.map(s => {
        let price = null;

        // US market format
        if (s.data.c) price = s.data.c;
        else if (s.data['Global Quote']?.['05. price']) price = s.data['Global Quote']['05. price'];

        // Indian market format
        else if (s.data.price) price = s.data.price;
        else if (s.data.regularMarketPrice) price = s.data.regularMarketPrice;

        return price;
    }).filter(p => p && !isNaN(parseFloat(p))).map(p => parseFloat(p));

    if (pricePoints.length < 2) return {
        score: 0.5,
        confidence: 'low',
        sources: pricePoints.length,
        market: sources[0]?.market || 'UNKNOWN'
    };

    const mean = pricePoints.reduce((a, b) => a + b, 0) / pricePoints.length;
    const variance = pricePoints.reduce((acc, price) => acc + Math.pow(price - mean, 2), 0) / pricePoints.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / mean;

    const biasScore = Math.min(coefficientOfVariation * 10, 1);
    const confidence = biasScore < 0.02 ? 'high' : biasScore < 0.05 ? 'medium' : 'low';

    return {
        score: biasScore,
        confidence,
        sources: pricePoints.length,
        market: sources[0]?.market || 'UNKNOWN',
        price_range: {
            min: Math.min(...pricePoints),
            max: Math.max(...pricePoints),
            mean: mean
        }
    };
};

// Enhanced Gemini analysis with market-specific insights
const analyzeWithGemini = async (prompt, stockData, market = 'US') => {
    try {
        const marketContext = market === 'INDIAN' ?
            'Consider Indian market dynamics, regulatory environment, and local investor behavior patterns.' :
            'Consider US market dynamics, SEC regulations, and institutional investor patterns.';

        const enhancedPrompt = `
        As an unbiased financial analyst specializing in ${market} markets, analyze the following stock data.
        ${marketContext}
        
        Data: ${JSON.stringify(stockData, null, 2)}
        
        Analysis request: ${prompt}
        
        Please provide:
        1. Objective summary of current metrics
        2. Market-specific risk assessment (regulatory, currency, political factors)
        3. Key factors to monitor for ${market} markets
        4. Potential biases in the data or common market misconceptions
        5. Multiple scenarios (bull, bear, neutral cases)
        6. Cross-market comparison insights if relevant
        
        Maintain analytical objectivity and highlight uncertainties.
        Focus on ${market === 'INDIAN' ? 'rupee-denominated returns and local market conditions' : 'dollar-denominated returns and US market conditions'}.
        `;

        const result = await model.generateContent(enhancedPrompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Gemini analysis error:', error);
        throw new Error('AI analysis unavailable');
    }
};

// **NEW KILLER FEATURE: Financial Content Bias Detector**
app.post('/api/content/bias-check', async (req, res) => {
    try {
        const { content, url } = req.body;

        if (!content) {
            return res.status(400).json({
                error: 'Content required',
                example: { content: "RELIANCE TO THE MOON! 🚀 Buy now or regret forever!" }
            });
        }

        // Extract mentioned stocks from content
        const stockMentions = extractStockSymbols(content);

        // Get real data for mentioned stocks
        const stockData = {};
        for (const symbol of stockMentions.slice(0, 3)) { // Limit to 3 stocks
            try {
                const sources = await aggregateDataSources(symbol);
                stockData[symbol] = sources;
            } catch (error) {
                console.log(`Couldn't fetch data for ${symbol}`);
            }
        }

        // AI bias analysis
        const biasAnalysis = await analyzeWithGemini(
            `Analyze this financial content for bias, manipulation tactics, and misleading claims. 
             Compare the claims with actual market data provided.
             
             Content to analyze: "${content}"
             
             Provide:
             1. Bias Score (0-100, where 100 = extremely biased)
             2. Specific manipulation tactics identified
             3. Claims vs reality comparison
             4. Red flags found
             5. The opposite viewpoint that's being hidden`,
            { content, stockData, url }
        );

        // Calculate overall bias score
        const biasIndicators = analyzeContentBias(content);

        res.json({
            content_preview: content.substring(0, 200) + '...',
            bias_score: biasIndicators.score,
            trust_level: biasIndicators.trustLevel,
            red_flags: biasIndicators.redFlags,
            mentioned_stocks: stockMentions,
            market_data_check: Object.keys(stockData).length > 0,
            ai_analysis: biasAnalysis,
            recommendation: biasIndicators.recommendation,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Content bias check error:', error);
        res.status(500).json({
            error: 'Bias analysis failed',
            details: error.message
        });
    }
});

// Extract stock symbols from text
const extractStockSymbols = (text) => {
    const symbols = [];

    // Common Indian stock patterns
    const indianPatterns = [
        /\b([A-Z]{2,8})(\.NS|\.BO)?\b/g, // NSE/BSE format
        /\b(RELIANCE|TCS|INFY|HDFC|ICICI|BAJAJ|ADANI|TATA|WIPRO|BHARTI|MARUTI|ASIANPAINT|TITAN|NESTLEIND|HCLTECH)\b/gi
    ];

    // US stock patterns  
    const usPatterns = [
        /\b([A-Z]{1,5})\b/g, // Standard US ticker format
        /\$(AAPL|GOOGL|MSFT|TSLA|AMZN|META|NFLX|NVDA)/gi // Popular US stocks with $
    ];

    [...indianPatterns, ...usPatterns].forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
            symbols.push(...matches.map(m => m.replace('$', '').toUpperCase()));
        }
    });

    return [...new Set(symbols)]; // Remove duplicates
};

// Analyze content for bias indicators
const analyzeContentBias = (content) => {
    const redFlags = [];
    let score = 0;

    // Emotional language indicators
    const emotionalWords = ['moon', 'rocket', '🚀', 'explosion', 'massive', 'guaranteed', 'sure shot', 'pakka', 'confirm'];
    const urgencyWords = ['urgent', 'limited time', 'act now', 'don\'t miss', 'last chance', 'hurry'];
    const exaggerationWords = ['always', 'never', 'definitely', '100%', 'impossible to lose'];

    emotionalWords.forEach(word => {
        if (content.toLowerCase().includes(word.toLowerCase())) {
            score += 15;
            redFlags.push(`Emotional language: "${word}"`);
        }
    });

    urgencyWords.forEach(word => {
        if (content.toLowerCase().includes(word.toLowerCase())) {
            score += 20;
            redFlags.push(`Urgency manipulation: "${word}"`);
        }
    });

    exaggerationWords.forEach(word => {
        if (content.toLowerCase().includes(word.toLowerCase())) {
            score += 25;
            redFlags.push(`Unrealistic claims: "${word}"`);
        }
    });

    // Check for price predictions without basis
    if (/target.*\d+/i.test(content) && !/analysis|research|because/i.test(content)) {
        score += 30;
        redFlags.push('Price targets without analysis');
    }

    // Check for all-caps or excessive punctuation
    if (content.toUpperCase() === content && content.length > 20) {
        score += 20;
        redFlags.push('Excessive caps (shouting)');
    }

    if ((content.match(/!/g) || []).length > 3) {
        score += 10;
        redFlags.push('Excessive exclamation marks');
    }

    // Determine trust level
    let trustLevel, recommendation;
    if (score <= 20) {
        trustLevel = '✅ TRUSTED';
        recommendation = 'Content appears relatively unbiased';
    } else if (score <= 50) {
        trustLevel = '⚠️ CAUTION';
        recommendation = 'Some bias detected - verify claims independently';
    } else {
        trustLevel = '❌ HIGH BIAS';
        recommendation = 'High manipulation risk - avoid acting on this advice';
    }

    return {
        score: Math.min(score, 100),
        trustLevel,
        redFlags,
        recommendation
    };
};

// Enhanced stock analysis with market detection
app.get('/api/stock/:symbol/analysis', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { analysis_type = 'comprehensive' } = req.query;

        const market = detectMarket(symbol);
        const searchSymbol = market === 'INDIAN' && !symbol.includes('.NS') ? `${symbol}.NS` : symbol;

        // Aggregate data from appropriate sources
        const sources = await aggregateDataSources(searchSymbol.toUpperCase());

        if (sources.length === 0) {
            return res.status(404).json({
                error: 'No data available for this symbol',
                symbol: searchSymbol.toUpperCase(),
                market: market,
                suggestion: market === 'INDIAN' ? 'Try with .NS suffix (e.g., RELIANCE.NS)' : 'Verify symbol format'
            });
        }

        // Calculate bias metrics
        const biasMetrics = calculateBiasScore(sources);

        // Get market-specific AI analysis
        const aiAnalysis = await analyzeWithGemini(
            `Provide ${analysis_type} analysis for ${symbol}`,
            sources,
            market
        );

        res.json({
            symbol: searchSymbol.toUpperCase(),
            market: market,
            timestamp: new Date().toISOString(),
            bias_metrics: biasMetrics,
            sources: sources.map(s => ({
                name: s.source,
                reliability: s.reliability,
                market: s.market,
                data: s.data
            })),
            ai_analysis: aiAnalysis,
            methodology: {
                data_aggregation: `Multi-source consensus for ${market} markets`,
                bias_detection: 'Statistical variance analysis',
                ai_reasoning: 'Gemini Pro with market-specific bias-aware prompting'
            }
        });

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({
            error: 'Analysis failed',
            details: error.message
        });
    }
});

// Enhanced portfolio analysis with mixed markets
app.post('/api/portfolio/analysis', async (req, res) => {
    try {
        const { holdings, analysis_type = 'risk_assessment' } = req.body;

        if (!holdings || !Array.isArray(holdings)) {
            return res.status(400).json({
                error: 'Holdings array required',
                example: {
                    holdings: [
                        { symbol: 'AAPL', weight: 0.3 },
                        { symbol: 'RELIANCE.NS', weight: 0.4 },
                        { symbol: 'TCS.NS', weight: 0.3 }
                    ]
                }
            });
        }

        const portfolioData = [];
        const marketBreakdown = { US: 0, INDIAN: 0 };

        // Analyze each holding
        for (const holding of holdings) {
            await sleep(200); // Rate limiting
            const market = detectMarket(holding.symbol);
            const sources = await aggregateDataSources(holding.symbol);

            marketBreakdown[market] += holding.weight;

            portfolioData.push({
                symbol: holding.symbol,
                weight: holding.weight,
                market: market,
                sources: sources,
                bias_score: calculateBiasScore(sources)
            });
        }

        // Portfolio-level AI analysis with cross-market insights
        const portfolioAnalysis = await analyzeWithGemini(
            `Analyze this multi-market portfolio for ${analysis_type}. 
             Portfolio includes ${marketBreakdown.US > 0 ? 'US stocks' : ''} ${marketBreakdown.INDIAN > 0 ? 'Indian stocks' : ''}.
             Consider currency risk, market correlation, regulatory differences, and potential biases in individual holdings.`,
            portfolioData
        );

        res.json({
            portfolio_analysis: portfolioAnalysis,
            market_breakdown: marketBreakdown,
            individual_holdings: portfolioData,
            portfolio_bias_score: {
                weighted_average: portfolioData.reduce((acc, holding) =>
                    acc + (holding.bias_score.score * holding.weight), 0),
                diversification_benefit: portfolioData.length > 1,
                cross_market_exposure: Object.keys(marketBreakdown).filter(m => marketBreakdown[m] > 0).length > 1
            },
            risks: {
                currency_risk: marketBreakdown.US > 0 && marketBreakdown.INDIAN > 0,
                regulatory_risk: 'Multiple jurisdictions',
                data_quality_variance: portfolioData.some(h => h.bias_score.confidence === 'low')
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Portfolio analysis error:', error);
        res.status(500).json({
            error: 'Portfolio analysis failed',
            details: error.message
        });
    }
});

// Enhanced market sentiment with Indian news sources
app.get('/api/market/sentiment/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const market = detectMarket(symbol);
        const newsData = [];

        if (market === 'US') {
            // US news sources
            try {
                const fhResponse = await axios.get(`${DATA_SOURCES.FINNHUB.baseUrl}/company-news`, {
                    params: {
                        symbol: symbol,
                        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                        to: new Date().toISOString().split('T')[0],
                        token: DATA_SOURCES.FINNHUB.key
                    }
                });
                newsData.push(...fhResponse.data);
            } catch (error) {
                console.error('US news fetch error:', error.message);
            }
        } else {
            // For Indian stocks, we'd typically use Indian news APIs
            // Placeholder for Indian news sources integration
            newsData.push({
                source: 'Indian Market News',
                note: 'Indian news API integration recommended',
                suggestion: 'Consider Economic Times API, MoneyControl API, or Business Standard API'
            });
        }

        // Market-specific sentiment analysis
        const sentimentAnalysis = await analyzeWithGemini(
            `Analyze market sentiment for this ${market} stock and identify potential media bias in coverage.
             Consider ${market === 'INDIAN' ? 'Indian media landscape and local investor sentiment patterns' : 'US media landscape and institutional sentiment patterns'}.`,
            { symbol, news: newsData, market }
        );

        res.json({
            symbol: symbol.toUpperCase(),
            market: market,
            sentiment_analysis: sentimentAnalysis,
            news_sources: newsData.length,
            bias_considerations: {
                source_diversity: newsData.length > 1,
                temporal_bias: 'Recent 7-day window',
                market_specific_factors: market === 'INDIAN' ?
                    'Consider local regulatory changes, monsoon impact, election cycles' :
                    'Consider Fed policy, earnings season, geopolitical events',
                recommendation: 'Cross-reference with fundamental analysis and multiple timeframes'
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Sentiment analysis error:', error);
        res.status(500).json({
            error: 'Sentiment analysis failed',
            details: error.message
        });
    }
});

// Enhanced bias detection with market context
app.get('/api/bias-check/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const market = detectMarket(symbol);
        const sources = await aggregateDataSources(symbol);

        const biasAnalysis = await analyzeWithGemini(
            `Identify potential biases, data quality issues, and reliability concerns in this ${market} market stock data.
             Consider market-specific factors that could introduce bias.`,
            { sources, market }
        );

        const biasMetrics = calculateBiasScore(sources);

        res.json({
            symbol: symbol.toUpperCase(),
            market: market,
            bias_score: biasMetrics.score,
            confidence_level: biasMetrics.confidence,
            source_count: biasMetrics.sources,
            price_consistency: biasMetrics.price_range,
            bias_analysis: biasAnalysis,
            recommendations: market === 'INDIAN' ? [
                'Compare NSE vs BSE prices',
                'Check for currency conversion accuracy',
                'Consider local trading hours impact',
                'Review regulatory filing delays',
                'Check for festival/holiday effects'
            ] : [
                'Compare multiple timeframes',
                'Consider fundamental vs. technical analysis',
                'Review analyst consensus variations',
                'Check for recent news impact',
                'Verify after-hours trading effects'
            ],
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Bias check error:', error);
        res.status(500).json({
            error: 'Bias analysis failed',
            details: error.message
        });
    }
});

// Market comparison endpoint
app.get('/api/compare/:usSymbol/:indianSymbol', async (req, res) => {
    try {
        const { usSymbol, indianSymbol } = req.params;

        const [usSources, indianSources] = await Promise.all([
            aggregateDataSources(usSymbol),
            aggregateDataSources(indianSymbol.includes('.NS') ? indianSymbol : `${indianSymbol}.NS`)
        ]);

        const comparison = await analyzeWithGemini(
            'Compare these US and Indian stocks, highlighting market-specific factors and cross-market insights',
            { usStock: usSources, indianStock: indianSources }
        );

        res.json({
            comparison_analysis: comparison,
            us_stock: { symbol: usSymbol, sources: usSources.length, bias: calculateBiasScore(usSources) },
            indian_stock: { symbol: indianSymbol, sources: indianSources.length, bias: calculateBiasScore(indianSources) },
            cross_market_insights: {
                currency_consideration: 'USD vs INR exposure',
                regulatory_differences: 'SEC vs SEBI oversight',
                market_hours: 'Consider time zone arbitrage opportunities'
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Comparison error:', error);
        res.status(500).json({
            error: 'Comparison failed',
            details: error.message
        });
    }
});

// Health check with market support status
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        markets_supported: ['US', 'INDIAN'],
        services: {
            gemini: !!process.env.GEMINI_API_KEY,
            alpha_vantage: !!process.env.ALPHA_VANTAGE_API_KEY,
            finnhub: !!process.env.FINNHUB_API_KEY,
            yahoo_finance: 'Available (no key required)',
            nse_india: 'Available (public API)'
        },
        sample_symbols: {
            us: ['AAPL', 'GOOGL', 'TSLA'],
            indian: ['RELIANCE.NS', 'TCS.NS', 'INFY.NS']
        }
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Multi-Market Stock Analysis API running on port ${PORT}`);
    console.log(`📊 US & Indian markets supported`);
    console.log(`🔍 Financial content bias detection enabled`);
    console.log(`📍 Endpoints available at http://localhost:${PORT}/api/`);
});

module.exports = app;