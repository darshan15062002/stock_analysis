import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, Pencil } from "lucide-react";
import type { PortfolioData, Holding } from "@/pages/Index";

interface ReviewStepProps {
  portfolioData: PortfolioData;
  onComplete: (editedData: PortfolioData) => void;
  onBack: () => void;
}

const ReviewStep = ({ portfolioData, onComplete, onBack }: ReviewStepProps) => {
  const [holdings, setHoldings] = useState<Holding[]>(portfolioData.holdings);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleEdit = (index: number, field: keyof Holding, value: string | number) => {
    const updated = [...holdings];
    updated[index] = {
      ...updated[index],
      [field]: typeof value === "string" ? value : Number(value),
    };
    setHoldings(updated);
  };

  const handleComplete = () => {
    const editedData: PortfolioData = {
      ...portfolioData,
      edited_at: new Date().toISOString(),
      holdings,
    };
    onComplete(editedData);
  };

  const totalInvested = holdings.reduce((sum, h) => sum + (h.total_invested || h.quantity * h.avg_price), 0);
  const totalCurrent = holdings.reduce((sum, h) => sum + (h.current_value || h.quantity * (h.current_price || h.avg_price)), 0);
  const totalPnL = totalCurrent - totalInvested;
  const pnlPercentage = ((totalPnL / totalInvested) * 100).toFixed(2);

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        
        <Badge className="bg-primary/20 text-primary border-primary/30 px-4 py-1">
          {holdings.length} holdings extracted
        </Badge>
      </div>

      {/* Title */}
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-bold text-foreground">Review Your Portfolio</h2>
        <p className="text-lg text-muted-foreground">
          Verify the extracted data and make any corrections
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="bg-gradient-card border-border/50 p-6">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Total Invested</p>
            <p className="text-3xl font-bold text-foreground">
              ₹{totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
          </div>
        </Card>

        <Card className="bg-gradient-card border-border/50 p-6">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Current Value</p>
            <p className="text-3xl font-bold text-foreground">
              ₹{totalCurrent.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
          </div>
        </Card>

        <Card className="bg-gradient-card border-border/50 p-6">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Total P&L</p>
            <p className={`text-3xl font-bold ${totalPnL >= 0 ? 'text-primary' : 'text-destructive'}`}>
              {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              <span className="text-lg ml-2">({pnlPercentage}%)</span>
            </p>
          </div>
        </Card>
      </div>

      {/* Holdings Table */}
      <Card className="bg-card border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left p-4 text-sm font-semibold text-muted-foreground">Symbol</th>
                <th className="text-left p-4 text-sm font-semibold text-muted-foreground">Company</th>
                <th className="text-right p-4 text-sm font-semibold text-muted-foreground">Quantity</th>
                <th className="text-right p-4 text-sm font-semibold text-muted-foreground">Avg Price</th>
                <th className="text-right p-4 text-sm font-semibold text-muted-foreground">Current Price</th>
                <th className="text-right p-4 text-sm font-semibold text-muted-foreground">P&L</th>
                <th className="text-center p-4 text-sm font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding, index) => {
                const pnl = (holding.profit_loss !== undefined) 
                  ? holding.profit_loss 
                  : holding.quantity * ((holding.current_price || holding.avg_price) - holding.avg_price);
                const isEditing = editingIndex === index;

                return (
                  <tr key={index} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                    <td className="p-4">
                      {isEditing ? (
                        <Input
                          value={holding.symbol}
                          onChange={(e) => handleEdit(index, 'symbol', e.target.value)}
                          className="w-24"
                        />
                      ) : (
                        <span className="font-semibold text-foreground">{holding.symbol}</span>
                      )}
                    </td>
                    <td className="p-4">
                      {isEditing ? (
                        <Input
                          value={holding.name}
                          onChange={(e) => handleEdit(index, 'name', e.target.value)}
                          className="w-48"
                        />
                      ) : (
                        <span className="text-muted-foreground">{holding.name}</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          value={holding.quantity}
                          onChange={(e) => handleEdit(index, 'quantity', parseFloat(e.target.value))}
                          className="w-20 text-right"
                        />
                      ) : (
                        <span className="text-foreground">{holding.quantity}</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={holding.avg_price}
                          onChange={(e) => handleEdit(index, 'avg_price', parseFloat(e.target.value))}
                          className="w-28 text-right"
                        />
                      ) : (
                        <span className="text-foreground">₹{holding.avg_price.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={holding.current_price || holding.avg_price}
                          onChange={(e) => handleEdit(index, 'current_price', parseFloat(e.target.value))}
                          className="w-28 text-right"
                        />
                      ) : (
                        <span className="text-foreground">
                          ₹{(holding.current_price || holding.avg_price).toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <span className={`font-semibold ${pnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                        {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingIndex(isEditing ? null : index)}
                        className="hover:bg-primary/10"
                      >
                        {isEditing ? (
                          <Check className="w-4 h-4 text-primary" />
                        ) : (
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Continue Button */}
      <div className="flex justify-center pt-4">
        <Button
          onClick={handleComplete}
          size="lg"
          className="px-12 py-6 text-lg font-semibold bg-gradient-primary hover:opacity-90 transition-opacity shadow-glow"
        >
          Continue to Subscribe
        </Button>
      </div>
    </div>
  );
};

export default ReviewStep;
