import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Search, AlertTriangle, CheckCircle, Info, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import axios from "axios";

const API_BASE_URL = "https://stock-analysis-y1zp.onrender.com/api";

const BiasAnalysis = () => {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [biasData, setBiasData] = useState<any>(null);
  const [error, setError] = useState("");

  const analyzeBias = async () => {
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

      // Call the bias check API
      const response = await axios.get(`${API_BASE_URL}/bias-check/${upperSymbol}`);
      const raw = response.data;

      // Normalize API response into UI-friendly format
      const normalized = {
        bias_metrics: {
          score: raw.bias_score,
          confidence: raw.confidence_level,
          sources: raw.source_count,
        },
        ai_analysis: raw.bias_analysis,
        methodology: {
          data_aggregation: "Aggregated from AlphaVantage, Finnhub and other APIs",
          bias_detection: "Analyzed consistency across data sources and looked for anomalies",
          ai_reasoning: "Evaluated potential biases, risks, and investor behaviors using AI reasoning",
        },
        sources: [], // not provided by API
        recommendations: raw.recommendations || [],
        timestamp: raw.timestamp,
        symbol: raw.symbol,
      };

      setBiasData(normalized);

      toast({
        title: "Bias Analysis Complete",
        description: `Retrieved bias analysis for ${upperSymbol}`,
      });
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError(`Stock symbol "${symbol.toUpperCase()}" not found. Please try another symbol.`);
      } else if (err.code === "ECONNREFUSED") {
        setError("Unable to connect to analysis server. Please ensure the API server is running on port 4000.");
      } else {
        setError("Failed to fetch bias analysis. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    analyzeBias();
  };

  const getBiasColor = (score: number) => {
    if (score === 0) return "text-success";
    if (score <= 3) return "text-primary";
    if (score <= 6) return "text-yellow-500";
    return "text-destructive";
  };

  const getBiasLabel = (score: number) => {
    if (score === 0) return "No Bias Detected";
    if (score <= 3) return "Low Bias";
    if (score <= 6) return "Moderate Bias";
    return "High Bias";
  };

  const getBiasIcon = (score: number) => {
    if (score === 0) return <CheckCircle className="w-5 h-5" />;
    if (score <= 6) return <Info className="w-5 h-5" />;
    return <AlertTriangle className="w-5 h-5" />;
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-semibold text-foreground mb-2">Bias Analysis</h1>
        <p className="text-muted-foreground">
          Detect and analyze potential bias in stock data and analysis
        </p>
      </div>

      {/* Search Card */}
      <Card className="financial-card shadow-financial">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="w-5 h-5 text-primary" />
            <span>Check Stock Bias</span>
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
                  <Shield className="w-4 h-4 mr-2" />
                  Analyze Bias
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

      {/* Bias Results */}
      {biasData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bias Score Card */}
          <Card className="financial-card">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-primary" />
                <span>Bias Score</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-4">
                {/* Gauge-like display */}
                <div className="relative w-32 h-32 mx-auto">
                  <div className="w-32 h-32 rounded-full border-8 border-muted flex items-center justify-center">
                    <div className="text-center">
                      <div
                        className={`text-4xl font-bold ${getBiasColor(
                          biasData.bias_metrics.score
                        )}`}
                      >
                        {biasData.bias_metrics.score}
                      </div>
                      <div className="text-xs text-muted-foreground">/ 10</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div
                    className={`flex items-center justify-center space-x-2 ${getBiasColor(
                      biasData.bias_metrics.score
                    )}`}
                  >
                    {getBiasIcon(biasData.bias_metrics.score)}
                    <span className="font-semibold">
                      {getBiasLabel(biasData.bias_metrics.score)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                    <div className="text-center p-3 bg-muted/30 rounded-xl">
                      <div className="font-semibold text-primary capitalize">
                        {biasData.bias_metrics.confidence}
                      </div>
                      <div className="text-xs text-muted-foreground">Confidence</div>
                    </div>
                    <div className="text-center p-3 bg-muted/30 rounded-xl">
                      <div className="font-semibold text-primary">
                        {biasData.bias_metrics.sources}
                      </div>
                      <div className="text-xs text-muted-foreground">Sources</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Methodology Card */}
          <Card className="financial-card">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Info className="w-5 h-5 text-primary" />
                <span>Methodology</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-3 bg-muted/30 rounded-xl">
                  <h5 className="font-semibold text-sm mb-1">Data Aggregation</h5>
                  <p className="text-xs text-muted-foreground">
                    {biasData.methodology.data_aggregation}
                  </p>
                </div>

                <div className="p-3 bg-muted/30 rounded-xl">
                  <h5 className="font-semibold text-sm mb-1">Bias Detection</h5>
                  <p className="text-xs text-muted-foreground">
                    {biasData.methodology.bias_detection}
                  </p>
                </div>

                <div className="p-3 bg-muted/30 rounded-xl">
                  <h5 className="font-semibold text-sm mb-1">AI Reasoning</h5>
                  <p className="text-xs text-muted-foreground">
                    {biasData.methodology.ai_reasoning}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recommendations Card */}
          {biasData.recommendations?.length > 0 && (
            <Card className="financial-card">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Info className="w-5 h-5 text-primary" />
                  <span>Recommendations</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                  {biasData.recommendations.map((rec: string, i: number) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* AI Analysis */}
      {biasData && (
        <Card className="financial-card">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-primary" />
              <span>AI Bias Analysis Report</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-card-foreground leading-relaxed prose prose-sm max-w-none">
              {biasData.ai_analysis.split("\n\n").map((paragraph: string, index: number) => {
                if (paragraph.startsWith("##")) {
                  return (
                    <h3 key={index} className="text-lg font-semibold mt-4 mb-2">
                      {paragraph.replace("##", "").trim()}
                    </h3>
                  );
                }
                if (paragraph.startsWith("**") && paragraph.endsWith("**")) {
                  return (
                    <h4 key={index} className="font-semibold mt-3 mb-1">
                      {paragraph.replace(/\*\*/g, "")}
                    </h4>
                  );
                }
                return (
                  <p key={index} className="mb-2">
                    {paragraph}
                  </p>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Note */}
      <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            <strong>Bias Detection:</strong> This analysis uses advanced algorithms to detect
            potential bias in data sources, analysis methods, and market sentiment to provide you
            with the most unbiased view possible.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default BiasAnalysis;
