import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Shield, Zap, BarChart3, Target, Users } from "lucide-react";

const About = () => {
  const features = [
    {
      icon: TrendingUp,
      title: "AI-Driven Analysis",
      description: "Advanced artificial intelligence provides comprehensive stock and portfolio insights based on real market data and trends."
    },
    {
      icon: Shield,
      title: "Unbiased Insights",
      description: "Our platform delivers objective analysis free from conflicts of interest, ensuring you get pure, data-driven investment guidance."
    },
    {
      icon: Zap,
      title: "Real-Time Data",
      description: "Access up-to-the-minute market information and instant analysis to make timely investment decisions."
    },
    {
      icon: BarChart3,
      title: "Visual Analytics",
      description: "Clear, interactive charts and graphs make complex financial data easy to understand and actionable."
    },
    {
      icon: Target,
      title: "Risk Assessment",
      description: "Comprehensive risk analysis helps you understand potential downsides and optimize your portfolio allocation."
    },
    {
      icon: Users,
      title: "For Everyone",
      description: "Whether you're a beginner or experienced investor, our tools are designed to be accessible and valuable."
    }
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center mb-4">
          <div className="flex items-center justify-center w-16 h-16 gradient-primary rounded-2xl">
            <TrendingUp className="w-8 h-8 text-white" />
          </div>
        </div>
        <h1 className="text-4xl font-semibold text-foreground mb-4">
          About Unbiased Stock Analysis
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Empowering investors with AI-driven insights and unbiased analysis to make confident, data-backed investment decisions.
        </p>
      </div>

      {/* Main Description */}
      <Card className="financial-card shadow-financial">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Our Mission</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-lg text-card-foreground leading-relaxed mb-6">
            This app provides unbiased AI-driven stock and portfolio analysis. It helps investors make data-backed decisions with simple insights and visualizations, removing the complexity and potential bias often found in traditional financial analysis tools.
          </p>
          <div className="bg-muted/30 rounded-xl p-6">
            <p className="text-muted-foreground">
              Built for a hackathon MVP, this platform demonstrates the power of combining artificial intelligence with financial data to create accessible investment tools for everyone.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {features.map((feature, index) => (
          <Card key={index} className="financial-card hover:shadow-financial transition-all duration-300">
            <CardHeader>
              <CardTitle className="flex items-center space-x-3">
                <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-xl">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-lg">{feature.title}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-card-foreground leading-relaxed">
                {feature.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* How It Works */}
      <Card className="financial-card">
        <CardHeader>
          <CardTitle className="text-center text-2xl">How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 bg-primary rounded-xl mx-auto mb-4">
                <span className="text-white font-bold text-lg">1</span>
              </div>
              <h3 className="font-semibold text-foreground mb-2">Input Your Data</h3>
              <p className="text-muted-foreground text-sm">
                Enter stock symbols or portfolio holdings to begin your analysis
              </p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 bg-accent rounded-xl mx-auto mb-4">
                <span className="text-white font-bold text-lg">2</span>
              </div>
              <h3 className="font-semibold text-foreground mb-2">AI Analysis</h3>
              <p className="text-muted-foreground text-sm">
                Our AI processes market data and generates comprehensive insights
              </p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 bg-success rounded-xl mx-auto mb-4">
                <span className="text-white font-bold text-lg">3</span>
              </div>
              <h3 className="font-semibold text-foreground mb-2">Get Insights</h3>
              <p className="text-muted-foreground text-sm">
                Receive clear, actionable insights with visual charts and analysis
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact/Footer */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6 text-center">
          <p className="text-muted-foreground">
            <strong>MVP Demo:</strong> This is a hackathon prototype showcasing AI-powered financial analysis. 
            In production, this would integrate with real market data APIs and advanced analytics engines.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default About;