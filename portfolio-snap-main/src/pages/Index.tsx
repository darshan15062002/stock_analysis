import { useState } from "react";
import UploadStep from "@/components/portfolio/UploadStep";
import ReviewStep from "@/components/portfolio/ReviewStep";
import SubscribeStep from "@/components/portfolio/SubscribeStep";
import SuccessStep from "@/components/portfolio/SuccessStep";

export type Holding = {
  symbol: string;
  name: string;
  quantity: number;
  avg_price: number;
  current_price?: number;
  total_invested?: number;
  current_value?: number;
  profit_loss?: number;
};

export type PortfolioData = {
  source: string;
  uploaded_at: string;
  extracted_at: string;
  edited_at?: string;
  holdings: Holding[];
};

type Step = "upload" | "review" | "subscribe" | "success";

const Index = () => {
  const [currentStep, setCurrentStep] = useState<Step>("upload");
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");

  const handleUploadSuccess = (data: PortfolioData) => {
    setPortfolioData(data);
    setCurrentStep("review");
  };

  const handleReviewComplete = (editedData: PortfolioData) => {
    setPortfolioData(editedData);
    setCurrentStep("subscribe");
  };

  const handleSubscribe = async (email: string, selectedFrequency: "daily" | "weekly" | "monthly") => {
    setUserEmail(email);
    setFrequency(selectedFrequency);
    setCurrentStep("success");
  };

  const handleStartOver = () => {
    setCurrentStep("upload");
    setPortfolioData(null);
    setUserEmail("");
    setFrequency("weekly");
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Portfolio Insights
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-5xl mx-auto animate-fade-in">
          {currentStep === "upload" && (
            <UploadStep onUploadSuccess={handleUploadSuccess} />
          )}
          
          {currentStep === "review" && portfolioData && (
            <ReviewStep
              portfolioData={portfolioData}
              onComplete={handleReviewComplete}
              onBack={() => setCurrentStep("upload")}
            />
          )}
          
          {currentStep === "subscribe" && portfolioData && (
            <SubscribeStep
              portfolioData={portfolioData}
              onSubscribe={handleSubscribe}
              onBack={() => setCurrentStep("review")}
            />
          )}
          
          {currentStep === "success" && (
            <SuccessStep
              email={userEmail}
              frequency={frequency}
              onStartOver={handleStartOver}
            />
          )}
        </div>
      </div>
    </main>
  );
};

export default Index;
