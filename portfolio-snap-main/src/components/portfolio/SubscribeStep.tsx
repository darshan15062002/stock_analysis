import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { PortfolioData } from "@/pages/Index";

interface SubscribeStepProps {
  portfolioData: PortfolioData;
  onSubscribe: (email: string, frequency: "daily" | "weekly" | "monthly") => void;
  onBack: () => void;
}

const SubscribeStep = ({ portfolioData, onSubscribe, onBack }: SubscribeStepProps) => {
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes("@")) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        email,
        frequency,
        portfolio: {
          ...portfolioData,
          edited_at: portfolioData.edited_at || new Date().toISOString(),
        },
        user_preferences: {
          send_welcome_mail: true,
          allow_edit_in_future: true,
        },
      };

      const response = await fetch("http://localhost:4000/api/user/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to subscribe");
      }

      toast({
        title: "Subscription successful!",
        description: "You'll start receiving portfolio insights soon",
      });

      onSubscribe(email, frequency);
    } catch (error) {
      toast({
        title: "Subscription failed",
        description: error instanceof Error ? error.message : "Failed to create subscription",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div className="flex items-center">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Title */}
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-bold text-foreground">Subscribe to Insights</h2>
        <p className="text-lg text-muted-foreground">
          Get regular portfolio analysis delivered to your inbox
        </p>
      </div>

      {/* Form Card */}
      <Card className="bg-gradient-card border-border/50 shadow-elegant max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {/* Email Input */}
          <div className="space-y-3">
            <Label htmlFor="email" className="text-base font-semibold text-foreground">
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 text-base bg-background border-border focus:border-primary"
              required
            />
            <p className="text-sm text-muted-foreground">
              We'll send your portfolio insights to this email
            </p>
          </div>

          {/* Frequency Selection */}
          <div className="space-y-4">
            <Label className="text-base font-semibold text-foreground">
              Report Frequency
            </Label>
            
            <div className="grid gap-4">
              {[
                { value: "daily", label: "Daily", desc: "Get insights every day" },
                { value: "weekly", label: "Weekly", desc: "Perfect for regular tracking" },
                { value: "monthly", label: "Monthly", desc: "Long-term performance review" },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`
                    flex items-center space-x-4 p-5 rounded-xl border-2 cursor-pointer transition-all
                    ${frequency === option.value
                      ? "border-primary bg-primary/10 shadow-glow"
                      : "border-border hover:border-primary/50 bg-card/50"
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="frequency"
                    value={option.value}
                    checked={frequency === option.value}
                    onChange={(e) => setFrequency(e.target.value as "daily" | "weekly" | "monthly")}
                    className="w-5 h-5 text-primary"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{option.label}</p>
                    <p className="text-sm text-muted-foreground">{option.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isSubmitting}
            size="lg"
            className="w-full py-6 text-lg font-semibold bg-gradient-primary hover:opacity-90 transition-opacity shadow-glow"
          >
            {isSubmitting ? "Subscribing..." : "Start Receiving Insights"}
          </Button>
        </form>
      </Card>

      {/* Features */}
      <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
        <Card className="bg-card border-border/50 p-6">
          <div className="flex items-start space-x-4">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xl">📈</span>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">Performance Tracking</h3>
              <p className="text-sm text-muted-foreground">
                Monitor your portfolio's growth over time
              </p>
            </div>
          </div>
        </Card>

        <Card className="bg-card border-border/50 p-6">
          <div className="flex items-start space-x-4">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xl">🔒</span>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">Secure & Private</h3>
              <p className="text-sm text-muted-foreground">
                Your data is encrypted and never shared
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SubscribeStep;
