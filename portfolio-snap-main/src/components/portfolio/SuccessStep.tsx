import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

interface SuccessStepProps {
  email: string;
  frequency: string;
  onStartOver: () => void;
}

const SuccessStep = ({ email, frequency, onStartOver }: SuccessStepProps) => {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Success Icon */}
      <div className="flex justify-center">
        <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center shadow-glow">
          <CheckCircle2 className="w-16 h-16 text-primary" />
        </div>
      </div>

      {/* Title */}
      <div className="text-center space-y-4">
        <h2 className="text-5xl font-bold text-foreground">You're All Set!</h2>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Your portfolio subscription has been successfully activated
        </p>
      </div>

      {/* Details Card */}
      <Card className="bg-gradient-card border-border/50 shadow-elegant max-w-2xl mx-auto">
        <div className="p-8 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between py-4 border-b border-border/30">
              <span className="text-muted-foreground">Email</span>
              <span className="font-semibold text-foreground">{email}</span>
            </div>
            
            <div className="flex items-center justify-between py-4 border-b border-border/30">
              <span className="text-muted-foreground">Report Frequency</span>
              <span className="font-semibold text-foreground capitalize">{frequency}</span>
            </div>
            
            <div className="flex items-center justify-between py-4">
              <span className="text-muted-foreground">Status</span>
              <span className="px-4 py-2 rounded-lg bg-primary/20 text-primary font-semibold">
                Active
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* What's Next */}
      <Card className="bg-card border-border/50 max-w-2xl mx-auto">
        <div className="p-8 space-y-6">
          <h3 className="text-2xl font-bold text-foreground">What happens next?</h3>
          
          <div className="space-y-4">
            <div className="flex items-start space-x-4">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-primary font-bold">1</span>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">Welcome Email</h4>
                <p className="text-sm text-muted-foreground">
                  Check your inbox for a confirmation email with subscription details
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-primary font-bold">2</span>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">Portfolio Analysis</h4>
                <p className="text-sm text-muted-foreground">
                  We'll analyze your portfolio and prepare insights based on market data
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-primary font-bold">3</span>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">First Report</h4>
                <p className="text-sm text-muted-foreground">
                  Your first {frequency} report will arrive in your inbox soon
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex justify-center pt-4">
        <Button
          onClick={onStartOver}
          variant="outline"
          size="lg"
          className="px-12 py-6 text-lg border-border hover:bg-muted/50"
        >
          Track Another Portfolio
        </Button>
      </div>
    </div>
  );
};

export default SuccessStep;
