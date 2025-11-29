import { useState, useCallback } from "react";
import { Upload, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { PortfolioData } from "@/pages/Index";

interface UploadStepProps {
  onUploadSuccess: (data: PortfolioData) => void;
}

const UploadStep = ({ onUploadSuccess }: UploadStepProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedFile(file);
    } else {
      toast({
        title: "Invalid file",
        description: "Please upload an image file",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append("portfolio_image", selectedFile);

      const response = await fetch("http://localhost:4000/api/portfolio/extract-from-image", {
        method: "POST",
        headers: {
          "accept": "application/json",
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to extract portfolio data");
      }

      const data = await response.json();
      
      // Transform API response to match our PortfolioData type
      const portfolioData: PortfolioData = {
        source: data.portfolio_source || "unknown",
        uploaded_at: new Date().toISOString(),
        extracted_at: new Date().toISOString(),
        holdings: data.portfolioData?.holdings?.map((holding: any) => ({
          symbol: holding.symbol || "",
          name: holding.symbol?.replace('.NS', '') || "",
          quantity: holding.quantity || 0,
          avg_price: holding.quantity > 0 ? holding.invested / holding.quantity : 0,
          current_price: holding.quantity > 0 ? holding.currentValue / holding.quantity : 0,
          total_invested: holding.invested || 0,
          current_value: holding.currentValue || 0,
          profit_loss: holding.pnl || 0,
        })) || [],
      };

      toast({
        title: "Success!",
        description: "Portfolio data extracted successfully",
      });

      onUploadSuccess(portfolioData);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to process portfolio image",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Hero Section */}
      <div className="text-center space-y-4 mb-12">
        <h2 className="text-5xl font-bold text-foreground tracking-tight">
          Smart Portfolio Tracking
        </h2>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Upload your portfolio screenshot and get AI-powered insights delivered to your inbox
        </p>
      </div>

      {/* Upload Card */}
      <Card className="bg-gradient-card border-border/50 shadow-elegant overflow-hidden">
        <div className="p-12">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative border-2 border-dashed rounded-2xl transition-all duration-300
              ${isDragging 
                ? "border-primary bg-primary/5 scale-[1.02]" 
                : "border-border hover:border-primary/50 hover:bg-muted/20"
              }
              ${selectedFile ? "bg-muted/30" : ""}
            `}
          >
            <label className="cursor-pointer block p-16">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isUploading}
              />
              
              <div className="flex flex-col items-center space-y-6">
                <div className={`
                  p-6 rounded-2xl transition-all duration-300
                  ${selectedFile 
                    ? "bg-primary/20 shadow-glow" 
                    : "bg-muted/50"
                  }
                `}>
                  {selectedFile ? (
                    <ImageIcon className="w-16 h-16 text-primary" />
                  ) : (
                    <Upload className="w-16 h-16 text-muted-foreground" />
                  )}
                </div>
                
                {selectedFile ? (
                  <div className="text-center space-y-2">
                    <p className="text-lg font-semibold text-foreground">
                      {selectedFile.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div className="text-center space-y-2">
                    <p className="text-xl font-semibold text-foreground">
                      Drop your portfolio screenshot here
                    </p>
                    <p className="text-sm text-muted-foreground">
                      or click to browse • Supports Groww, Zerodha, Upstox & more
                    </p>
                  </div>
                )}
              </div>
            </label>
          </div>

          {selectedFile && (
            <div className="mt-8 flex justify-center">
              <Button
                onClick={handleUpload}
                disabled={isUploading}
                size="lg"
                className="px-12 py-6 text-lg font-semibold bg-gradient-primary hover:opacity-90 transition-opacity shadow-glow"
              >
                {isUploading ? "Extracting Data..." : "Continue"}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Features */}
      <div className="grid md:grid-cols-3 gap-6 mt-12">
        <Card className="bg-card border-border/50 p-6 hover:shadow-elegant transition-shadow">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <span className="text-2xl">🤖</span>
            </div>
            <h3 className="font-semibold text-foreground">AI-Powered</h3>
            <p className="text-sm text-muted-foreground">
              Advanced OCR extracts your holdings with high accuracy
            </p>
          </div>
        </Card>

        <Card className="bg-card border-border/50 p-6 hover:shadow-elegant transition-shadow">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <span className="text-2xl">✏️</span>
            </div>
            <h3 className="font-semibold text-foreground">Fully Editable</h3>
            <p className="text-sm text-muted-foreground">
              Review and correct any data before subscribing
            </p>
          </div>
        </Card>

        <Card className="bg-card border-border/50 p-6 hover:shadow-elegant transition-shadow">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="font-semibold text-foreground">Regular Reports</h3>
            <p className="text-sm text-muted-foreground">
              Get insights delivered daily, weekly, or monthly
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default UploadStep;
