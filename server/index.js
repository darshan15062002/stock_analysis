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
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Data source configurations
const DATA_SOURCES = {
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
    }
};

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const aggregateDataSources = async (symbol, dataType) => {
    const sources = [];

    try {
        // Alpha Vantage data
        const avResponse = await axios.get(`${DATA_SOURCES.ALPHA_VANTAGE.baseUrl}`, {
            params: {
                function: 'GLOBAL_QUOTE',
                symbol: symbol,
                apikey: DATA_SOURCES.ALPHA_VANTAGE.key
            }
        });
        sources.push({
            source: 'AlphaVantage',
            data: avResponse.data,
            reliability: 0.85
        });
    } catch (error) {
        console.error('AlphaVantage error:', error.message);
    }

    try {
        // Finnhub data
        const fhResponse = await axios.get(`${DATA_SOURCES.FINNHUB.baseUrl}/quote`, {
            params: {
                symbol: symbol,
                token: DATA_SOURCES.FINNHUB.key
            }
        });
        sources.push({
            source: 'Finnhub',
            data: fhResponse.data,
            reliability: 0.90
        });
    } catch (error) {
        console.error('Finnhub error:', error.message);
    }

    return sources;
};

const analyzeWithGemini = async (prompt, stockData) => {
    try {
        const enhancedPrompt = `
      As an unbiased financial analyst, analyze the following stock data and provide insights.
      Focus on objective analysis, potential risks, and multiple perspectives.
      
      Data: ${JSON.stringify(stockData, null, 2)}
      
      Analysis request: ${prompt}
      
      Please provide:
      1. Objective summary of current metrics
      2. Risk assessment (both upside and downside)
      3. Key factors to monitor
      4. Potential biases in the data or common market misconceptions
      5. Multiple scenarios (bull, bear, neutral cases)
      
      Maintain analytical objectivity and highlight uncertainties.
    `;

        const result = await model.generateContent(enhancedPrompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Gemini analysis error:', error);
        throw new Error('AI analysis unavailable');
    }
};

const calculateBiasScore = (sources) => {
    // Calculate consensus and divergence across sources
    const pricePoints = sources
        .map(s => s.data.c || s.data['Global Quote']?.['05. price'])
        .filter(p => p && !isNaN(parseFloat(p)))
        .map(p => parseFloat(p));

    if (pricePoints.length < 2) return { score: 0.5, confidence: 'low' };

    const mean = pricePoints.reduce((a, b) => a + b, 0) / pricePoints.length;
    const variance = pricePoints.reduce((acc, price) => acc + Math.pow(price - mean, 2), 0) / pricePoints.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / mean;

    // Lower CV indicates higher consensus (less bias potential)
    const biasScore = Math.min(coefficientOfVariation * 10, 1);
    const confidence = biasScore < 0.02 ? 'high' : biasScore < 0.05 ? 'medium' : 'low';

    return { score: biasScore, confidence, sources: pricePoints.length };
};

// API Routes

// Get comprehensive stock analysis
app.get('/api/stock/:symbol/analysis', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { analysis_type = 'comprehensive' } = req.query;

        // Aggregate data from multiple sources
        const sources = await aggregateDataSources(symbol.toUpperCase());

        if (sources.length === 0) {
            return res.status(404).json({
                error: 'No data available for this symbol',
                symbol: symbol.toUpperCase()
            });
        }

        // Calculate bias metrics
        const biasMetrics = calculateBiasScore(sources);

        // Get AI analysis
        const aiAnalysis = await analyzeWithGemini(
            `Provide ${analysis_type} analysis for ${symbol}`,
            sources
        );

        res.json({
            symbol: symbol.toUpperCase(),
            timestamp: new Date().toISOString(),
            bias_metrics: biasMetrics,
            sources: sources.map(s => ({
                name: s.source,
                reliability: s.reliability,
                data: s.data
            })),
            ai_analysis: aiAnalysis,
            methodology: {
                data_aggregation: 'Multi-source consensus',
                bias_detection: 'Statistical variance analysis',
                ai_reasoning: 'Gemini Pro with bias-aware prompting'
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

// Portfolio analysis endpoint
app.post('/api/portfolio/analysis', async (req, res) => {
    try {
        const { holdings, analysis_type = 'risk_assessment' } = req.body;

        if (!holdings || !Array.isArray(holdings)) {
            return res.status(400).json({
                error: 'Holdings array required',
                example: { holdings: [{ symbol: 'AAPL', weight: 0.3 }, { symbol: 'GOOGL', weight: 0.7 }] }
            });
        }

        const portfolioData = [];

        // Analyze each holding
        for (const holding of holdings) {
            await sleep(200); // Rate limiting
            const sources = await aggregateDataSources(holding.symbol);
            portfolioData.push({
                symbol: holding.symbol,
                weight: holding.weight,
                sources: sources,
                bias_score: calculateBiasScore(sources)
            });
        }

        // Portfolio-level AI analysis
        const portfolioAnalysis = await analyzeWithGemini(
            `Analyze this portfolio for ${analysis_type}. Consider correlation risks, sector concentration, and potential biases in individual holdings.`,
            portfolioData
        );

        res.json({
            portfolio_analysis: portfolioAnalysis,
            individual_holdings: portfolioData,
            portfolio_bias_score: {
                weighted_average: portfolioData.reduce((acc, holding) =>
                    acc + (holding.bias_score.score * holding.weight), 0),
                diversification_benefit: portfolioData.length > 1
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

// Market sentiment analysis
app.get('/api/market/sentiment/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;

        // Get news sentiment from multiple sources
        const newsPromises = [
            axios.get(`${DATA_SOURCES.FINNHUB.baseUrl}/company-news`, {
                params: {
                    symbol: symbol,
                    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    to: new Date().toISOString().split('T')[0],
                    token: DATA_SOURCES.FINNHUB.key
                }
            }).catch(() => null)
        ];

        const newsResults = await Promise.all(newsPromises);
        const newsData = newsResults.filter(r => r).map(r => r.data);

        // Analyze sentiment with bias detection
        const sentimentAnalysis = await analyzeWithGemini(
            'Analyze market sentiment and identify potential media bias in coverage',
            { symbol, news: newsData }
        );

        res.json({
            symbol: symbol.toUpperCase(),
            sentiment_analysis: sentimentAnalysis,
            news_sources: newsData.length,
            bias_considerations: {
                source_diversity: newsData.length > 1,
                temporal_bias: 'Recent 7-day window',
                recommendation: 'Cross-reference with fundamental analysis'
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

// Bias detection endpoint
app.get('/api/bias-check/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const sources = await aggregateDataSources(symbol);

        const biasAnalysis = await analyzeWithGemini(
            'Identify potential biases, data quality issues, and reliability concerns in this stock data',
            sources
        );

        const biasMetrics = calculateBiasScore(sources);

        res.json({
            symbol: symbol.toUpperCase(),
            bias_score: biasMetrics.score,
            confidence_level: biasMetrics.confidence,
            source_count: biasMetrics.sources,
            bias_analysis: biasAnalysis,
            recommendations: [
                'Compare multiple timeframes',
                'Consider fundamental vs. technical analysis',
                'Review analyst consensus variations',
                'Check for recent news impact'
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

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            gemini: !!process.env.GEMINI_API_KEY,
            alpha_vantage: !!process.env.ALPHA_VANTAGE_API_KEY,
            finnhub: !!process.env.FINNHUB_API_KEY
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

// 404 handler
// app.use('*', (req, res) => {
//     res.status(404).json({
//         error: 'Endpoint not found',
//         available_endpoints: [
//             'GET /api/stock/:symbol/analysis',
//             'POST /api/portfolio/analysis',
//             'GET /api/market/sentiment/:symbol',
//             'GET /api/bias-check/:symbol',
//             'GET /health'
//         ]
//     });
// });

app.listen(PORT, () => {
    console.log(`🚀 Unbiased Stock Analysis API running on port ${PORT}`);
    console.log(`📊 Endpoints available at http://localhost:${PORT}/api/`);
});

module.exports = app;