import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Search, Newspaper, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import axios from "axios";

const API_BASE_URL = "http://localhost:4000/api";

const MarketSentiment = () => {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentimentData, setSentimentData] = useState<any>(null);
  const [error, setError] = useState("");

  const analyzeSentiment = async () => {
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
      
      // Call the sentiment API
      const response = await axios.get(`${API_BASE_URL}/market/sentiment/${upperSymbol}`);
      const data = response.data;
      
      setSentimentData(data);
      toast({
        title: "Sentiment Analysis Complete",
        description: `Retrieved market sentiment for ${upperSymbol}`,
      });
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError(`Stock symbol "${symbol.toUpperCase()}" not found. Please try another symbol.`);
      } else if (err.code === 'ECONNREFUSED') {
        setError("Unable to connect to analysis server. Please ensure the API server is running on port 4000.");
      } else {
        setError("Failed to fetch sentiment analysis. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    analyzeSentiment();
  };

  const getSentimentScenarios = (analysis: string) => {
    const scenarios = {
      bull: "",
      bear: "",
      neutral: ""
    };

    // Extract scenarios from the analysis text
    const bullMatch = analysis.match(/\*\*Bull Case:\*\*(.*?)(?=\*\*Bear Case:|\*\*Neutral Case:|$)/s);
    const bearMatch = analysis.match(/\*\*Bear Case:\*\*(.*?)(?=\*\*Bull Case:|\*\*Neutral Case:|$)/s);
    const neutralMatch = analysis.match(/\*\*Neutral Case:\*\*(.*?)(?=\*\*Bull Case:|\*\*Bear Case:|$)/s);

    if (bullMatch) scenarios.bull = bullMatch[1].trim();
    if (bearMatch) scenarios.bear = bearMatch[1].trim();
    if (neutralMatch) scenarios.neutral = neutralMatch[1].trim();

    return scenarios;
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-semibold text-foreground mb-2">Market Sentiment</h1>
        <p className="text-muted-foreground">AI-driven sentiment analysis from news and market data</p>
      </div>

      {/* Search Card */}
      <Card className="financial-card shadow-financial">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="w-5 h-5 text-primary" />
            <span>Check Market Sentiment</span>
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
                  <Newspaper className="w-4 h-4 mr-2" />
                  Analyze Sentiment
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

      {/* Sentiment Results */}
      {sentimentData && (
        <>
          {/* Sentiment Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* News Sources */}
            <Card className="financial-card">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Newspaper className="w-5 h-5 text-primary" />
                  <span>News Coverage</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    {sentimentData.news_sources}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    News sources analyzed
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Bias Considerations */}
            <Card className="financial-card">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5 text-primary" />
                  <span>Source Quality</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Source Diversity:</span>
                    <span className={`font-medium ${sentimentData.bias_considerations.source_diversity ? 'text-success' : 'text-destructive'}`}>
                      {sentimentData.bias_considerations.source_diversity ? 'High' : 'Low'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Time Window:</span>
                    <span className="font-medium text-primary">
                      {sentimentData.bias_considerations.temporal_bias}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recommendation */}
            <Card className="financial-card">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5 text-primary" />
                  <span>Recommendation</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    {sentimentData.bias_considerations.recommendation}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sentiment Scenarios */}
          {sentimentData.sentiment_analysis && (() => {
            const scenarios = getSentimentScenarios(sentimentData.sentiment_analysis);
            
            return scenarios.bull || scenarios.bear || scenarios.neutral ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Bull Case */}
                {scenarios.bull && (
                  <Card className="financial-card border-success/20 bg-success/5">
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2 text-success">
                        <TrendingUp className="w-5 h-5" />
                        <span>Bull Case</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{scenarios.bull}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Bear Case */}
                {scenarios.bear && (
                  <Card className="financial-card border-destructive/20 bg-destructive/5">
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2 text-destructive">
                        <TrendingDown className="w-5 h-5" />
                        <span>Bear Case</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{scenarios.bear}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Neutral Case */}
                {scenarios.neutral && (
                  <Card className="financial-card border-primary/20 bg-primary/5">
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2 text-primary">
                        <Minus className="w-5 h-5" />
                        <span>Neutral Case</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{scenarios.neutral}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : null;
          })()}

          {/* Full Sentiment Analysis */}
          <Card className="financial-card">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Newspaper className="w-5 h-5 text-primary" />
                <span>AI Sentiment Analysis Report</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-card-foreground leading-relaxed prose prose-sm max-w-none">
                {sentimentData.sentiment_analysis.split('\n\n').map((paragraph: string, index: number) => {
                  if (paragraph.startsWith('##')) {
                    return <h3 key={index} className="text-lg font-semibold mt-4 mb-2">{paragraph.replace('##', '').trim()}</h3>;
                  }
                  if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
                    return <h4 key={index} className="font-semibold mt-3 mb-1">{paragraph.replace(/\*\*/g, '')}</h4>;
                  }
                  return <p key={index} className="mb-2">{paragraph}</p>;
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Info Note */}
      <Card className="bg-gradient-to-r from-accent/10 to-primary/10 border-accent/20">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            <strong>Sentiment Analysis:</strong> This analysis aggregates news sentiment from multiple sources
            to provide a comprehensive view of market sentiment. Consider this alongside technical and fundamental analysis.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default MarketSentiment;