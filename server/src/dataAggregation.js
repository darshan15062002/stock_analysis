// ==================== INSTALL THESE FIRST ====================
// npm install axios@latest bottleneck node-cache fast-xml-parser

const axios = require('axios');
const Bottleneck = require('bottleneck');
const NodeCache = require('node-cache');
const { XMLParser } = require('fast-xml-parser');

// ==================== CONFIGURATION ====================
const DATA_SOURCES = {
    NSE_INDIA: {
        baseUrl: 'https://www.nseindia.com/api',
        reliability: 0.95,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://www.nseindia.com/',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache'
        }
    },
    YAHOO_FINANCE: {
        baseUrl: 'https://query1.finance.yahoo.com/v8/finance/chart',
        reliability: 0.88
    },
    ALPHA_VANTAGE: {
        baseUrl: 'https://www.alphavantage.co/query',
        key: process.env.ALPHA_VANTAGE_KEY,
        reliability: 0.75
    }
};

const SYMBOL_MAPPING = {
    // Common mismatches - add more as you discover them
    'INFOSYS.NS': 'INFY',
    'TATAMOTORS.NS': 'TATAMOTORS',
    'TATASTEEL.NS': 'TATASTEEL',
    'TATAPOWER.NS': 'TATAPOWER',
    'SBIN.NS': 'SBIN',
    'RELIANCE.NS': 'RELIANCE',
    'HDFCBANK.NS': 'HDFCBANK',
    'ICICIBANK.NS': 'ICICIBANK',
    'AXISBANK.NS': 'AXISBANK',
    'KOTAKBANK.NS': 'KOTAKBANK',
    'BHARTIARTL.NS': 'BHARTIARTL',
    'ITC.NS': 'ITC',
    'HINDUNILVR.NS': 'HINDUNILVR',
    'MARUTI.NS': 'MARUTI',
    'ASIANPAINT.NS': 'ASIANPAINT',
    'NESTLEIND.NS': 'NESTLEIND',
    'ADANITOTALGAS.NS': 'ATGL',
    'ADANIENT.NS': 'ADANIENT',
    'ADANIPOWER.NS': 'ADANIPOWER',
    'ADANIPORTS.NS': 'ADANIPORTS',
    'TCS.NS': 'TCS',
    'TECHM.NS': 'TECHM',
    'WIPRO.NS': 'WIPRO',
    'HCLTECH.NS': 'HCLTECH',
    'LT.NS': 'LT',
    'LTIM.NS': 'LTIM',
    'SUNPHARMA.NS': 'SUNPHARMA',
    'DRREDDY.NS': 'DRREDDY',
    'CIPLA.NS': 'CIPLA',
    'DIVISLAB.NS': 'DIVISLAB',
    'BAJFINANCE.NS': 'BAJFINANCE',
    'BAJAJFINSV.NS': 'BAJAJFINSV',
    'M&M.NS': 'MM',
    'ULTRACEMCO.NS': 'ULTRACEMCO',
    'SHREECEM.NS': 'SHREECEM',
    'GRASIM.NS': 'GRASIM',
    'HINDALCO.NS': 'HINDALCO',
    'TATACONSUM.NS': 'TATACONSUM',
    'BRITANNIA.NS': 'BRITANNIA',
    'VEDL.NS': 'VEDL',
    'JSWSTEEL.NS': 'JSWSTEEL',
    'COALINDIA.NS': 'COALINDIA',
    'NTPC.NS': 'NTPC',
    'POWERGRID.NS': 'POWERGRID',
    'ONGC.NS': 'ONGC',
    'IOC.NS': 'IOC',
    'BPCL.NS': 'BPCL',
    'HDFCLIFE.NS': 'HDFCLIFE',
    'ICICIPRULI.NS': 'ICICIPRULI',
    'SBILIFE.NS': 'SBILIFE',
    'BAJAJ-AUTO.NS': 'BAJAJ-AUTO',
    'EICHERMOT.NS': 'EICHERMOT',
    'HEROMOTOCO.NS': 'HEROMOTOCO',
    'AMBUJACEM.NS': 'AMBUJACEM',
    'DLF.NS': 'DLF',
    'INDUSINDBK.NS': 'INDUSINDBK',
    'PIDILITIND.NS': 'PIDILITIND',
    'DABUR.NS': 'DABUR',
    'GODREJCP.NS': 'GODREJCP',
    'HAVELLS.NS': 'HAVELLS',
    'TITAN.NS': 'TITAN',
    'UPL.NS': 'UPL',
    'MUTHOOTFIN.NS': 'MUTHOOTFIN',
    'BERGEPAINT.NS': 'BERGEPAINT',
    'APOLLOHOSP.NS': 'APOLLOHOSP',
    'ICICIGI.NS': 'ICICIGI',
    'SBICARD.NS': 'SBICARD',
    'MARICO.NS': 'MARICO',
    'COLPAL.NS': 'COLPAL',
    'NAUKRI.NS': 'NAUKRI',
    'ZOMATO.NS': 'ZOMATO',
    'NYKAA.NS': 'NYKAA',
    'PAYTM.NS': 'PAYTM',
    'POLYCAB.NS': 'POLYCAB',
    'ASTRAL.NS': 'ASTRAL',
    'ALKEM.NS': 'ALKEM',
    'BANDHANBNK.NS': 'BANDHANBNK',
    'PFC.NS': 'PFC',
    'REC.NS': 'REC',
    'IRFC.NS': 'IRFC',
    'IEX.NS': 'IEX',
    'DEVYANI.NS': 'DEVYANI',
    'VARUNBAZAAR.NS': 'VARUNBAZAAR',
    'KALYANJEWL.NS': 'KALYANKJ'
};


// ==================== SESSION & RATE LIMITING ====================
// NSE is aggressive - use conservative limits
const nseLimiter = new Bottleneck({
    reservoir: 2, // 2 requests per second max
    reservoirRefreshAmount: 2,
    reservoirRefreshInterval: 1000,
    maxConcurrent: 1
});

const stockCache = new NodeCache({ stdTTL: 300 });

let nseSessionInitialized = false;
let nseAxiosInstance = null;

function getNSEClient() {
    if (!nseAxiosInstance) {
        nseAxiosInstance = axios.create({
            baseURL: DATA_SOURCES.NSE_INDIA.baseUrl,
            timeout: 10000,
            withCredentials: true,
            headers: DATA_SOURCES.NSE_INDIA.headers
        });

        // Debug interceptor
        nseAxiosInstance.interceptors.response.use(
            response => {
                console.log(`  📡 NSE Response Status: ${response.status}`);
                return response;
            },
            error => {
                console.error(`  ❌ NSE Error: ${error.message}`);
                if (error.response) {
                    console.error(`     Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data).substring(0, 150)}`);
                }
                return Promise.reject(error);
            }
        );
    }
    return nseAxiosInstance;
}

// Initialize NSE session (MANDATORY for INFY)
async function initializeNSESession(retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`🔄 Initializing NSE session (attempt ${i + 1})...`);
            const client = getNSEClient();
            await client.get('https://www.nseindia.com', {
                timeout: 5000,
                maxRedirects: 5
            });

            nseSessionInitialized = true;
            console.log('✅ NSE session initialized');
            return true;
        } catch (error) {
            console.warn(`⚠️ Attempt ${i + 1} failed: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    console.error('❌ NSE session initialization failed');
    return false;
}

// ==================== MAIN FUNCTION ====================
async function aggregateDataSources(symbol, dataType = 'comprehensive') {
    const originalSymbol = symbol;
    const cleanSymbol = (SYMBOL_MAPPING[symbol] || symbol.replace('.NS', '').replace('.BO', '')).trim();
    const cacheKey = `stock:${cleanSymbol}:${dataType}`;

    // Check cache
    const cached = stockCache.get(cacheKey);
    if (cached) {
        console.log(`🎯 Cache hit for ${symbol}`);
        return cached;
    }

    console.log(`\n🔍 Fetching data for ${symbol} (${cleanSymbol})...`);

    const sources = [];
    const errors = [];

    // Helper that ALWAYS captures errors
    const collectSource = async (sourceName, fetchFn) => {
        try {
            console.log(`  🔄 Trying ${sourceName}...`);
            const data = await fetchFn();

            if (data && Object.keys(data).length > 0) {
                sources.push({
                    source: sourceName,
                    reliability: DATA_SOURCES[sourceName.replace(/\s/g, '_').replace(/[()]/g, '').toUpperCase()]?.reliability || 0.70,
                    market: 'INDIAN',
                    data: data,
                    timestamp: new Date().toISOString()
                });
                console.log(`  ✅ ${sourceName}: SUCCESS`);
                return true;
            } else {
                throw new Error(`Empty data from ${sourceName}`);
            }
        } catch (error) {
            const detailedError = `${sourceName}: ${error.message}${error.response?.status ? ` (HTTP ${error.response.status})` : ''}`;
            console.error(`  ❌ ${detailedError}`);
            errors.push(detailedError);
            return false;
        }
    };

    // 1. NSE India (PRIMARY - Most likely to fail for INFY)
    const nseSuccess = await collectSource('NSE India', async () => {
        if (!nseSessionInitialized) {
            const sessionOk = await initializeNSESession();
            if (!sessionOk) throw new Error('NSE session not available');
        }

        const client = getNSEClient();
        const rateLimitedRequest = nseLimiter.wrap(async () => {
            console.log(`     📡 Making NSE request for ${cleanSymbol}...`);
            const response = await client.get('/quote-equity', {
                params: { symbol: cleanSymbol }
            });

            if (response.status !== 200) {
                throw new Error(`NSE returned status ${response.status}`);
            }

            if (!response.data || !response.data.priceInfo) {
                console.error(`     ⚠️ NSE Response: ${JSON.stringify(response.data).substring(0, 200)}`);
                throw new Error('NSE priceInfo not found in response');
            }

            const info = response.data.priceInfo;
            console.log(`     💰 NSE Price: ₹${info.lastPrice}`);

            return {
                symbol: cleanSymbol,
                price: info.lastPrice,
                change: info.change,
                changePercent: info.pChange,
                volume: info.totalTradedVolume,
                high: info.intraDayHighLow?.max,
                low: info.intraDayHighLow?.min,
                open: info.open,
                previousClose: info.previousClose,
                lastUpdateTime: info.lastUpdateTime
            };
        });

        return await rateLimitedRequest();
    });

    // 2. Yahoo Finance (Backup)
    if (!nseSuccess || dataType === 'comprehensive') {
        await collectSource('Yahoo Finance India', async () => {
            const yahooSymbol = symbol.includes('.NS') ? symbol : `${symbol}.NS`;
            console.log(`     📡 Making Yahoo request for ${yahooSymbol}...`);

            const response = await axios.get(
                `${DATA_SOURCES.YAHOO_FINANCE.baseUrl}/${yahooSymbol}`,
                {
                    params: {
                        interval: '1d',
                        range: '5d',
                        includePrePost: 'false'
                    },
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                }
            );

            if (!response.data.chart?.result?.[0]) {
                throw new Error('Yahoo Finance returned empty result');
            }

            const result = response.data.chart.result[0];
            const indicators = result.indicators.quote[0];

            return {
                price: indicators.close[indicators.close.length - 1],
                previousClose: indicators.close[indicators.close.length - 2],
                change: indicators.close[indicators.close.length - 1] - indicators.close[indicators.close.length - 2],
                changePercent: ((indicators.close[indicators.close.length - 1] - indicators.close[indicators.close.length - 2]) / indicators.close[indicators.close.length - 2]) * 100
            };
        });
    }

    // 3. Final fallback: Alpha Vantage
    if (sources.length === 0) {
        console.log(`  🚨 CRITICAL: No data yet, trying Alpha Vantage fallback...`);
        await collectSource('Alpha Vantage', async () => {
            if (!DATA_SOURCES.ALPHA_VANTAGE.key || DATA_SOURCES.ALPHA_VANTAGE.key === 'your_key_here') {
                throw new Error('Alpha Vantage API key not configured');
            }

            console.log(`     📡 Making Alpha Vantage request for ${cleanSymbol}.NSE...`);
            const response = await axios.get(
                DATA_SOURCES.ALPHA_VANTAGE.baseUrl,
                {
                    params: {
                        function: 'GLOBAL_QUOTE',
                        symbol: `${cleanSymbol}.NSE`,
                        apikey: DATA_SOURCES.ALPHA_VANTAGE.key
                    },
                    timeout: 15000
                }
            );

            const quote = response.data['Global Quote'];
            if (!quote || Object.keys(quote).length === 0) {
                console.error(`     ⚠️ Alpha Vantage Response: ${JSON.stringify(response.data).substring(0, 200)}`);
                throw new Error('No data in Alpha Vantage response');
            }

            console.log(`     💰 Alpha Vantage Price: ₹${quote['05. price']}`);

            return {
                symbol: quote['01. symbol'],
                price: parseFloat(quote['05. price']),
                change: parseFloat(quote['09. change']),
                changePercent: parseFloat(quote['10. change percent']),
                volume: parseInt(quote['06. volume']),
                latestTradingDay: quote['07. latest trading day']
            };
        });
    }

    // FINAL CHECK: Did we get ANY data?
    if (sources.length === 0) {
        const errorMsg = `\n❌ CRITICAL FAILURE for ${symbol}:\n` +
            `No successful data sources after trying all fallbacks.\n` +
            `Errors captured:\n${errors.map(e => `  - ${e}`).join('\n')}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }

    console.log(`\n✅ SUCCESS: ${symbol} from ${sources.length} sources`);

    // Structure the final output
    const structuredData = validateAndStructureData(sources, cleanSymbol);
    stockCache.set(cacheKey, structuredData);

    return structuredData;
}

// ==================== DATA STRUCTURING ====================
function validateAndStructureData(sources, symbol) {
    const getBestValue = (field) => {
        const candidates = sources
            .filter(s => s.data?.[field] !== undefined && s.data?.[field] !== null)
            .sort((a, b) => b.reliability - a.reliability);
        return candidates[0]?.data?.[field] ?? 0;
    };

    const price = parseFloat(getBestValue('price')) || 0;
    const volume = parseInt(getBestValue('volume')) || 0;

    return {
        symbol: symbol,
        price: {
            current: price,
            change: parseFloat(getBestValue('change')) || 0,
            changePercent: parseFloat(getBestValue('changePercent')) || 0,
            open: parseFloat(getBestValue('open')) || 0,
            high: parseFloat(getBestValue('high')) || 0,
            low: parseFloat(getBestValue('low')) || 0,
            previousClose: parseFloat(getBestValue('previousClose')) || 0,
            volume: volume,
            lastUpdate: new Date().toISOString(),
            source: sources[0]?.source || 'unknown'
        },
        quality: {
            sourcesCount: sources.length,
            biasScore: calculateBiasScore(sources).score,
            sources: sources.map(s => ({ name: s.source, reliability: s.reliability }))
        }
    };
}

// ==================== BIAS SCORE ====================
function calculateBiasScore(sources) {
    if (!sources.length) return { score: 0.5, confidence: 'low', sources: 0 };

    const score = sources.reduce((acc, s) => acc + (s.reliability * 0.8), 0) / sources.length;
    return {
        score: Math.min(score, 1.0),
        confidence: score > 0.8 ? 'high' : score > 0.6 ? 'medium' : 'low',
        sources: sources.length
    };
}

// ==================== EXPORTS ====================
module.exports = {
    aggregateDataSources,
    initializeNSESession,
    getNSEClient
};

// ==================== DEBUG HELPER ====================
async function debugINFY() {
    console.log('🐛 DEBUGGING INFY.NS...');
    console.log('Environment API Key:', process.env.ALPHA_VANTAGE_KEY ? '✅ Set' : '❌ Missing');

    try {
        // Initialize session first
        await initializeNSESession();

        // Try fetching
        const data = await aggregateDataSources('INFY.NS', 'basic');
        console.log('\n✅ SUCCESS! Data retrieved:');
        console.log(JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('\n❌ FULL ERROR:');
        console.error(error.message);
    }
}

// Uncomment to run debug
debugINFY();