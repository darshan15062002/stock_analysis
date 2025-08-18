import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Search, TrendingUp, DollarSign, Calendar, Loader2, Shield, TrendingDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import axios from "axios";

const API_BASE_URL = "https://stock-analysis-y1zp.onrender.com/api";

const StockAnalysis = () => {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [stockData, setStockData] = useState<any>(null);
  const [error, setError] = useState("");

  const analyzeStock = async () => {
    if (!symbol.trim()) {
      toast({
        title: "Error",
        description: "Please enter a stock symbol",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setError("");

    try {
      const upperSymbol = symbol.toUpperCase().trim();

      // Call the real API
      const response = await axios.get(`${API_BASE_URL}/stock/${upperSymbol}/analysis`);
      const data = response.data;

      // Transform API data to display format
      const transformedData = {
        symbol: data.symbol,
        name: `${data.symbol} Corporation`, // API doesn't return company name
        price: data.sources[0]?.data?.["Global Quote"]?.["05. price"] || data.sources[1]?.data?.c,
        change: data.sources[0]?.data?.["Global Quote"]?.["09. change"] || data.sources[1]?.data?.d,
        changePercent: data.sources[0]?.data?.["Global Quote"]?.["10. change percent"] || `${data.sources[1]?.data?.dp}%`,
        analysis: data.ai_analysis,
        biasScore: data.bias_metrics,
        sources: data.sources,
        methodology: data.methodology,
        timestamp: data.timestamp
      };

      setStockData(transformedData);
      toast({
        title: "Analysis Complete",
        description: `Retrieved unbiased analysis for ${upperSymbol}`,
      });
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError(`Stock symbol "${symbol.toUpperCase()}" not found. Please try another symbol.`);
      } else if (err.code === 'ECONNREFUSED') {
        setError("Unable to connect to analysis server. Please ensure the API server is running on port 4000.");
      } else {
        setError("Failed to fetch stock analysis. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    analyzeStock();
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-semibold text-foreground mb-2">Stock Analysis</h1>
        <p className="text-muted-foreground">Get AI-driven insights and analysis for any stock</p>
      </div>

      {/* Search Card */}
      <Card className="financial-card shadow-financial">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="w-5 h-5 text-primary" />
            <span>Search Stock</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              type="text"
              placeholder="Enter stock symbol (e.g., AAPL)"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="financial-input"
              disabled={loading}
            />
            <Button
              type="submit"
              disabled={loading}
              className="px-8 rounded-xl font-medium shadow-md bg-primary hover:bg-primary/90"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Analyze
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-destructive font-medium">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Stock Details */}
      {stockData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stock Info */}
          <Card className="financial-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <DollarSign className="w-5 h-5 text-primary" />
                    <span>{stockData.symbol}</span>
                  </div>
                  <p className="text-sm text-muted-foreground font-normal">
                    {stockData.name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-foreground">
                    ${parseFloat(stockData.price).toFixed(2)}
                  </p>
                  <p className={`text-sm font-medium ${parseFloat(stockData.change) >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                    {parseFloat(stockData.change) >= 0 ? '+' : ''}{parseFloat(stockData.change).toFixed(2)} ({stockData.changePercent})
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Bias Score */}
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                  <div className="flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Bias Score</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-success">{stockData.biasScore.score}/10</span>
                    <p className="text-xs text-muted-foreground">{stockData.biasScore.confidence} confidence</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Last updated: {new Date(stockData.timestamp).toLocaleDateString()}</span>
                </div>

                <div>
                  <h4 className="font-semibold text-foreground mb-2">Unbiased AI Analysis</h4>
                  <div className="text-card-foreground leading-relaxed prose prose-sm max-w-none">
                    {stockData.analysis.split('\n\n').map((paragraph: string, index: number) => {
                      if (paragraph.startsWith('##')) {
                        return <h3 key={index} className="text-lg font-semibold mt-4 mb-2">{paragraph.replace('##', '').trim()}</h3>;
                      }
                      if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
                        return <h4 key={index} className="font-semibold mt-3 mb-1">{paragraph.replace(/\*\*/g, '')}</h4>;
                      }
                      return <p key={index} className="mb-2">{paragraph}</p>;
                    })}
                  </div>
                </div>

                {/* Data Sources */}
                <div className="mt-4 p-3 bg-muted/20 rounded-xl">
                  <h5 className="font-medium mb-2 text-sm">Data Sources ({stockData.sources.length})</h5>
                  <div className="space-y-1">
                    {stockData.sources.map((source: any, index: number) => (
                      <div key={index} className="flex justify-between text-xs">
                        <span>{source.name || source.source}</span>
                        <span className="text-muted-foreground">Reliability: {(source.reliability * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Real-time Analysis Summary */}
          <Card className="financial-card">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <span>Analysis Methodology</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-muted/30 rounded-xl">
                    <p className="text-2xl font-bold text-primary">
                      {stockData.methodology.data_aggregation}
                    </p>
                    <p className="text-xs text-muted-foreground">Data Collection</p>
                  </div>
                  <div className="text-center p-4 bg-muted/30 rounded-xl">
                    <p className="text-2xl font-bold text-accent">
                      {stockData.methodology.bias_detection}
                    </p>
                    <p className="text-xs text-muted-foreground">Bias Detection</p>
                  </div>
                  <div className="text-center p-4 bg-muted/30 rounded-xl">
                    <p className="text-2xl font-bold text-success">
                      {stockData.methodology.ai_reasoning}
                    </p>
                    <p className="text-xs text-muted-foreground">AI Analysis</p>
                  </div>
                </div>

                {/* Current Day Trading Data */}
                <div className="mt-4 p-4 bg-gradient-to-r from-primary/5 to-accent/5 rounded-xl">
                  <h5 className="font-semibold mb-3">Today's Trading Summary</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Open:</span>
                      <p className="font-semibold">${parseFloat(stockData.sources[0]?.data?.["Global Quote"]?.["02. open"] || stockData.sources[1]?.data?.o).toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">High:</span>
                      <p className="font-semibold text-success">${parseFloat(stockData.sources[0]?.data?.["Global Quote"]?.["03. high"] || stockData.sources[1]?.data?.h).toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Low:</span>
                      <p className="font-semibold text-destructive">${parseFloat(stockData.sources[0]?.data?.["Global Quote"]?.["04. low"] || stockData.sources[1]?.data?.l).toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Volume:</span>
                      <p className="font-semibold">{parseInt(stockData.sources[0]?.data?.["Global Quote"]?.["06. volume"] || "0").toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Live Data Note */}
      <Card className="bg-gradient-to-r from-success/10 to-primary/10 border-success/20">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            <strong>Live Analysis:</strong> This analysis uses real-time data from multiple sources with AI-powered bias detection.
            Data is aggregated from AlphaVantage and Finnhub with reliability scoring.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default StockAnalysis;