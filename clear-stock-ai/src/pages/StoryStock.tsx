import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    BookOpen,
    Film,
    GraduationCap,
    Baby,
    FileText,
    Search,
    Loader2,
    TrendingUp,
    TrendingDown,
    Shield,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    HelpCircle,
    Sparkles,
    Volume2,
    VolumeX,
    ArrowRight,
    DollarSign
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import axios from "axios";

// const API_BASE_URL = "https://stock-analysis-y1zp.onrender.com/api";
const API_BASE_URL = "https://stock-analysis-y1zp.onrender.com/api";

type StoryStyle = "bedtime" | "movie" | "teacher" | "eli5" | "facts";

interface StoryData {
    symbol: string;
    currentPrice: number;
    storyContent: {
        setup: string;
        currentSituation: string;
        conflict: string;
        strengths: string;
        verdict: string;
    };
    storyAudio: string;
    decisionFramework: {
        buyIf: string[];
        noIf: string[];
        maybeIf: string[];
    };
    biasCheck: {
        ownership: string;
        dataSources: string[];
        methodology: string;
    };
    metrics: {
        pe: number | null;
        roe: number | null;
        debtEquity: number | null;
    };
    market: string;
}

const StoryStock = () => {
    const aRef = useRef(null);
    const [symbol, setSymbol] = useState("");
    const [loading, setLoading] = useState(false);
    const [storyData, setStoryData] = useState<StoryData | null>(null);
    const [selectedStyle, setSelectedStyle] = useState<StoryStyle>("movie");
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [audioInstance, setAudioInstance] = useState<HTMLAudioElement | null>(null);
    const [error, setError] = useState("");

    const storyStyles = [
        {
            id: "bedtime" as StoryStyle,
            icon: BookOpen,
            label: "Bedtime Story",
            description: "Simple, calm",
            color: "text-blue-500"
        },
        {
            id: "movie" as StoryStyle,
            icon: Film,
            label: "Movie Script",
            description: "Dramatic, exciting",
            color: "text-purple-500"
        },
        {
            id: "teacher" as StoryStyle,
            icon: GraduationCap,
            label: "Teacher Mode",
            description: "Educational, detailed",
            color: "text-green-500"
        },
        {
            id: "eli5" as StoryStyle,
            icon: Baby,
            label: "Explain Like I'm 5",
            description: "Super simple",
            color: "text-yellow-500"
        },
        {
            id: "facts" as StoryStyle,
            icon: FileText,
            label: "Just Facts",
            description: "No story, data only",
            color: "text-gray-500"
        }
    ];

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

            // Call the new story API endpoint
            const response = await axios.post(`${API_BASE_URL}/stock-story`, {
                symbol: upperSymbol,
                style: selectedStyle
            });

            setStoryData(response.data);

            toast({
                title: "Story Ready! 📖",
                description: `Generated personalized story for ${upperSymbol}`,
            });

            // Auto-scroll to story
            setTimeout(() => {
                document.getElementById("story-content")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }, 100);

        } catch (err: any) {
            if (err.response?.status === 404) {
                setError(`Stock symbol "${symbol.toUpperCase()}" not found. Please try another symbol.`);
            } else {
                setError("Failed to generate story. Please try again.");
            }
            console.error("Story generation error:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        analyzeStock();
    };




    const speakText = (audioUrl: string) => {
        try {
            // Stop any currently playing audio
            if (audioInstance) {
                audioInstance.pause();
                audioInstance.currentTime = 0;
            }

            // Construct the full audio URL
            // If audioUrl already starts with http, use it directly
            // Otherwise, prepend the base URL without /api
            const fullAudioUrl = audioUrl.startsWith('http')
                ? audioUrl
                : `https://stock-analysis-y1zp.onrender.com${audioUrl}`;

            console.log('Playing audio from:', fullAudioUrl);

            // Create new audio instance with the full URL
            const newAudio = new Audio(fullAudioUrl);

            // Handle audio events
            newAudio.addEventListener('ended', () => {
                setVoiceEnabled(false);
                console.log('Audio playback ended');
            });

            newAudio.addEventListener('error', (e: any) => {
                console.error('Audio playback error:', e);
                console.error('Failed URL:', fullAudioUrl);
                console.error('Error details:', e.target?.error);
                toast({
                    title: "Audio Playback Error",
                    description: `Failed to play the audio. URL: ${fullAudioUrl}`,
                    variant: "destructive",
                });
                setVoiceEnabled(false);
            });

            newAudio.addEventListener('loadstart', () => {
                console.log('Audio loading started');
            });

            newAudio.addEventListener('canplay', () => {
                console.log('Audio can play');
            });

            setAudioInstance(newAudio);

            // Play the audio and handle the promise
            newAudio.play()
                .then(() => {
                    console.log('Audio playing successfully');
                })
                .catch(err => {
                    console.error('Play promise rejected:', err);
                    console.error('Error name:', err.name);
                    console.error('Error message:', err.message);

                    let errorMessage = "Failed to play audio. ";

                    if (err.name === 'NotAllowedError') {
                        errorMessage = "Browser blocked autoplay. Please click the button again.";
                    } else if (err.name === 'NotSupportedError') {
                        errorMessage = "Audio format not supported by your browser.";
                    } else if (err.name === 'AbortError') {
                        errorMessage = "Audio loading was interrupted.";
                    } else {
                        errorMessage += err.message || "Unknown error occurred.";
                    }

                    toast({
                        title: "Audio Playback Error",
                        description: errorMessage,
                        variant: "destructive",
                    });
                    setVoiceEnabled(false);
                });

        } catch (error) {
            console.error('Audio initialization error:', error);
            toast({
                title: "Audio Error",
                description: "Failed to initialize audio playback.",
                variant: "destructive",
            });
            setVoiceEnabled(false);
        }
    };

    const stopSpeaking = () => {
        if (audioInstance) {
            audioInstance.pause();
            audioInstance.currentTime = 0;
        }
    };

    // Cleanup audio on component unmount
    useEffect(() => {
        return () => {
            if (audioInstance) {
                audioInstance.pause();
                audioInstance.currentTime = 0;
            }
        };
    }, [audioInstance]);

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Hero Header */}
            <div className="text-center mb-8">
                <div className="flex items-center justify-center space-x-3 mb-4">
                    <div className="flex items-center justify-center w-16 h-16 gradient-primary rounded-2xl">
                        <BookOpen className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                        StoryStock
                    </h1>
                </div>
                <p className="text-xl text-muted-foreground mb-2">
                    Every stock has a story. We tell it.
                </p>
                <p className="text-sm text-muted-foreground">
                    Investing explained like you're 5. Decide like you're 50.
                </p>
            </div>


            {/* Search Section */}
            <Card className="financial-card shadow-financial border-2">
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                        <Search className="w-5 h-5 text-primary" />
                        <span>Which stock's story do you want to hear?</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Style Selector */}
                    <div>
                        <label className="text-sm font-medium mb-3 block">Choose Your Story Style:</label>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {storyStyles.map((style) => (
                                <button
                                    key={style.id}
                                    onClick={() => setSelectedStyle(style.id)}
                                    className={`p-4 rounded-xl border-2 transition-all ${selectedStyle === style.id
                                        ? "border-primary bg-primary/10 shadow-md"
                                        : "border-border hover:border-primary/50 hover:bg-muted"
                                        }`}
                                >
                                    <style.icon className={`w-6 h-6 mx-auto mb-2 ${style.color}`} />
                                    <p className="font-semibold text-sm">{style.label}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{style.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Search Input */}
                    <form onSubmit={handleSubmit} className="flex gap-3">
                        <Input
                            type="text"
                            placeholder="Enter stock symbol (e.g., AAPL, RELIANCE.NS)"
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value)}
                            className="financial-input text-lg"
                            disabled={loading}
                        />
                        <Button
                            type="submit"
                            disabled={loading}
                            className="px-8 rounded-xl font-medium shadow-md bg-gradient-to-r from-primary to-purple-500 hover:opacity-90"
                            size="lg"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Creating Story...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-5 h-5 mr-2" />
                                    Tell Me The Story
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
                        <p className="text-destructive font-medium flex items-center">
                            <AlertTriangle className="w-5 h-5 mr-2" />
                            {error}
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Story Content */}
            {storyData && (
                <div id="story-content" className="space-y-6">
                    {/* Story Header */}
                    <Card className="financial-card bg-gradient-to-r from-primary/10 to-purple-500/10 border-2 border-primary/20">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-3xl font-bold mb-2">
                                        📖 The {storyData.symbol} Story
                                    </h2>
                                    <p className="text-muted-foreground">
                                        {storyData.market} Market • Current Price: ${storyData.currentPrice.toFixed(2)}
                                    </p>
                                </div>

                                <audio
                                    ref={aRef}
                                    className="hidden"
                                    controls
                                    src={`${API_BASE_URL}${storyData.storyAudio}`}
                                    crossOrigin="anonymous"
                                    onCanPlay={() => console.log("can play")}
                                    onError={(e) => {
                                        const mediaErr = aRef.current?.error;
                                        console.error("audio error event", e, "mediaError:", mediaErr);
                                    }}
                                />


                                <Button
                                    variant="outline"
                                    size="lg"
                                    onClick={() => {
                                        if (voiceEnabled) {
                                            aRef.current && aRef.current.pause();
                                            setVoiceEnabled(false);
                                        } else {
                                            // Use the audio URL directly from API response

                                            aRef.current && aRef.current.play()
                                            setVoiceEnabled(true);
                                        }
                                    }}
                                    className="rounded-xl"
                                >
                                    {voiceEnabled ? (
                                        <>
                                            <VolumeX className="w-5 h-5 mr-2" />
                                            Stop Voice
                                        </>
                                    ) : (
                                        <>
                                            <Volume2 className="w-5 h-5 mr-2" />
                                            Listen to Story
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Story Acts */}
                    <div className="grid grid-cols-1 gap-6">
                        {/* Act 1: The Setup */}
                        <Card className="financial-card">
                            <CardHeader className="bg-gradient-to-r from-blue-500/10 to-blue-600/10">
                                <CardTitle className="flex items-center space-x-2">
                                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                                        1
                                    </div>
                                    <span>🎬 Act 1: The Setup</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <div className="prose prose-lg max-w-none">
                                    {storyData.storyContent.setup.split('\n\n').map((para, idx) => (
                                        <p key={idx} className="text-card-foreground leading-relaxed mb-4">
                                            {para}
                                        </p>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Act 2: Current Situation */}
                        <Card className="financial-card">
                            <CardHeader className="bg-gradient-to-r from-green-500/10 to-green-600/10">
                                <CardTitle className="flex items-center space-x-2">
                                    <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold">
                                        2
                                    </div>
                                    <span>📊 Act 2: The Current Situation</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <div className="prose prose-lg max-w-none">
                                    {storyData.storyContent.currentSituation.split('\n\n').map((para, idx) => (
                                        <p key={idx} className="text-card-foreground leading-relaxed mb-4">
                                            {para}
                                        </p>
                                    ))}
                                </div>

                                {/* Key Metrics */}
                                {(storyData.metrics.pe || storyData.metrics.roe || storyData.metrics.debtEquity) && (
                                    <div className="mt-6 grid grid-cols-3 gap-4">
                                        {storyData.metrics.pe && (
                                            <div className="text-center p-4 bg-muted/30 rounded-xl">
                                                <p className="text-2xl font-bold text-primary">{storyData.metrics.pe}</p>
                                                <p className="text-xs text-muted-foreground">P/E Ratio</p>
                                            </div>
                                        )}
                                        {storyData.metrics.roe && (
                                            <div className="text-center p-4 bg-muted/30 rounded-xl">
                                                <p className="text-2xl font-bold text-success">{storyData.metrics.roe}%</p>
                                                <p className="text-xs text-muted-foreground">ROE</p>
                                            </div>
                                        )}
                                        {storyData.metrics.debtEquity && (
                                            <div className="text-center p-4 bg-muted/30 rounded-xl">
                                                <p className="text-2xl font-bold text-accent">{storyData.metrics.debtEquity}</p>
                                                <p className="text-xs text-muted-foreground">Debt/Equity</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Act 3: The Conflict */}
                        <Card className="financial-card">
                            <CardHeader className="bg-gradient-to-r from-red-500/10 to-red-600/10">
                                <CardTitle className="flex items-center space-x-2">
                                    <div className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center font-bold">
                                        3
                                    </div>
                                    <span>⚠️ Act 3: The Conflict (The Risk)</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <div className="prose prose-lg max-w-none">
                                    {storyData.storyContent.conflict.split('\n\n').map((para, idx) => (
                                        <p key={idx} className="text-card-foreground leading-relaxed mb-4">
                                            {para}
                                        </p>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Act 4: The Strengths */}
                        <Card className="financial-card">
                            <CardHeader className="bg-gradient-to-r from-emerald-500/10 to-emerald-600/10">
                                <CardTitle className="flex items-center space-x-2">
                                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold">
                                        4
                                    </div>
                                    <span>💪 Act 4: The Strengths</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <div className="prose prose-lg max-w-none">
                                    {storyData.storyContent.strengths.split('\n\n').map((para, idx) => (
                                        <p key={idx} className="text-card-foreground leading-relaxed mb-4">
                                            {para}
                                        </p>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Act 5: The Verdict */}
                        <Card className="financial-card">
                            <CardHeader className="bg-gradient-to-r from-purple-500/10 to-purple-600/10">
                                <CardTitle className="flex items-center space-x-2">
                                    <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center font-bold">
                                        5
                                    </div>
                                    <span>🎯 Act 5: The Verdict</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <div className="prose prose-lg max-w-none">
                                    {storyData.storyContent.verdict.split('\n\n').map((para, idx) => (
                                        <p key={idx} className="text-card-foreground leading-relaxed mb-4">
                                            {para}
                                        </p>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Decision Framework */}
                    <Card className="financial-card border-2 border-primary">
                        <CardHeader>
                            <CardTitle className="flex items-center space-x-2">
                                <DollarSign className="w-5 h-5 text-primary" />
                                <span>📊 The Decision Framework</span>
                            </CardTitle>
                            <p className="text-sm text-muted-foreground mt-2">
                                Simple as hell - should you buy {storyData.symbol} today?
                            </p>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* YES, if */}
                                <div className="space-y-3">
                                    <div className="flex items-center space-x-2 mb-3">
                                        <CheckCircle2 className="w-5 h-5 text-success" />
                                        <h3 className="font-bold text-lg">✅ YES, if:</h3>
                                    </div>
                                    {storyData.decisionFramework.buyIf.map((reason, idx) => (
                                        <div key={idx} className="flex items-start space-x-2">
                                            <ArrowRight className="w-4 h-4 text-success mt-1 flex-shrink-0" />
                                            <p className="text-sm text-card-foreground">{reason}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* NO, if */}
                                <div className="space-y-3">
                                    <div className="flex items-center space-x-2 mb-3">
                                        <XCircle className="w-5 h-5 text-destructive" />
                                        <h3 className="font-bold text-lg">❌ NO, if:</h3>
                                    </div>
                                    {storyData.decisionFramework.noIf.map((reason, idx) => (
                                        <div key={idx} className="flex items-start space-x-2">
                                            <ArrowRight className="w-4 h-4 text-destructive mt-1 flex-shrink-0" />
                                            <p className="text-sm text-card-foreground">{reason}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* MAYBE, if */}
                                <div className="space-y-3">
                                    <div className="flex items-center space-x-2 mb-3">
                                        <HelpCircle className="w-5 h-5 text-yellow-500" />
                                        <h3 className="font-bold text-lg">🤔 MAYBE, if:</h3>
                                    </div>
                                    {storyData.decisionFramework.maybeIf.map((reason, idx) => (
                                        <div key={idx} className="flex items-start space-x-2">
                                            <ArrowRight className="w-4 h-4 text-yellow-500 mt-1 flex-shrink-0" />
                                            <p className="text-sm text-card-foreground">{reason}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Bias Check */}
                    <Card className="financial-card bg-gradient-to-r from-emerald-500/10 to-green-500/10 border-2 border-emerald-500/30">
                        <CardHeader>
                            <CardTitle className="flex items-center space-x-2">
                                <Shield className="w-5 h-5 text-emerald-500" />
                                <span>⚖️ The "No Bias" Guarantee</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-start space-x-3">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-1 flex-shrink-0" />
                                    <div>
                                        <p className="font-semibold mb-1">We don't own {storyData.symbol} stock</p>
                                        <p className="text-sm text-muted-foreground">{storyData.biasCheck.ownership}</p>
                                    </div>
                                </div>

                                <Separator />

                                <div className="flex items-start space-x-3">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-1 flex-shrink-0" />
                                    <div>
                                        <p className="font-semibold mb-1">How this story was generated</p>
                                        <p className="text-sm text-muted-foreground">{storyData.biasCheck.methodology}</p>
                                    </div>
                                </div>

                                <Separator />

                                <div className="flex items-start space-x-3">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-1 flex-shrink-0" />
                                    <div>
                                        <p className="font-semibold mb-2">Data Sources Used</p>
                                        <div className="flex flex-wrap gap-2">
                                            {storyData.biasCheck.dataSources.map((source, idx) => (
                                                <Badge key={idx} variant="secondary" className="text-xs">
                                                    {source}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 p-4 bg-card rounded-xl border border-border">
                                    <p className="text-sm text-muted-foreground text-center">
                                        <strong>Our Job:</strong> Tell you the truth, not sell you the stock.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* CTA */}
                    <Card className="bg-gradient-to-r from-primary to-purple-500 text-white">
                        <CardContent className="pt-6 text-center">
                            <h3 className="text-2xl font-bold mb-2">Want another story?</h3>
                            <p className="mb-4 opacity-90">Try a different stock or change the story style</p>
                            <Button
                                variant="secondary"
                                size="lg"
                                onClick={() => {
                                    setStoryData(null);
                                    setSymbol("");
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                                className="rounded-xl"
                            >
                                <Search className="w-5 h-5 mr-2" />
                                Tell Me Another Story
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Info Cards for First-time Users */}
            {!storyData && !loading && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                    <Card className="financial-card">
                        <CardContent className="pt-6">
                            <BookOpen className="w-12 h-12 text-primary mb-4" />
                            <h3 className="font-bold text-lg mb-2">Stories, Not Jargon</h3>
                            <p className="text-sm text-muted-foreground">
                                No confusing P/E ratios or technical terms. Just clear, engaging stories that explain what's really happening.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="financial-card">
                        <CardContent className="pt-6">
                            <Shield className="w-12 h-12 text-emerald-500 mb-4" />
                            <h3 className="font-bold text-lg mb-2">100% Unbiased</h3>
                            <p className="text-sm text-muted-foreground">
                                We don't own stocks. We don't get paid by companies. We just tell you the truth about every investment.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="financial-card">
                        <CardContent className="pt-6">
                            <Sparkles className="w-12 h-12 text-purple-500 mb-4" />
                            <h3 className="font-bold text-lg mb-2">AI-Powered Insights</h3>
                            <p className="text-sm text-muted-foreground">
                                Every story is generated by AI analyzing real financial data, news, and market sentiment in real-time.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default StoryStock;
