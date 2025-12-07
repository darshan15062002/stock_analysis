const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateElevenAudio } = require('./src/generateAudio');
const { MongoClient } = require('mongodb');
const { aggregateDataSources, initializeNSESession } = require('./src/dataAggregation');
const IndianStockIntelligence = require('./src/dataAggregationPerplexity');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
const MONGODB_URI = 'mongodb+srv://darshan:$$dar$$123@cluster0.ohxhu.mongodb.net/';
let db;

// Initialize MongoDB connection
MongoClient.connect(MONGODB_URI, {
    useUnifiedTopology: true
}).then(client => {
    console.log('✅ Connected to MongoDB');
    db = client.db('stockanalysis');
}).catch(error => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
});

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
    // Primary: NSE India (Official, Real-time)
    NSE_INDIA: {
        baseUrl: 'https://www.nseindia.com/api',
        reliability: 0.95,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://www.nseindia.com/',
            'Connection': 'keep-alive'
        }
    },

    // Secondary: Yahoo Finance India (Technical indicators)
    YAHOO_FINANCE: {
        baseUrl: 'https://query1.finance.yahoo.com/v8/finance/chart',
        reliability: 0.88
    },

    // Tertiary: BSE India (Corporate actions)
    BSE_INDIA: {
        baseUrl: 'https://api.bseindia.com/BseIndiaAPI/api',
        reliability: 0.92
    },

    // Quaternary: Alpha Vantage (Fallback, delayed)
    ALPHA_VANTAGE: {
        baseUrl: 'https://www.alphavantage.co/query',
        key: process.env.ALPHA_VANTAGE_KEY,
        reliability: 0.75
    },

    // News: Google News RSS
    GOOGLE_NEWS: {
        baseUrl: 'https://news.google.com/rss/search',
        reliability: 0.70
    }
}

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
    return 'INDIAN';
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
//             const nseResponse = await axios.get(`${DATA_SOURCES.NSE_INDIA.baseUrl}/quote-equity`, {
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
//     }
//     console.log(sources, "=============");

//     return sources;
// };

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
        for (const symbol of stockMentions) { // Limit to 3 stocks
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

        return res.json({
            portfolio: [
                {
                    "symbol": "INFOSYS.NS",
                    "analysis": {
                        "symbol": "INFOSYS.NS",
                        "company_name": "Infosys Limited",
                        "last_updated": "07-12-2025 18:40 IST",
                        "price_data": {
                            "current_price": 1615.95,
                            "day_change": 18.35,
                            "day_change_percent": 1.15,
                            "previous_close": 1597.6,
                            "day_high": 1619,
                            "day_low": 1568,
                            "volume": 10344725,
                            "vwap": 1617.78
                        },
                        "technical_analysis": {
                            "trend": "bullish",
                            "rsi_14": 62,
                            "sma_20": 1598.5,
                            "sma_50": 1575.3,
                            "support_level": 1560,
                            "resistance_level": 1630,
                            "volatility": "medium",
                            "chart_pattern": "uptrend"
                        },
                        "fundamental_insights": {
                            "pe_ratio": 23.84,
                            "pb_ratio": 7.06,
                            "roe_percent": 27.22,
                            "market_cap": "₹671,362.59 Cr",
                            "dividend_yield": 2.66,
                            "q2_2024_revenue_growth": 12.5,
                            "q2_2024_profit_growth": 10.8
                        },
                        "recent_news": [
                            {
                                "headline": "Infosys reports strong Q2 FY25 revenue growth beating estimates",
                                "impact": "positive",
                                "date": "05-12-2025",
                                "source": "Moneycontrol"
                            },
                            {
                                "headline": "Infosys completes Rs 18,000 crore buyback extinguishing 10 crore shares",
                                "impact": "positive",
                                "date": "04-12-2025",
                                "source": "Screener"
                            },
                            {
                                "headline": "Infosys stock gains on upbeat earnings and strong client additions",
                                "impact": "positive",
                                "date": "06-12-2025",
                                "source": "Economic Times"
                            }
                        ],
                        "corporate_actions": {
                            "ex_dividend_date": null,
                            "bonus_ratio": null,
                            "split_ratio": null,
                            "board_meeting_date": "15-12-2025"
                        },
                        "risk_alerts": [
                            {
                                "type": "market",
                                "severity": "medium",
                                "description": "IT sector facing global macroeconomic uncertainties impacting client spending"
                            },
                            {
                                "type": "regulatory",
                                "severity": "low",
                                "description": "No recent SEBI or regulatory issues reported"
                            }
                        ],
                        "analyst_consensus": {
                            "recommendation": "buy",
                            "target_price": 1750,
                            "upside_potential": 8.3
                        },
                        "your_recommendation": {
                            "action": "buy_more",
                            "confidence": "high",
                            "rationale": "Strong Q2 revenue and profit growth; Technical indicators show bullish trend; Attractive valuation relative to peers"
                        }
                    }
                },
                {
                    "symbol": "PFC.NS",
                    "analysis": {
                        "symbol": "PFC.NS",
                        "company_name": "Power Finance Corporation Ltd",
                        "last_updated": "07-12-2025 18:40 IST",
                        "price_data": {
                            "current_price": 351.95,
                            "day_change": -0.7,
                            "day_change_percent": -0.2,
                            "previous_close": 352.65,
                            "day_high": 353.95,
                            "day_low": 348.8,
                            "volume": 5200000,
                            "vwap": 351.8
                        },
                        "technical_analysis": {
                            "trend": "neutral",
                            "rsi_14": 48,
                            "sma_20": 355.5,
                            "sma_50": 365,
                            "support_level": 345,
                            "resistance_level": 370,
                            "volatility": "medium",
                            "chart_pattern": "consolidation"
                        },
                        "fundamental_insights": {
                            "pe_ratio": 24.5,
                            "pb_ratio": 1.8,
                            "roe_percent": 14.2,
                            "market_cap": "₹1,19,117 Cr",
                            "dividend_yield": 6.1,
                            "q2_2024_revenue_growth": 8.5,
                            "q2_2024_profit_growth": 7.2
                        },
                        "recent_news": [
                            {
                                "headline": "Power Finance Corporation Q2 FY25 results show steady revenue growth",
                                "impact": "positive",
                                "date": "02-12-2025",
                                "source": "Economic Times"
                            },
                            {
                                "headline": "PFC announces dividend payout maintaining strong financial position",
                                "impact": "neutral",
                                "date": "13-06-2025",
                                "source": "Moneycontrol"
                            }
                        ],
                        "corporate_actions": {
                            "ex_dividend_date": "13-06-2025",
                            "bonus_ratio": null,
                            "split_ratio": null,
                            "board_meeting_date": null
                        },
                        "risk_alerts": [
                            {
                                "type": "market",
                                "severity": "medium",
                                "description": "Stock price volatility due to macroeconomic factors and interest rate fluctuations"
                            },
                            {
                                "type": "regulatory",
                                "severity": "low",
                                "description": "Potential impact from changes in government policies on power sector financing"
                            }
                        ],
                        "analyst_consensus": {
                            "recommendation": "hold",
                            "target_price": 370,
                            "upside_potential": 5.2
                        },
                        "your_recommendation": {
                            "action": "hold",
                            "confidence": "medium",
                            "rationale": "Steady fundamental performance with moderate growth prospects; current price near support levels; market volatility suggests cautious approach"
                        }
                    }
                },
                {
                    "symbol": "ITC.NS",
                    "analysis": {
                        "symbol": "ITC.NS",
                        "company_name": "ITC Limited",
                        "last_updated": "05-12-2025 16:00 IST",
                        "price_data": {
                            "current_price": 404.6,
                            "day_change": 1.55,
                            "day_change_percent": 0.38,
                            "previous_close": 403.05,
                            "day_high": 405.35,
                            "day_low": 402,
                            "volume": 388802,
                            "vwap": 404.11
                        },
                        "technical_analysis": {
                            "trend": "neutral",
                            "rsi_14": 52,
                            "sma_20": 402.5,
                            "sma_50": 398.75,
                            "support_level": 390.15,
                            "resistance_level": 443.35,
                            "volatility": "medium",
                            "chart_pattern": "consolidation"
                        },
                        "fundamental_insights": {
                            "pe_ratio": 25.02,
                            "pb_ratio": 7.8,
                            "roe_percent": 48.5,
                            "market_cap": "₹2,50,000 Cr",
                            "dividend_yield": 3.2,
                            "q2_2024_revenue_growth": 8.5,
                            "q2_2024_profit_growth": 12
                        },
                        "recent_news": [
                            {
                                "headline": "ITC reports steady Q2 revenue growth amid FMCG demand",
                                "impact": "positive",
                                "date": "02-12-2025",
                                "source": "Economic Times"
                            },
                            {
                                "headline": "ITC stock consolidates near 400 levels, analysts watch support",
                                "impact": "neutral",
                                "date": "04-12-2025",
                                "source": "Moneycontrol"
                            }
                        ],
                        "corporate_actions": {
                            "ex_dividend_date": "15-12-2025",
                            "bonus_ratio": null,
                            "split_ratio": null,
                            "board_meeting_date": "10-12-2025"
                        },
                        "risk_alerts": [
                            {
                                "type": "market",
                                "severity": "medium",
                                "description": "Moderate volatility expected due to global macroeconomic uncertainties impacting FMCG sector."
                            },
                            {
                                "type": "regulatory",
                                "severity": "low",
                                "description": "No significant regulatory changes reported recently affecting ITC operations."
                            }
                        ],
                        "analyst_consensus": {
                            "recommendation": "hold",
                            "target_price": 420,
                            "upside_potential": 3.8
                        },
                        "your_recommendation": {
                            "action": "hold",
                            "confidence": "high",
                            "rationale": "Steady revenue and profit growth; strong ROE supports valuation; consolidation pattern suggests limited near-term upside"
                        }
                    }
                },
                {
                    "symbol": "KOTAKBANK.NS",
                    "analysis": {
                        "symbol": "KOTAKBANK.NS",
                        "company_name": "Kotak Mahindra Bank Ltd.",
                        "last_updated": "07-12-2025 18:40 IST",
                        "price_data": {
                            "current_price": 2154.9,
                            "day_change": 12.5,
                            "day_change_percent": 0.58,
                            "previous_close": 2142.4,
                            "day_high": 2169.93,
                            "day_low": 2116.97,
                            "volume": 2605000,
                            "vwap": 2135
                        },
                        "technical_analysis": {
                            "trend": "bullish",
                            "rsi_14": 61.09,
                            "sma_20": 2106.47,
                            "sma_50": 2115.43,
                            "support_level": 2135.93,
                            "resistance_level": 2169.93,
                            "volatility": "medium",
                            "chart_pattern": "consolidation"
                        },
                        "fundamental_insights": {
                            "pe_ratio": 23.4,
                            "pb_ratio": 4.5,
                            "roe_percent": 16.5,
                            "market_cap": "₹43500 Cr",
                            "dividend_yield": 0.11,
                            "q2_2024_revenue_growth": -2.5,
                            "q2_2024_profit_growth": -1.5
                        },
                        "recent_news": [
                            {
                                "headline": "Kotak Mahindra Bank sees high value trading amid mixed market sentiment",
                                "impact": "neutral",
                                "date": "02-12-2025",
                                "source": "MarketsMojo"
                            },
                            {
                                "headline": "Kotak Mahindra Bank Q2 profits decline, shares fall 1.5%",
                                "impact": "negative",
                                "date": "27-10-2025",
                                "source": "TradingView"
                            }
                        ],
                        "corporate_actions": {
                            "ex_dividend_date": null,
                            "bonus_ratio": null,
                            "split_ratio": null,
                            "board_meeting_date": "26-01-2026"
                        },
                        "risk_alerts": [
                            {
                                "type": "earnings",
                                "severity": "medium",
                                "description": "Q2 FY25 profit declined by 1.5% impacting short-term sentiment"
                            },
                            {
                                "type": "market",
                                "severity": "medium",
                                "description": "Relative underperformance vs sector peers by 0.93% in recent sessions"
                            }
                        ],
                        "analyst_consensus": {
                            "recommendation": "buy",
                            "target_price": 2300,
                            "upside_potential": 6.8
                        },
                        "your_recommendation": {
                            "action": "hold",
                            "confidence": "medium",
                            "rationale": "Q2 profit decline suggests caution; stock remains above key moving averages; technical indicators show consolidation with potential for uptrend"
                        }
                    }
                },
                {
                    "symbol": "AXISBANK.NS",
                    "analysis": {
                        "symbol": "AXISBANK.NS",
                        "company_name": "Axis Bank Limited",
                        "last_updated": "05-12-2025 16:00 IST",
                        "price_data": {
                            "current_price": 1281.8,
                            "day_change": 1.8,
                            "day_change_percent": 0.14,
                            "previous_close": 1280,
                            "day_high": 1304,
                            "day_low": 1269.4,
                            "volume": 2728214,
                            "vwap": 1278.2
                        },
                        "technical_analysis": {
                            "trend": "neutral",
                            "rsi_14": 52,
                            "sma_20": 1275,
                            "sma_50": 1240,
                            "support_level": 1152,
                            "resistance_level": 1408,
                            "volatility": "medium",
                            "chart_pattern": "consolidation"
                        },
                        "fundamental_insights": {
                            "pe_ratio": 14.23,
                            "pb_ratio": 2.14,
                            "roe_percent": 15.5,
                            "market_cap": "₹3,98,000 Cr",
                            "dividend_yield": 0.08,
                            "q2_2024_revenue_growth": 12,
                            "q2_2024_profit_growth": 10.5
                        },
                        "recent_news": [
                            {
                                "headline": "Axis Bank Allots ₹5,000 Cr NCDs with 7.27% Coupon",
                                "impact": "neutral",
                                "date": "26-11-2025",
                                "source": "Screener.in"
                            },
                            {
                                "headline": "Axis Bank Q2 FY25 Profit Grows 10.5%, Revenue Up 12%",
                                "impact": "positive",
                                "date": "30-11-2025",
                                "source": "Moneycontrol"
                            },
                            {
                                "headline": "Axis Bank Stock Shows Consolidation Near ₹1280 Levels",
                                "impact": "neutral",
                                "date": "05-12-2025",
                                "source": "TradingView"
                            }
                        ],
                        "corporate_actions": {
                            "ex_dividend_date": null,
                            "bonus_ratio": null,
                            "split_ratio": null,
                            "board_meeting_date": null
                        },
                        "risk_alerts": [
                            {
                                "type": "market",
                                "severity": "medium",
                                "description": "Annualized volatility at 25.6% indicates moderate price fluctuations."
                            },
                            {
                                "type": "regulatory",
                                "severity": "low",
                                "description": "No recent major regulatory issues reported."
                            }
                        ],
                        "analyst_consensus": {
                            "recommendation": "hold",
                            "target_price": 1350,
                            "upside_potential": 5.3
                        },
                        "your_recommendation": {
                            "action": "hold",
                            "confidence": "medium",
                            "rationale": "Stable fundamental metrics with moderate growth; technical consolidation suggests limited near-term upside; moderate volatility warrants cautious stance."
                        }
                    }
                },
                {
                    "symbol": "TCS.NS",
                    "analysis": {
                        "symbol": "TCS.NS",
                        "company_name": "Tata Consultancy Services Limited",
                        "last_updated": "07-12-2025 18:40 IST",
                        "price_data": {
                            "current_price": 3238.2,
                            "day_change": 9,
                            "day_change_percent": 0.28,
                            "previous_close": 3229.2,
                            "day_high": 3244.9,
                            "day_low": 3210,
                            "volume": 5244013,
                            "vwap": 3246.02
                        },
                        "technical_analysis": {
                            "trend": "neutral",
                            "rsi_14": 52,
                            "sma_20": 3180,
                            "sma_50": 3100,
                            "support_level": 3150,
                            "resistance_level": 3280,
                            "volatility": "medium",
                            "chart_pattern": "consolidation"
                        },
                        "fundamental_insights": {
                            "pe_ratio": 23.58,
                            "pb_ratio": 11.08,
                            "roe_percent": 46.46,
                            "market_cap": "₹11,71,862 Cr",
                            "dividend_yield": 3.89,
                            "q2_2024_revenue_growth": 8.5,
                            "q2_2024_profit_growth": 7.2
                        },
                        "recent_news": [
                            {
                                "headline": "TCS Q3 2025 earnings estimate at ₹35.53 EPS with revenue forecast ₹671.54 B",
                                "impact": "neutral",
                                "date": "05-12-2025",
                                "source": "TradingView"
                            },
                            {
                                "headline": "TCS stock price rises 0.28% amid steady market conditions",
                                "impact": "neutral",
                                "date": "06-12-2025",
                                "source": "Moneycontrol"
                            }
                        ],
                        "corporate_actions": {
                            "ex_dividend_date": null,
                            "bonus_ratio": null,
                            "split_ratio": null,
                            "board_meeting_date": "15-01-2026"
                        },
                        "risk_alerts": [
                            {
                                "type": "market",
                                "severity": "medium",
                                "description": "Stock has shown a 24.85% decline over the last year indicating market volatility risk."
                            },
                            {
                                "type": "earnings",
                                "severity": "low",
                                "description": "Upcoming Q3 earnings on 15-Jan-2026 could impact stock price based on performance."
                            }
                        ],
                        "analyst_consensus": {
                            "recommendation": "hold",
                            "target_price": 3500,
                            "upside_potential": 8.1
                        },
                        "your_recommendation": {
                            "action": "hold",
                            "confidence": "high",
                            "rationale": "Strong fundamentals with high ROE and dividend yield; Moderate technical consolidation pattern; Upcoming earnings report introduces short-term uncertainty"
                        }
                    }
                },
                {
                    "symbol": "BANDHANBNK.NS",
                    "analysis": {
                        "symbol": "BANDHANBNK.NS",
                        "company_name": "Bandhan Bank Ltd",
                        "last_updated": "07-12-2025 18:40 IST",
                        "price_data": {
                            "current_price": 149.78,
                            "day_change": -0.22,
                            "day_change_percent": -0.15,
                            "previous_close": 150,
                            "day_high": 150.01,
                            "day_low": 149.78,
                            "volume": 6863672,
                            "vwap": 149.9
                        },
                        "technical_analysis": {
                            "trend": "neutral",
                            "rsi_14": 60.2,
                            "sma_20": 146.5,
                            "sma_50": 152.6,
                            "support_level": 140,
                            "resistance_level": 160,
                            "volatility": "medium",
                            "chart_pattern": "consolidation"
                        },
                        "fundamental_insights": {
                            "pe_ratio": 13.49,
                            "pb_ratio": 2.8,
                            "roe_percent": 18.5,
                            "market_cap": "₹27715 Cr",
                            "dividend_yield": 0.88,
                            "q2_2024_revenue_growth": 12,
                            "q2_2024_profit_growth": 8.5
                        },
                        "recent_news": [
                            {
                                "headline": "CLSA maintains high conviction outperform, sees 19% upside on easing MFI pressure and margin recovery ahead",
                                "impact": "positive",
                                "date": "02-12-2025",
                                "source": "Moneycontrol"
                            },
                            {
                                "headline": "Nomura cautious on Bandhan Bank after weak Q4 results; retains Neutral call on stock",
                                "impact": "negative",
                                "date": "01-12-2025",
                                "source": "Economic Times"
                            },
                            {
                                "headline": "Jefferies raises target price for Bandhan Bank shares after Q4 results as valuations reasonable but cuts growth estimates",
                                "impact": "positive",
                                "date": "03-12-2025",
                                "source": "Moneycontrol"
                            }
                        ],
                        "corporate_actions": {
                            "ex_dividend_date": "14-08-2025",
                            "bonus_ratio": null,
                            "split_ratio": null,
                            "board_meeting_date": null
                        },
                        "risk_alerts": [
                            {
                                "type": "earnings",
                                "severity": "medium",
                                "description": "Elevated credit stress and muted operating performance in recent quarters"
                            },
                            {
                                "type": "market",
                                "severity": "medium",
                                "description": "Stock price volatility due to macroeconomic factors and sectoral pressures"
                            }
                        ],
                        "analyst_consensus": {
                            "recommendation": "buy",
                            "target_price": 195,
                            "upside_potential": 30.2
                        },
                        "your_recommendation": {
                            "action": "hold",
                            "confidence": "medium",
                            "rationale": "Strong fundamental valuation with PE at 13.49 and ROE at 18.5%; Mixed recent earnings performance with some credit stress; Technical indicators show consolidation with medium volatility"
                        }
                    }
                },
                {
                    "symbol": "NTPC.NS",
                    "analysis": {
                        "symbol": "NTPC.NS",
                        "company_name": "NTPC Limited",
                        "last_updated": "05-12-2025 16:00 IST",
                        "price_data": {
                            "current_price": 323.5,
                            "day_change": 0.55,
                            "day_change_percent": 0.17,
                            "previous_close": 322.95,
                            "day_high": 324.15,
                            "day_low": 320.95,
                            "volume": 6574000,
                            "vwap": 322.98
                        },
                        "technical_analysis": {
                            "trend": "neutral",
                            "rsi_14": 52,
                            "sma_20": 325,
                            "sma_50": 330,
                            "support_level": 315,
                            "resistance_level": 335,
                            "volatility": "medium",
                            "chart_pattern": "consolidation"
                        },
                        "fundamental_insights": {
                            "pe_ratio": 12.85,
                            "pb_ratio": 1.63,
                            "roe_percent": 12.37,
                            "market_cap": "₹3,13,687.15 Cr",
                            "dividend_yield": 2.58,
                            "q2_2024_revenue_growth": 11.66,
                            "q2_2024_profit_growth": 14.85
                        },
                        "recent_news": [
                            {
                                "headline": "NTPC share price steady amid power sector reforms",
                                "impact": "neutral",
                                "date": "04-12-2025",
                                "source": "Economic Times"
                            },
                            {
                                "headline": "NTPC Limited focuses on renewable energy expansion",
                                "impact": "positive",
                                "date": "02-12-2025",
                                "source": "Moneycontrol"
                            }
                        ],
                        "corporate_actions": {
                            "ex_dividend_date": null,
                            "bonus_ratio": null,
                            "split_ratio": null,
                            "board_meeting_date": null
                        },
                        "risk_alerts": [
                            {
                                "type": "market",
                                "severity": "medium",
                                "description": "Stock shows mixed technical signals with recent sell signals from moving averages indicating potential short-term weakness."
                            },
                            {
                                "type": "regulatory",
                                "severity": "low",
                                "description": "Potential impact from evolving power sector regulations and government policy changes."
                            }
                        ],
                        "analyst_consensus": {
                            "recommendation": "buy",
                            "target_price": 350,
                            "upside_potential": 8.2
                        },
                        "your_recommendation": {
                            "action": "hold",
                            "confidence": "medium",
                            "rationale": "Stable fundamentals with moderate growth; technical consolidation suggests limited near-term upside; watch for regulatory developments and sector reforms."
                        }
                    }
                },
                {
                    "symbol": "HCLTECH.NS",
                    "analysis": {
                        "symbol": "HCLTECH.NS",
                        "company_name": "HCL Technologies Limited",
                        "last_updated": "05-12-2025 16:00 IST",
                        "price_data": {
                            "current_price": 1681,
                            "day_change": 26.4,
                            "day_change_percent": 1.6,
                            "previous_close": 1654.6,
                            "day_high": 1691,
                            "day_low": 1651,
                            "volume": 3391204,
                            "vwap": 1680
                        },
                        "technical_analysis": {
                            "trend": "bullish",
                            "rsi_14": 62,
                            "sma_20": 1650,
                            "sma_50": 1620,
                            "support_level": 1600,
                            "resistance_level": 1720,
                            "volatility": "medium",
                            "chart_pattern": "uptrend"
                        },
                        "fundamental_insights": {
                            "pe_ratio": 26.44,
                            "pb_ratio": 5.1,
                            "roe_percent": 25.5,
                            "market_cap": "₹456167.10 Cr",
                            "dividend_yield": 1.2,
                            "q2_2024_revenue_growth": 12.5,
                            "q2_2024_profit_growth": 15
                        },
                        "recent_news": [
                            {
                                "headline": "HCL Technologies reports strong Q2 revenue growth beating estimates",
                                "impact": "positive",
                                "date": "02-12-2025",
                                "source": "Economic Times"
                            },
                            {
                                "headline": "HCL Tech expands cloud services portfolio with new partnerships",
                                "impact": "positive",
                                "date": "30-11-2025",
                                "source": "Moneycontrol"
                            },
                            {
                                "headline": "Global IT spending slowdown may impact HCL Technologies in near term",
                                "impact": "negative",
                                "date": "01-12-2025",
                                "source": "Business Standard"
                            }
                        ],
                        "corporate_actions": {
                            "ex_dividend_date": "15-12-2025",
                            "bonus_ratio": null,
                            "split_ratio": null,
                            "board_meeting_date": "10-12-2025"
                        },
                        "risk_alerts": [
                            {
                                "type": "market",
                                "severity": "medium",
                                "description": "Potential impact from global IT spending slowdown and currency fluctuations"
                            },
                            {
                                "type": "regulatory",
                                "severity": "low",
                                "description": "No major regulatory changes currently impacting operations"
                            }
                        ],
                        "analyst_consensus": {
                            "recommendation": "buy",
                            "target_price": 1850,
                            "upside_potential": 10.1
                        },
                        "your_recommendation": {
                            "action": "buy_more",
                            "confidence": "high",
                            "rationale": "Strong Q2 revenue and profit growth; bullish technical trend with RSI above 60; attractive upside potential with target price 10% above current"
                        }
                    }
                }
            ]
        });
        const { holdings, analysis_type = 'risk_assessment' } = req.body;

        const intelligence = new IndianStockIntelligence();

        const Data = await Promise.all(
            holdings.map(async h => ({
                symbol: h.symbol,
                analysis: await intelligence.analyze(h.symbol, h.name)
            }))
        );

        console.log(JSON.stringify(Data), "======================");


        return res.json({ portfolio: Data });

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
            const sources = await aggregateDataSources(holding.symbol, analysis_type);

            console.log(sources, "sd");


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
            // portfolio_bias_score: {
            //     weighted_average: portfolioData.reduce((acc, holding) =>
            //         acc + (holding.bias_score.score * holding.weight), 0),
            //     diversification_benefit: portfolioData.length > 1,
            //     cross_market_exposure: Object.keys(marketBreakdown).filter(m => marketBreakdown[m] > 0).length > 1
            // },
            risks: {
                currency_risk: marketBreakdown.US > 0 && marketBreakdown.INDIAN > 0,
                regulatory_risk: 'Multiple jurisdictions',
                // data_quality_variance: portfolioData.some(h => h.bias_score.confidence === 'low')
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

// Subscription endpoint
app.post('/api/user/subscribe', async (req, res) => {
    try {
        const subscriptionData = req.body;

        // Validate required fields
        if (!subscriptionData.email || !subscriptionData.frequency) {
            return res.status(400).json({
                error: 'Email and frequency are required fields'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(subscriptionData.email)) {
            return res.status(400).json({
                error: 'Invalid email format'
            });
        }

        // Validate frequency
        const validFrequencies = ['daily', 'weekly', 'monthly'];
        if (!validFrequencies.includes(subscriptionData.frequency)) {
            return res.status(400).json({
                error: 'Frequency must be one of: daily, weekly, monthly'
            });
        }

        // Add timestamp and additional metadata
        const subscription = {
            ...subscriptionData,
            created_at: new Date().toISOString(),
            status: 'active',
            _id: undefined // Let MongoDB generate the ID
        };

        // Check if user already exists
        const existingUser = await db.collection('subscriptions').findOne({
            email: subscriptionData.email
        });

        if (existingUser) {
            // Update existing subscription
            const updateResult = await db.collection('subscriptions').updateOne(
                { email: subscriptionData.email },
                {
                    $set: {
                        ...subscription,
                        updated_at: new Date().toISOString()
                    }
                }
            );

            res.status(200).json({
                success: true,
                message: 'Subscription updated successfully',
                subscription_id: existingUser._id,
                action: 'updated'
            });
        } else {
            // Create new subscription
            const insertResult = await db.collection('subscriptions').insertOne(subscription);

            res.status(201).json({
                success: true,
                message: 'Subscription created successfully',
                subscription_id: insertResult.insertedId,
                action: 'created'
            });
        }

    } catch (error) {
        console.error('Subscription error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to process subscription'
        });
    }
});

// Get subscription by email
app.get('/api/user/subscription/:email', async (req, res) => {
    try {
        const { email } = req.params;

        const subscription = await db.collection('subscriptions').findOne(
            { email },
            { projection: { _id: 1, email: 1, frequency: 1, status: 1, created_at: 1, updated_at: 1, portfolio: 1 } }
        );

        if (!subscription) {
            return res.status(404).json({
                error: 'Subscription not found'
            });
        }

        res.status(200).json({
            success: true,
            subscription
        });

    } catch (error) {
        console.error('Get subscription error:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// Get all daily subscribers (for report generation)
app.get('/api/subscribers/daily', async (req, res) => {
    try {
        const dailySubscribers = await db.collection('subscriptions').find(
            { frequency: 'daily', status: 'active' }
        ).toArray();

        res.status(200).json({
            success: true,
            count: dailySubscribers.length,
            subscribers: dailySubscribers
        });

    } catch (error) {
        console.error('Get daily subscribers error:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

initializeNSESession();
app.listen(PORT, () => {
    console.log(`🚀 Multi-Market Stock Analysis API running on port ${PORT}`);
    console.log(`📊 US & Indian markets supported`);
    console.log(`🔍 Financial content bias detection enabled`);
    console.log(`📍 Endpoints available at http://localhost:${PORT}/api/`);
    console.log(`💾 MongoDB connected for user subscriptions`);
});

module.exports = app;