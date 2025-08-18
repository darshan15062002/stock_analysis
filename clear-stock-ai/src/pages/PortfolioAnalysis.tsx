import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { PieChart as PieChartIcon, Target, BarChart3, Loader2, Shield } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import axios from "axios";

const COLORS = ['#1E40AF', '#3B82F6', '#60A5FA', '#93C5FD', '#DBEAFE'];
const API_BASE_URL = "https://stock-analysis-y1zp.onrender.com/api";

const PortfolioAnalysis = () => {
  const [portfolioJson, setPortfolioJson] = useState(`{
  "holdings": [
    { "symbol": "AAPL", "weight": 0.4 },
    { "symbol": "MSFT", "weight": 0.3 },
    { "symbol": "GOOGL", "weight": 0.3 }
  ]
}`);
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [error, setError] = useState("");

  const analyzePortfolio = async () => {
    setLoading(true);
    setError("");

    try {
      // Parse and validate JSON
      const portfolioData = JSON.parse(portfolioJson.trim());
      const holdings = portfolioData.holdings;

      if (!holdings || !Array.isArray(holdings)) {
        throw new Error("Portfolio must contain a 'holdings' array");
      }

      // Validate holdings structure
      for (const holding of holdings) {
        if (!holding.symbol || typeof holding.weight !== 'number') {
          throw new Error("Each holding must have 'symbol' and 'weight' properties");
        }
      }

      // Check if weights sum approximately to 1
      const totalWeight = holdings.reduce((sum: number, h: any) => sum + h.weight, 0);
      if (Math.abs(totalWeight - 1.0) > 0.01) {
        throw new Error(`Portfolio weights sum to ${totalWeight.toFixed(2)}, but should sum to 1.0`);
      }

      // Call the real API
      const response = await axios.post(`${API_BASE_URL}/portfolio/analysis`, portfolioData);
      const data = response.data;

      // Create chart data for visualization
      const chartData = data.individual_holdings.map((holding: any, index: number) => ({
        name: holding.symbol,
        value: holding.weight * 100,
        color: COLORS[index % COLORS.length],
        biasScore: holding.bias_score.score,
        sources: holding.sources.length
      }));

      // Transform data for display
      const transformedData = {
        holdings: data.individual_holdings,
        chartData,
        analysis: data.portfolio_analysis,
        biasScore: data.portfolio_bias_score,
        timestamp: data.timestamp
      };

      setAnalysisData(transformedData);

      toast({
        title: "Portfolio Analysis Complete",
        description: `Analyzed ${holdings.length} holdings with unbiased insights`,
      });

    } catch (err: any) {
      if (err.response?.status === 400) {
        setError("Invalid portfolio data. Please check your JSON format and stock symbols.");
      } else if (err.code === 'ECONNREFUSED') {
        setError("Unable to connect to analysis server. Please ensure the API server is running on port 4000.");
      } else {
        setError(err instanceof Error ? err.message : "Invalid JSON format or API error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    analyzePortfolio();
  };

  const formatPercentage = (value: number) => `${(value).toFixed(1)}%`;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-semibold text-foreground mb-2">Portfolio Analysis</h1>
        <p className="text-muted-foreground">Analyze your portfolio's risk, return, and diversification</p>
      </div>

      {/* Input Card */}
      <Card className="financial-card shadow-financial">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <PieChartIcon className="w-5 h-5 text-primary" />
            <span>Enter Portfolio JSON</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Textarea
                value={portfolioJson}
                onChange={(e) => setPortfolioJson(e.target.value)}
                placeholder='{"holdings": [{"symbol": "AAPL", "weight": 0.4}, {"symbol": "MSFT", "weight": 0.6}]}'
                className="financial-input min-h-32 font-mono text-sm"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Enter JSON with "holdings" array where weights sum to 1.0
              </p>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl font-medium shadow-md bg-primary hover:bg-primary/90"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing Portfolio...
                </>
              ) : (
                <>
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Analyze Portfolio
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

      {/* Portfolio Analysis Results */}
      {analysisData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Portfolio Bias & Quality Summary */}
          <Card className="financial-card">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-primary" />
                <span>Portfolio Bias Analysis</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-center p-4 bg-gradient-to-r from-success/10 to-primary/10 rounded-xl">
                  <p className="text-3xl font-bold text-success">
                    {analysisData.biasScore.weighted_average}/10
                  </p>
                  <p className="text-sm text-muted-foreground">Weighted Bias Score</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {analysisData.biasScore.diversification_benefit ? "✓ Diversification Benefit" : "⚠ Limited Diversification"}
                  </p>
                </div>

                {/* Individual Holdings Bias Scores */}
                <div className="space-y-2">
                  <h5 className="font-medium text-sm">Individual Holdings Bias:</h5>
                  {analysisData.holdings.map((holding: any, index: number) => (
                    <div key={holding.symbol} className="flex justify-between items-center p-2 bg-muted/20 rounded">
                      <div className="flex items-center space-x-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="font-medium text-sm">{holding.symbol}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-success">{holding.bias_score.score}/10</span>
                        <p className="text-xs text-muted-foreground">{holding.sources.length} sources</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Portfolio Composition Chart */}
          <Card className="financial-card">
            <CardHeader>
              <CardTitle>Portfolio Composition</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="chart-container h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analysisData.chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {analysisData.chartData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {analysisData.holdings.map((holding: any, index: number) => (
                  <div key={holding.symbol} className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="font-medium">{holding.symbol}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-muted-foreground">
                        {formatPercentage(holding.weight * 100)}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        ${holding.sources[0]?.data?.["Global Quote"]?.["05. price"] || holding.sources[1]?.data?.c || "N/A"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* AI Insights */}
      {analysisData && (
        <Card className="financial-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Unbiased Portfolio Analysis</span>
              <span className="text-xs text-muted-foreground">
                {new Date(analysisData.timestamp).toLocaleDateString()}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-card-foreground leading-relaxed">
              {analysisData.analysis.split('\n\n').map((paragraph: string, index: number) => {
                if (paragraph.startsWith('##')) {
                  return <h3 key={index} className="text-lg font-semibold mt-4 mb-2">{paragraph.replace('##', '').trim()}</h3>;
                }
                if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
                  return <h4 key={index} className="font-semibold mt-3 mb-1">{paragraph.replace(/\*\*/g, '')}</h4>;
                }
                if (paragraph.startsWith('*') && paragraph.includes(':')) {
                  return <div key={index} className="ml-4 mb-2"><strong>{paragraph.split(':')[0].replace('*', '').trim()}:</strong> {paragraph.split(':').slice(1).join(':').trim()}</div>;
                }
                return paragraph.trim() ? <p key={index} className="mb-2">{paragraph}</p> : null;
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Analysis Note */}
      <Card className="bg-gradient-to-r from-success/10 to-primary/10 border-success/20">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            <strong>Live Portfolio Analysis:</strong> This analysis uses real-time market data with multi-source bias detection.
            Each holding is evaluated independently and combined for comprehensive portfolio insights.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PortfolioAnalysis;