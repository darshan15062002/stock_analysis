import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Camera, Upload, Loader2, AlertTriangle, TrendingDown,
  TrendingUp, Volume2, Clock, CheckCircle2, XCircle,
  Brain, Heart, DollarSign, Target, Lightbulb, Shield
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import axios from "axios";

// const API_BASE_URL = "https://stock-analysis-y1zp.onrender.com/api";
const API_BASE_URL = "https://stock-analysis-y1zp.onrender.com/api";

type ViewMode = 'upload' | 'verdict' | 'explanation';

interface ClarityAnalysis {
  healthScore: number;
  healthLabel: string;
  healthColor: string;
  anxietyScore: number;
  biggestProblem: {
    title: string;
    description: string;
    losingStocks: Array<{
      symbol: string;
      loss: number;
      lossPercent: number;
    }>;
  };
  theFix: {
    action: string;
    expectedOutcome: string;
    timeframe: string;
  };
  truthBomb: {
    yourLoss: number;
    ifIndexFund: number;
    difference: number;
  };
  fullAnalysis: string;
  timestamp: string;
}

const PortfolioAnalysis = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('upload');
  const [portfolioJson, setPortfolioJson] = useState(`{
  "holdings": [
    { "symbol": "RELIANCE.NS", "weight": 0.25, "invested": 100000 },
    { "symbol": "TCS.NS", "weight": 0.25, "invested": 100000 },
    { "symbol": "INFY.NS", "weight": 0.25, "invested": 100000 },
    { "symbol": "HDFCBANK.NS", "weight": 0.25, "invested": 100000 }
  ]
}`);
  const [loading, setLoading] = useState(false);
  const [clarityData, setClarityData] = useState<ClarityAnalysis | null>(null);
  const [error, setError] = useState("");
  const [isExplaining, setIsExplaining] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Text-to-speech for explanations
  const speakExplanation = (text: string) => {
    if ('speechSynthesis' in window) {
      setIsExplaining(true);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onend = () => setIsExplaining(false);
      window.speechSynthesis.speak(utterance);
    } else {
      toast({
        title: "Voice Not Available",
        description: "Text-to-speech is not supported in your browser",
        variant: "destructive"
      });
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsExplaining(false);
    }
  };

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

      // Call the clarity analysis API
      const response = await axios.post(`${API_BASE_URL}/portfolio/clarity-analysis`, portfolioData);
      const data = response.data;

      // Transform into Clarity format
      const clarityAnalysis: ClarityAnalysis = {
        healthScore: data.healthScore || 6.2,
        healthLabel: data.healthLabel || "NEEDS ATTENTION",
        healthColor: data.healthColor || "text-yellow-500",
        anxietyScore: data.anxietyScore || 8,
        biggestProblem: data.biggestProblem || {
          title: "Holding losing stocks hoping for recovery",
          description: "You have stocks that are bleeding money while you wait",
          losingStocks: data.losingStocks || []
        },
        theFix: data.theFix || {
          action: "Sell losing positions and move to index funds",
          expectedOutcome: "Stop bleeding ₹15k → Start gaining ₹45k",
          timeframe: "1 year"
        },
        truthBomb: data.truthBomb || {
          yourLoss: 47000,
          ifIndexFund: 62000,
          difference: 109000
        },
        fullAnalysis: data.fullAnalysis || data.ai_explanation || "Analysis completed.",
        timestamp: data.timestamp || new Date().toISOString()
      };

      setClarityData(clarityAnalysis);
      setViewMode('verdict');

      toast({
        title: "Portfolio Analyzed",
        description: "Your clarity report is ready",
      });

    } catch (err: any) {
      if (err.response?.status === 400) {
        setError("Invalid portfolio data. Please check your format.");
      } else {
        setError(err instanceof Error ? err.message : "Analysis failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");

    toast({
      title: "Processing Statement",
      description: "Extracting portfolio data from image...",
    });

    try {
      // Upload image to backend for OCR
      const formData = new FormData();
      formData.append('portfolio_image', file);

      const ocrResponse = await axios.post(
        `${API_BASE_URL}/portfolio/extract-from-image`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      const extractedData = ocrResponse.data.portfolioData;

      toast({
        title: "Portfolio Extracted",
        description: `Found ${extractedData.holdings?.length || 0} holdings`,
      });

      // Now analyze the extracted portfolio
      const analysisResponse = await axios.post(
        `${API_BASE_URL}/portfolio/clarity-analysis`,
        { holdings: extractedData.holdings }
      );

      const data = analysisResponse.data;

      // Transform into Clarity format
      const clarityAnalysis: ClarityAnalysis = {
        healthScore: data.healthScore || 6.2,
        healthLabel: data.healthLabel || "NEEDS ATTENTION",
        healthColor: data.healthColor || "text-yellow-500",
        anxietyScore: data.anxietyScore || 8,
        biggestProblem: data.biggestProblem || {
          title: "Holding losing stocks hoping for recovery",
          description: "You have stocks that are bleeding money while you wait",
          losingStocks: data.losingStocks || []
        },
        theFix: data.theFix || {
          action: "Sell losing positions and move to index funds",
          expectedOutcome: "Stop bleeding → Start gaining",
          timeframe: "1 year"
        },
        truthBomb: data.truthBomb || {
          yourLoss: 47000,
          ifIndexFund: 62000,
          difference: 109000
        },
        fullAnalysis: data.fullAnalysis || data.ai_explanation || "Analysis completed.",
        timestamp: data.timestamp || new Date().toISOString()
      };

      setClarityData(clarityAnalysis);
      setViewMode('verdict');

    } catch (err: any) {
      console.error('Upload error:', err);
      setError(
        err.response?.data?.message ||
        "Failed to process image. Please try a clearer screenshot."
      );
      toast({
        title: "Processing Failed",
        description: "Could not extract portfolio data from image",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    analyzePortfolio();
  };

  // UPLOAD VIEW
  if (viewMode === 'upload') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-muted/20 to-background">
        <Card className="w-full max-w-2xl shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Brain className="w-10 h-10 text-primary" />
            </div>
            <CardTitle className="text-3xl font-bold">Clarity</CardTitle>
            <p className="text-muted-foreground text-lg mt-2">
              The Anti-Anxiety Investment App
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              One screen. One verdict. One action.
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Image Upload - Primary Method */}
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileUpload}
                className="hidden"
              />

              <div className="space-y-3">
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-40 text-xl font-bold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-10 h-10 animate-spin" />
                      <span>Extracting Portfolio Data...</span>
                      <span className="text-sm font-normal">Reading your statement</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Camera className="w-12 h-12" />
                      <span>Take Photo of Portfolio</span>
                      <span className="text-sm font-normal">Or upload screenshot</span>
                    </div>
                  )}
                </Button>

                <div className="bg-muted/50 p-4 rounded-lg border border-dashed">
                  <p className="text-sm text-muted-foreground text-center">
                    📸 <strong>Supported:</strong> Zerodha, Groww, Upstox, ET Money, or any broker statement
                  </p>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Make sure stock names and values are clearly visible
                  </p>
                </div>
              </div>
            </div>            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Feature Preview */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="text-center p-4">
                <Heart className="w-8 h-8 mx-auto mb-2 text-red-500" />
                <p className="text-sm font-medium">Anxiety Score</p>
                <p className="text-xs text-muted-foreground">Sleep better</p>
              </div>
              <div className="text-center p-4">
                <Lightbulb className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                <p className="text-sm font-medium">Truth Bombs</p>
                <p className="text-xs text-muted-foreground">Face reality</p>
              </div>
              <div className="text-center p-4">
                <Volume2 className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                <p className="text-sm font-medium">Voice Explain</p>
                <p className="text-xs text-muted-foreground">60 sec clarity</p>
              </div>
              <div className="text-center p-4">
                <Target className="w-8 h-8 mx-auto mb-2 text-green-500" />
                <p className="text-sm font-medium">One Action</p>
                <p className="text-xs text-muted-foreground">No paralysis</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // VERDICT SCREEN
  if (viewMode === 'verdict' && clarityData) {
    return (
      <div className="min-h-screen p-6 bg-gradient-to-br from-background via-muted/10 to-background">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Back Button */}
          <Button
            variant="ghost"
            onClick={() => setViewMode('upload')}
            className="mb-4"
          >
            ← New Analysis
          </Button>

          {/* MAIN VERDICT CARD */}
          <Card className="shadow-2xl border-2">
            <CardContent className="pt-8 pb-8 space-y-8">

              {/* Health Score */}
              <div className="text-center space-y-4">
                <h2 className="text-2xl font-semibold text-muted-foreground">
                  YOUR PORTFOLIO HEALTH:
                </h2>

                <div className="relative inline-block">
                  <div className={`text-7xl font-bold ${clarityData.healthColor}`}>
                    {clarityData.healthScore === 10 ? "🟢" :
                      clarityData.healthScore >= 7 ? "🟡" : "🔴"} {clarityData.healthScore}/10
                  </div>
                </div>

                <Badge
                  variant="outline"
                  className="text-xl px-6 py-2 font-bold"
                >
                  {clarityData.healthLabel}
                </Badge>

                <p className="text-lg text-muted-foreground max-w-md mx-auto">
                  You're taking unnecessary risks that won't give you better returns
                </p>
              </div>

              {/* Divider */}
              <div className="border-t-2" />

              {/* BIGGEST PROBLEM */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-6 h-6 text-destructive" />
                  <h3 className="text-xl font-bold">BIGGEST PROBLEM:</h3>
                </div>

                <Alert className="bg-destructive/10 border-destructive">
                  <AlertDescription className="text-base">
                    "{clarityData.biggestProblem.description}"
                  </AlertDescription>
                </Alert>

                {clarityData.biggestProblem.losingStocks &&
                  clarityData.biggestProblem.losingStocks.length > 0 && (
                    <div className="space-y-2 pl-4">
                      {clarityData.biggestProblem.losingStocks.map((stock, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-2">
                            <TrendingDown className="w-5 h-5 text-destructive" />
                            <span className="font-semibold">{stock.symbol}</span>
                          </div>
                          <span className="text-destructive font-bold">
                            {stock.lossPercent}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                <p className="text-muted-foreground pl-4">
                  These will likely keep falling.
                </p>
              </div>

              {/* Divider */}
              <div className="border-t-2" />

              {/* THE FIX */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                  <h3 className="text-xl font-bold">THE FIX:</h3>
                </div>

                <div className="bg-green-500/10 border-2 border-green-500/30 rounded-lg p-6 space-y-4">
                  <p className="text-lg font-semibold">
                    {clarityData.theFix.action}
                  </p>

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">Expected outcome in {clarityData.theFix.timeframe}:</span>
                  </div>

                  <p className="text-2xl font-bold text-green-600">
                    {clarityData.theFix.expectedOutcome}
                  </p>
                </div>

                <div className="flex gap-4">
                  <Button
                    className="flex-1 h-14 text-lg font-semibold bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      toast({
                        title: "Action Committed",
                        description: "We'll remind you tomorrow at 9:30 AM",
                      });
                    }}
                  >
                    I'll Do This
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 h-14 text-lg font-semibold"
                    onClick={() => {
                      setViewMode('explanation');
                      speakExplanation(clarityData.fullAnalysis);
                    }}
                  >
                    <Volume2 className="w-5 h-5 mr-2" />
                    Tell Me Why
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ANXIETY SCORE CARD */}
          <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <Heart className="w-8 h-8 text-red-500 flex-shrink-0 mt-1" />
                <div className="space-y-2 flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">Your Investment Anxiety:</h3>
                    <Badge variant="destructive" className="text-xl px-4 py-1">
                      {clarityData.anxietyScore}/10 🔴
                    </Badge>
                  </div>

                  <p className="text-sm font-medium">Why you can't sleep:</p>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• Holding "hope stocks" that are down significantly</li>
                    <li>• No clear exit strategy</li>
                    <li>• Checking prices multiple times daily</li>
                  </ul>

                  <Progress value={clarityData.anxietyScore * 10} className="h-2" />

                  <p className="text-sm font-semibold text-green-600 pt-2">
                    Reduce to 2/10 by taking action today →
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* TRUTH BOMB CARD */}
          <Card className="border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/20">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-3xl">💣</span>
                  <h3 className="text-xl font-bold">UNCOMFORTABLE TRUTH:</h3>
                </div>

                <div className="space-y-3 text-base">
                  <p className="font-semibold text-destructive">
                    You've lost ₹{clarityData.truthBomb.yourLoss.toLocaleString('en-IN')} in the past 8 months.
                  </p>

                  <p>
                    If you had just bought <span className="font-semibold">Nifty 50 Index Fund</span> and
                    never looked at it, you would have{' '}
                    <span className="font-bold text-green-600">
                      ₹{clarityData.truthBomb.ifIndexFund.toLocaleString('en-IN')} MORE
                    </span>{' '}
                    today.
                  </p>

                  <div className="bg-yellow-100 dark:bg-yellow-900/30 p-4 rounded-lg border-2 border-yellow-400">
                    <p className="text-2xl font-bold text-center">
                      That's ₹{clarityData.truthBomb.difference.toLocaleString('en-IN')} difference.
                    </p>
                  </div>

                  <p className="font-semibold text-center text-lg">
                    You're not "investing smartly."<br />
                    You're gambling and losing.
                  </p>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button
                    className="flex-1"
                    variant="default"
                    onClick={() => setViewMode('upload')}
                  >
                    I'm Ready to Change
                  </Button>
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() => setViewMode('explanation')}
                  >
                    Show Me Proof
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timestamp */}
          <p className="text-center text-xs text-muted-foreground">
            Analysis completed: {new Date(clarityData.timestamp).toLocaleString()}
          </p>
        </div>
      </div>
    );
  }

  // EXPLANATION VIEW
  if (viewMode === 'explanation' && clarityData) {
    return (
      <div className="min-h-screen p-6 bg-gradient-to-br from-background via-muted/10 to-background">
        <div className="max-w-4xl mx-auto space-y-6">
          <Button
            variant="ghost"
            onClick={() => {
              stopSpeaking();
              setViewMode('verdict');
            }}
          >
            ← Back to Verdict
          </Button>

          <Card className="shadow-xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">Detailed Explanation</CardTitle>
                <div className="flex gap-2">
                  {isExplaining ? (
                    <Button
                      variant="destructive"
                      onClick={stopSpeaking}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Stop
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      onClick={() => speakExplanation(clarityData.fullAnalysis)}
                    >
                      <Volume2 className="w-4 h-4 mr-2" />
                      Listen
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert max-w-none">
              {clarityData.fullAnalysis.split('\n\n').map((para, idx) => (
                <p key={idx} className="mb-4">{para}</p>
              ))}
            </CardContent>
          </Card>

          <Button
            className="w-full"
            size="lg"
            onClick={() => setViewMode('verdict')}
          >
            Back to Action Plan
          </Button>
        </div>
      </div>
    );
  }

  return null;
};

export default PortfolioAnalysis;