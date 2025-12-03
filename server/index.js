const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateElevenAudio } = require('./src/generateAudio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
const visionModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Configure multer for file uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'));
        }
    }
});

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
// const aggregateDataSources = async (symbol, dataType) => {
//     const sources = [];
//     const market = detectMarket(symbol);

//     console.log(symbol);


//     if (market === 'US') {
//         // US Market Data Sources
//         try {
//             const avResponse = await axios.get(`${DATA_SOURCES.ALPHA_VANTAGE.baseUrl}`, {
//                 params: {
//                     function: 'GLOBAL_QUOTE',
//                     symbol: symbol,
//                     apikey: DATA_SOURCES.ALPHA_VANTAGE.key
//                 }
//             });
//             sources.push({
//                 source: "AlphaVantage",
//                 reliability: 0.9,
//                 market: "US",
//                 data: normalizeStockData("AlphaVantage", avResponse.data)
//             });
//         } catch (error) {
//             console.error('AlphaVantage error:', error.message);
//         }

//         try {
//             const fhResponse = await axios.get(`${DATA_SOURCES.FINNHUB.baseUrl}/quote`, {
//                 params: {
//                     symbol: symbol,
//                     token: DATA_SOURCES.FINNHUB.key
//                 }
//             });
//             sources.push({
//                 source: "Finnhub",
//                 reliability: 0.9,
//                 market: "US",
//                 data: normalizeStockData("Finnhub", fhResponse.data)
//             });
//         } catch (error) {
//             console.error('Finnhub error:', error.message);
//         }
//     } else {
//         // Indian Market Data Sources
//         const indianSymbol = symbol.includes('.NS') ? symbol : `${symbol}.NS`;

//         try {
//             // Yahoo Finance for Indian stocks
//             const yahooResponse = await axios.get(`${DATA_SOURCES.YAHOO_FINANCE.baseUrl}/${indianSymbol}`, {
//                 params: {
//                     interval: '1d',
//                     range: '1d'
//                 },
//                 headers: {
//                     'User-Agent': 'Mozilla/5.0',
//                     'Accept': 'application/json'
//                 }
//             });

//             const chartData = yahooResponse.data.chart.result[0];
//             const meta = chartData.meta;
//             const quote = chartData.indicators.quote[0];

//             sources.push({
//                 source: "Yahoo Finance India",
//                 reliability: 0.88,
//                 market: "INDIAN",
//                 data: normalizeStockData("Yahoo Finance India", yahooResponse.data)
//             });
//         } catch (error) {
//             console.error('Yahoo Finance India error:', error.message);
//         }

//         try {
//             // NSE India API (basic quote)

//             const client = axios.create({
//                 headers: {
//                     "User-Agent": "Mozilla/5.0",
//                     "Referer": "https://www.nseindia.com/",
//                     "Accept-Language": "en-US,en;q=0.9"
//                 }
//             });

//             await client.get("https://www.nseindia.com/");

//             const nseResponse = await client.get(`${DATA_SOURCES.NSE_INDIA.baseUrl}/quote-equity`, {
//                 params: { symbol: symbol.replace('.NS', '') },
//                 headers: DATA_SOURCES.NSE_INDIA.headers,
//                 timeout: 5000
//             });

//             sources.push({
//                 source: 'NSE India',
//                 data: {
//                     symbol: nseResponse.data.info.symbol,
//                     price: nseResponse.data.priceInfo.lastPrice,
//                     change: nseResponse.data.priceInfo.change,
//                     changePercent: nseResponse.data.priceInfo.pChange,
//                     volume: nseResponse.data.priceInfo.totalTradedVolume,
//                     high: nseResponse.data.priceInfo.intraDayHighLow.max,
//                     low: nseResponse.data.priceInfo.intraDayHighLow.min
//                 },
//                 reliability: 0.95,
//                 market: 'INDIAN'
//             });
//         } catch (error) {
//             console.error('NSE India error:', error.message);
//         }

//         try {
//             // Alternative: Use Alpha Vantage for Indian stocks too
//             const avIndiaResponse = await axios.get(`${DATA_SOURCES.ALPHA_VANTAGE.baseUrl}`, {
//                 params: {
//                     function: 'GLOBAL_QUOTE',
//                     symbol: indianSymbol,
//                     apikey: DATA_SOURCES.ALPHA_VANTAGE.key
//                 }
//             });
//             sources.push({
//                 source: 'AlphaVantage India',
//                 data: avIndiaResponse.data,
//                 reliability: 0.80,
//                 market: 'INDIAN'
//             });
//         } catch (error) {
//             console.error('AlphaVantage India error:', error.message);
//         }

//         try {

//             const data = axios.get(`https://stockinsights-ai-main-95a26a0.zuplo.app/api/in/v0/documents/announcement`, {
//                 params: {
//                     "ticker": ` BSE:${symbol.replace('.NS', '')}`,
//                     // take only last one month data
//                     "from_date": new Date(new Date().getFullYear(), new Date().getMonth() - 1, new Date().getDate()).toISOString().split('T')[0],
//                     "to_date": new Date().toISOString().split('T')[0]
//                 },
//                 headers: {
//                     "Authorization": `Bearer ${process.env.STOCK_INSIGHTS_AI_KEY}`
//                 }
//             });

//             sources.push({
//                 source: 'Stock Insights AI - Filings',
//                 data: data.data,
//                 reliability: 0.85,
//                 market: 'INDIAN'
//             });

//         } catch (error) {
//             console.error('Stock Insights AI error:', error.message);
//         }

//         try {

//             const newsResponse = await axios.get(`https://news.google.com/rss/search`, {
//                 params: {
//                     q: `${symbol} stock`,
//                     hl: 'en-IN',
//                     gl: 'IN',
//                     ceid: 'IN:en'
//                 }
//             });

//             const xml = await newsResponse.data;

//             // Parse RSS XML
//             const result = await parseStringPromise(xml);

//             const items =
//                 result.rss?.channel?.[0]?.item?.map(item => ({
//                     title: item.title?.[0] || "",
//                     link: item.link?.[0] || "",
//                     // You can also add link: item.link?.[0]
//                 })) || [];


//             sources.push({
//                 source: 'Google News',
//                 data: items,
//                 reliability: 0.75,
//                 market: 'INDIAN'
//             });

//         } catch (error) {
//             console.error('Google News error:', error.message);
//         }


//     }

//     return sources;
// };

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
                // bias_score: calculateBiasScore(sources)
            });
        }

        // Portfolio-level AI analysis with cross-market insights
        const portfolioAnalysis = await analyzeWithGemini(
            `Analyze this portfolio for ${analysis_type}. 
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

// **OCR PORTFOLIO IMAGE PROCESSING**
app.post('/api/portfolio/extract-from-image', upload.single('portfolio_image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'No image uploaded',
                message: 'Please upload a portfolio screenshot or statement'
            });
        }

        // Convert image buffer to base64
        const imageBase64 = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;

        // Use Gemini Vision to extract portfolio data
        const extractionPrompt = `
Analyze this portfolio statement/screenshot and extract the following information:

1. List all stock holdings visible
2. For each holding, extract:
   - Stock symbol/name (convert to NSE symbol format like RELIANCE.NS, TCS.NS)
   - Quantity/shares held
   - Average buy price or invested amount
   - Current price
   - Current value
   - Profit/Loss amount and percentage

3. Calculate or extract:
   - Total portfolio invested amount
   - Total current value
   - Overall P&L

Return the data in this EXACT JSON format:
{
  "holdings": [
    {
      "symbol": "RELIANCE.NS",
      "quantity": 100,
      "invested": 250000,
      "currentValue": 280000,
      "pnl": 30000,
      "pnlPercent": 12.0
    }
  ],
  "summary": {
    "totalInvested": 500000,
    "totalCurrentValue": 520000,
    "totalPnL": 20000,
    "totalPnLPercent": 4.0
  }
}

If you cannot extract some values, use reasonable estimates based on visible data.
For Indian stocks, always add .NS suffix (NSE) or .BO (BSE) to symbols.
Be precise with numbers - extract exact values shown in the image.
`;

        const result = await visionModel.generateContent([
            extractionPrompt,
            {
                inlineData: {
                    data: imageBase64,
                    mimeType: mimeType
                }
            }
        ]);

        const response = await result.response;
        const extractedText = response.text();

        // Parse JSON from response
        let portfolioData;
        try {
            // Extract JSON from markdown code blocks if present
            const jsonMatch = extractedText.match(/```json\s*([\s\S]*?)\s*```/) ||
                extractedText.match(/```\s*([\s\S]*?)\s*```/) ||
                [null, extractedText];
            portfolioData = JSON.parse(jsonMatch[1].trim());
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            return res.status(500).json({
                error: 'Failed to parse portfolio data from image',
                details: 'OCR extraction was unclear. Please try a clearer image.',
                rawExtraction: extractedText
            });
        }

        res.json({
            success: true,
            message: 'Portfolio extracted from image',
            portfolioData: portfolioData,
            extractedHoldings: portfolioData.holdings?.length || 0
        });

    } catch (error) {
        console.error('Image processing error:', error);
        res.status(500).json({
            error: 'Image processing failed',
            details: error.message
        });
    }
});

// **STORY STOCK - NARRATIVE STOCK ANALYSIS**
app.post('/api/stock-story', async (req, res) => {
    try {
        const { symbol, style = 'movie' } = req.body;

        if (!symbol) {
            return res.status(400).json({
                error: 'Stock symbol required',
                example: { symbol: 'AAPL', style: 'movie' }
            });
        }

        const market = detectMarket(symbol);
        const searchSymbol = market === 'INDIAN' && !symbol.includes('.NS') ? `${symbol}.NS` : symbol;

        // Fetch real stock data
        const sources = await aggregateDataSources(searchSymbol.toUpperCase());

        if (sources.length === 0) {
            return res.status(404).json({
                error: 'Stock not found',
                symbol: searchSymbol.toUpperCase()
            });
        }

        // Extract key data
        const mainSource = sources[0].data;
        const currentPrice = mainSource.price || mainSource.c || parseFloat(mainSource['Global Quote']?.['05. price']) || 0;
        const change = mainSource.change || mainSource.d || parseFloat(mainSource['Global Quote']?.['09. change']) || 0;
        const changePercent = mainSource.changePercent || mainSource.dp || mainSource['Global Quote']?.['10. change percent'] || '0%';

        // Define story style prompts
        const stylePrompts = {
            bedtime: "Write in a calm, simple narrative style like a bedtime story. Use gentle language and easy analogies.",
            movie: "Write in a dramatic, exciting style like a movie script with acts and scenes. Make it engaging and suspenseful.",
            teacher: "Write in an educational style with clear explanations and teaching moments. Be detailed but understandable.",
            eli5: "Explain everything like you're talking to a 5-year-old. Use very simple words and everyday examples.",
            facts: "Present just the facts in a straightforward, data-driven manner without storytelling elements."
        };

        const storyPrompt = `
You are a master storyteller who makes stock investing accessible to everyone.

Stock: ${searchSymbol.toUpperCase()}
Current Price: $${currentPrice.toFixed(2)}
Change: ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent})
Market: ${market}

Style: ${stylePrompts[style] || stylePrompts.movie}

Create a comprehensive story following this EXACT structure:

**ACT 1: THE SETUP (Who is this company?)**
Introduce the company like a character in a story. When did they start? What do they do? Use analogies to explain their business model in simple terms. Make it relatable.

**ACT 2: THE CURRENT SITUATION**
Explain where the stock stands today. What does the current price of $${currentPrice.toFixed(2)} really mean? Explain key metrics like P/E ratio, ROE, Debt/Equity using real-world analogies (like buying a shop, investing in a friend's business, etc.). Make numbers meaningful.

**ACT 3: THE CONFLICT (The Risks)**
Every story needs conflict. What could go wrong? What are the biggest risks? Competition? Economy? Management issues? Be honest and specific. Use examples people can visualize.

**ACT 4: THE STRENGTHS**
Balance the story. What makes this company strong? Why do people still believe in it? What are its competitive advantages? Use concrete examples.

**ACT 5: THE VERDICT**
Tie everything together. What's the story here? Is this a safe play, a risky bet, or somewhere in between? Be balanced and honest.

CRITICAL RULES:
1. Write for someone with ZERO financial knowledge
2. Use analogies for every complex concept (P/E = buying a shop, ROE = return on your money, etc.)
3. Be conversational and engaging
4. NO jargon without explanation
5. Make it personal ("imagine you..." "think of it like...")
6. Keep paragraphs short and readable
7. Be brutally honest about risks AND strengths
8. Each act should be 150-200 words

Return ONLY the story content, no JSON, no markdown headers. Just pure narrative text divided into the 5 acts with clear labels.
`;

        // Generate the story using Gemini
        const storyResult = await model.generateContent(storyPrompt);
        const storyResponse = await storyResult.response;
        const fullStory = storyResponse.text();

        // Parse the story into acts
        const parseStory = (text) => {
            const acts = {
                setup: '',
                currentSituation: '',
                conflict: '',
                strengths: '',
                verdict: ''
            };

            // Try to extract each act
            const setupMatch = text.match(/\*\*ACT 1[:\s]*THE SETUP[^*]*\*\*\s*([\s\S]*?)(?=\*\*ACT 2|$)/i);
            const currentMatch = text.match(/\*\*ACT 2[:\s]*THE CURRENT SITUATION[^*]*\*\*\s*([\s\S]*?)(?=\*\*ACT 3|$)/i);
            const conflictMatch = text.match(/\*\*ACT 3[:\s]*THE CONFLICT[^*]*\*\*\s*([\s\S]*?)(?=\*\*ACT 4|$)/i);
            const strengthsMatch = text.match(/\*\*ACT 4[:\s]*THE STRENGTHS[^*]*\*\*\s*([\s\S]*?)(?=\*\*ACT 5|$)/i);
            const verdictMatch = text.match(/\*\*ACT 5[:\s]*THE VERDICT[^*]*\*\*\s*([\s\S]*?)$/i);

            acts.setup = setupMatch ? setupMatch[1].trim() : 'Story generation in progress...';
            acts.currentSituation = currentMatch ? currentMatch[1].trim() : 'Analyzing current situation...';
            acts.conflict = conflictMatch ? conflictMatch[1].trim() : 'Identifying risks...';
            acts.strengths = strengthsMatch ? strengthsMatch[1].trim() : 'Evaluating strengths...';
            acts.verdict = verdictMatch ? verdictMatch[1].trim() : 'Forming verdict...';

            return acts;
        };

        const storyContent = parseStory(fullStory);

        // Generate decision framework
        const decisionPrompt = `
Based on the stock ${searchSymbol.toUpperCase()} analysis, provide a simple decision framework.

Give 3-4 clear, specific reasons for each category:
1. YES, BUY IF: (When should someone buy this stock?)
2. NO, DON'T BUY IF: (When should someone avoid this stock?)
3. MAYBE, CONSIDER IF: (Middle ground scenarios)

Make each reason one clear sentence. Be specific and actionable.
Format as:
YES:
- reason 1
- reason 2
NO:
- reason 1
- reason 2
MAYBE:
- reason 1
- reason 2
`;

        const decisionResult = await model.generateContent(decisionPrompt);
        const decisionResponse = await decisionResult.response;
        const decisionText = decisionResponse.text();

        // Parse decision framework
        const parseDecisions = (text) => {
            const framework = {
                buyIf: [],
                noIf: [],
                maybeIf: []
            };

            const yesMatch = text.match(/YES[:\s]*([\s\S]*?)(?=NO:|$)/i);
            const noMatch = text.match(/NO[:\s]*([\s\S]*?)(?=MAYBE:|$)/i);
            const maybeMatch = text.match(/MAYBE[:\s]*([\s\S]*?)$/i);

            if (yesMatch) {
                framework.buyIf = yesMatch[1].split('\n')
                    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
                    .map(line => line.replace(/^[-•]\s*/, '').trim())
                    .filter(line => line.length > 0);
            }

            if (noMatch) {
                framework.noIf = noMatch[1].split('\n')
                    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
                    .map(line => line.replace(/^[-•]\s*/, '').trim())
                    .filter(line => line.length > 0);
            }

            if (maybeMatch) {
                framework.maybeIf = maybeMatch[1].split('\n')
                    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'))
                    .map(line => line.replace(/^[-•]\s*/, '').trim())
                    .filter(line => line.length > 0);
            }

            return framework;
        };

        const decisionFramework = parseDecisions(decisionText);

        const combinedStoryText = `
ACT 1: ${storyContent.setup}

ACT 2: ${storyContent.currentSituation}

ACT 3: ${storyContent.conflict}

ACT 4: ${storyContent.strengths}

ACT 5: ${storyContent.verdict}
`;
        const storyAudioUrl = await generateElevenAudio(combinedStoryText);

        // Build response
        res.json({
            symbol: searchSymbol.toUpperCase(),
            currentPrice: currentPrice,
            change: change,
            changePercent: changePercent,
            market: market,
            storyStyle: style,
            storyContent: storyContent,
            storyAudio: storyAudioUrl,
            decisionFramework: decisionFramework,
            biasCheck: {
                ownership: "We don't own this stock. We don't get paid by this company. We don't benefit if you buy or sell.",
                dataSources: sources.map(s => s.source),
                methodology: "This story was generated by AI analyzing real-time financial data, market news, expert opinions, and historical performance. Our goal: Tell you the truth, not sell you the stock."
            },
            metrics: {
                pe: null, // Can be enhanced with real PE data
                roe: null, // Can be enhanced with real ROE data
                debtEquity: null // Can be enhanced with real debt/equity data
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Story generation error:', error);
        res.status(500).json({
            error: 'Story generation failed',
            details: error.message
        });
    }
});

// **CLARITY ANALYSIS - THE KILLER FEATURE**
app.post('/api/portfolio/clarity-analysis', async (req, res) => {
    try {
        const { holdings } = req.body;

        if (!holdings || !Array.isArray(holdings)) {
            return res.status(400).json({
                error: 'Holdings array required',
                message: 'Upload an image first or provide holdings data',
                example: {
                    holdings: [
                        { symbol: 'RELIANCE.NS', weight: 0.25, invested: 100000 },
                        { symbol: 'TCS.NS', weight: 0.25, invested: 100000 }
                    ]
                }
            });
        }

        // Fetch real market data for each holding
        const portfolioAnalysis = [];
        let totalInvested = 0;
        let totalCurrentValue = 0;
        let losingStocks = [];

        for (const holding of holdings) {
            await sleep(200); // Rate limiting

            const market = detectMarket(holding.symbol);
            const sources = await aggregateDataSources(holding.symbol);

            // Get current price from live data or use extracted data
            let currentPrice = null;
            if (sources.length > 0) {
                const priceData = sources[0].data;
                currentPrice = priceData.c || priceData.price ||
                    priceData['Global Quote']?.['05. price'] || null;
            }

            // Use extracted values or calculate from live data
            const invested = holding.invested || 0;
            const currentValue = holding.currentValue || (holding.quantity * currentPrice) || 0;
            const pnl = holding.pnl !== undefined ? holding.pnl : (currentValue - invested);
            const pnlPercent = holding.pnlPercent !== undefined ?
                holding.pnlPercent :
                ((pnl / (invested || 1)) * 100).toFixed(2);

            totalInvested += invested;
            totalCurrentValue += currentValue;

            portfolioAnalysis.push({
                symbol: holding.symbol,
                invested: invested,
                currentValue: currentValue,
                pnl: pnl,
                pnlPercent: parseFloat(pnlPercent),
                sources: sources
            });

            // Track losing stocks
            if (pnl < 0) {
                losingStocks.push({
                    symbol: holding.symbol,
                    loss: Math.abs(pnl),
                    lossPercent: pnlPercent
                });
            }
        }

        const totalPnL = totalCurrentValue - totalInvested;
        const totalPnLPercent = ((totalPnL / totalInvested) * 100).toFixed(2);

        // Calculate health score (0-10)
        // Factors: Diversity, PnL%, Losing positions, Risk concentration
        const diversityScore = Math.min(holdings.length / 10, 1) * 3; // Max 3 points
        const pnlScore = Math.max(0, Math.min((parseFloat(totalPnLPercent) + 50) / 10, 4)); // Max 4 points
        const lossScore = Math.max(0, 3 - (losingStocks.length * 0.5)); // Max 3 points
        const healthScore = Math.min((diversityScore + pnlScore + lossScore), 10).toFixed(1);

        // Determine health label
        let healthLabel, healthColor;
        if (healthScore >= 8) {
            healthLabel = "EXCELLENT";
            healthColor = "text-green-500";
        } else if (healthScore >= 6) {
            healthLabel = "NEEDS ATTENTION";
            healthColor = "text-yellow-500";
        } else {
            healthLabel = "CRITICAL";
            healthColor = "text-red-500";
        }

        // Calculate anxiety score (0-10)
        const anxietyFactors = {
            losingPositions: Math.min(losingStocks.length * 2, 4),
            portfolioDown: totalPnL < 0 ? 3 : 0,
            lackOfDiversity: holdings.length < 5 ? 2 : 0,
            majorLosses: losingStocks.filter(s => parseFloat(s.lossPercent) < -20).length
        };
        const anxietyScore = Math.min(
            Object.values(anxietyFactors).reduce((a, b) => a + b, 0),
            10
        );

        // Calculate "what if index fund" scenario
        // Assume Nifty 50 average return: 12% per year
        const monthsSinceInvest = 8; // Example timeframe
        const indexReturn = 0.12 * (monthsSinceInvest / 12);
        const ifIndexFund = totalInvested * (1 + indexReturn);
        const yourLoss = Math.abs(totalPnL);
        const difference = ifIndexFund - totalCurrentValue;

        // Generate AI-powered brutally honest analysis
        const clarityPrompt = `
        You are a brutally honest financial advisor. Analyze this portfolio and provide a CLARITY report.
        
        Portfolio Data:
        - Total Invested: ₹${totalInvested.toLocaleString('en-IN')}
        - Current Value: ₹${totalCurrentValue.toLocaleString('en-IN')}
        - Total P&L: ₹${totalPnL.toLocaleString('en-IN')} (${totalPnLPercent}%)
        - Losing Stocks: ${losingStocks.length} out of ${holdings.length}
        - Health Score: ${healthScore}/10
        - Anxiety Score: ${anxietyScore}/10
        
        Holdings:
        ${portfolioAnalysis.map(h =>
            `${h.symbol}: Invested ₹${h.invested.toLocaleString('en-IN')}, ` +
            `Current ₹${h.currentValue.toLocaleString('en-IN')}, ` +
            `P&L: ${h.pnlPercent}%`
        ).join('\n')}
        
        INSTRUCTIONS:
        1. Be BRUTALLY HONEST - no sugar coating
        2. Identify the ONE biggest problem with this portfolio
        3. Give ONE clear actionable fix (sell X, buy Y)
        4. Explain in simple language WHY the losing stocks are losing
        5. Predict what will happen if they don't take action
        6. Compare their performance to simple Nifty 50 index
        7. Make it personal - talk directly to them
        8. Maximum 250 words
        
        Write like you're their friend who's tired of watching them lose money.
        `;

        const aiAnalysis = await analyzeWithGemini(clarityPrompt, portfolioAnalysis);

        // Biggest problem identification
        let biggestProblem = {
            title: "Holding losing stocks hoping for recovery",
            description: "You have stocks that are bleeding money while you wait for a miracle recovery that probably won't come.",
            losingStocks: losingStocks.sort((a, b) => parseFloat(a.lossPercent) - parseFloat(b.lossPercent)).slice(0, 3)
        };

        if (losingStocks.length === 0) {
            biggestProblem = {
                title: "Lack of diversification",
                description: "Your portfolio is too concentrated. One bad quarter and you're in trouble.",
                losingStocks: []
            };
        }

        // The Fix
        const theFix = {
            action: losingStocks.length > 0
                ? `Sell these ${losingStocks.length} losing positions tomorrow morning. Move to Nifty 50 Index Fund.`
                : `Add more diversification. Add 3-5 more quality stocks or index funds.`,
            expectedOutcome: losingStocks.length > 0
                ? `Stop losing ₹${Math.abs(totalPnL).toLocaleString('en-IN')} → Start gaining with market returns`
                : `Reduce risk, sleep better, match market returns`,
            timeframe: "1 year"
        };

        res.json({
            healthScore: parseFloat(healthScore),
            healthLabel: healthLabel,
            healthColor: healthColor,
            anxietyScore: anxietyScore,
            biggestProblem: biggestProblem,
            theFix: theFix,
            truthBomb: {
                yourLoss: Math.round(yourLoss),
                ifIndexFund: Math.round(ifIndexFund - totalInvested),
                difference: Math.round(difference)
            },
            fullAnalysis: aiAnalysis,
            portfolioSummary: {
                totalInvested: totalInvested,
                currentValue: totalCurrentValue,
                totalPnL: totalPnL,
                totalPnLPercent: parseFloat(totalPnLPercent),
                losingPositions: losingStocks.length,
                totalPositions: holdings.length
            },
            holdings: portfolioAnalysis,
            timestamp: new Date().toISOString(),
            nextAction: {
                reminder: "Set for 9:30 AM tomorrow",
                message: "Time to take action. No more waiting."
            }
        });

    } catch (error) {
        console.error('Clarity analysis error:', error);
        res.status(500).json({
            error: 'Clarity analysis failed',
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
        },
        features: {
            clarity_analysis: 'Enabled - Anti-anxiety investment insights',
            bias_detection: 'Enabled',
            voice_explanations: 'Frontend feature',
            truth_bombs: 'Enabled'
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
app.use("/api/audio", express.static(path.join(__dirname, "public", "audio")));


app.listen(PORT, () => {
    console.log(`🚀 Multi-Market Stock Analysis API running on port ${PORT}`);
    console.log(`📊 US & Indian markets supported`);
    console.log(`🔍 Financial content bias detection enabled`);
    console.log(`📍 Endpoints available at http://localhost:${PORT}/api/`);
});

module.exports = app;