# ReportEngine/test.py
import os
import sys
import json
import requests
import smtplib
import yagmail
from pathlib import Path
from datetime import datetime
from pymongo import MongoClient
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from email_validator import validate_email, EmailNotValidError

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Load .env
from dotenv import load_dotenv
load_dotenv(project_root / ".env")

from agent import ReportAgent
from utils.config import Settings

# MongoDB connection
MONGODB_URI = 'mongodb+srv://darshan:$$dar$$123@cluster0.ohxhu.mongodb.net/'
SERVER_URL = 'http://localhost:4000'

# Email configuration
EMAIL_CONFIG = {
    'smtp_server': 'smtp.gmail.com',
    'smtp_port': 587,
    'sender_email': 'darshanjain15062002@gmail.com',  # Replace with your email
    'sender_password': 'huas kpfn wwwn wpyq',  # Replace with your app password
    'sender_name': 'Stock Analysis Report Engine'
}

def send_email_with_report(recipient_email, report_content, report_filename=None, html_filename=None):
    """Send email with the generated report"""
    try:
        # Validate email
        try:
            valid = validate_email(recipient_email)
            recipient_email = valid.email
        except EmailNotValidError:
            print(f"❌ Invalid email address: {recipient_email}")
            return False
        
        # Create message
        msg = MIMEMultipart()
        msg['From'] = f"{EMAIL_CONFIG['sender_name']} <{EMAIL_CONFIG['sender_email']}>"
        msg['To'] = recipient_email
        msg['Subject'] = f"Daily Portfolio Report - {datetime.now().strftime('%B %d, %Y')}"
        
        # Email body
        body = f"""
Dear Investor,

Please find your daily portfolio report attached. This comprehensive analysis includes:

✅ Current portfolio performance
✅ Individual stock analysis  
✅ Profit/Loss breakdown
✅ Market insights and recommendations

Report generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

Best regards,
Stock Analysis Report Engine

---
This is an automated report. Please do not reply to this email.
"""
        
        msg.attach(MIMEText(body, 'plain'))
        
        # Attach HTML report if available
        if html_filename and os.path.exists(html_filename):
            try:
                with open(html_filename, 'rb') as attachment:
                    part = MIMEBase('text', 'html')
                    part.set_payload(attachment.read())
                    encoders.encode_base64(part)
                    part.add_header(
                        'Content-Disposition',
                        f'attachment; filename= portfolio_report.html'
                    )
                    msg.attach(part)
                    print(f"📎 HTML report attached: {html_filename}")
            except Exception as e:
                print(f"⚠️  Could not attach HTML file: {e}")
        
        # Attach text report if available  
        if report_filename and os.path.exists(report_filename):
            try:
                with open(report_filename, 'rb') as attachment:
                    part = MIMEBase('text', 'plain')
                    part.set_payload(attachment.read())
                    encoders.encode_base64(part)
                    part.add_header(
                        'Content-Disposition',
                        f'attachment; filename= portfolio_report.txt'
                    )
                    msg.attach(part)
                    print(f"📎 Text report attached: {report_filename}")
            except Exception as e:
                print(f"⚠️  Could not attach text file: {e}")
        
        # If no files, include report content in email body
        if not html_filename and not report_filename and report_content:
            report_part = MIMEText(f"\n\n=== PORTFOLIO REPORT ===\n{report_content}", 'plain')
            msg.attach(report_part)
        
        # Send email
        server = smtplib.SMTP(EMAIL_CONFIG['smtp_server'], EMAIL_CONFIG['smtp_port'])
        server.starttls()
        server.login(EMAIL_CONFIG['sender_email'], EMAIL_CONFIG['sender_password'])
        
        text = msg.as_string()
        server.sendmail(EMAIL_CONFIG['sender_email'], recipient_email, text)
        server.quit()
        
        print(f"✅ Email sent successfully to: {recipient_email}")
        return True
        
    except Exception as e:
        print(f"❌ Failed to send email to {recipient_email}: {e}")
        return False

def find_generated_reports(email, timestamp_str):
    """Find generated report files for a user"""
    reports_dir = Path('final_reports')
    html_files = list(reports_dir.glob(f"final_report_*{timestamp_str}*.html"))
    json_files = list(reports_dir.glob(f"report_state_*{timestamp_str}*.json"))
    
    html_file = html_files[0] if html_files else None
    json_file = json_files[0] if json_files else None
    
    return html_file, json_file

def connect_to_mongodb():
    """Connect to MongoDB and return database instance"""
    try:
        client = MongoClient(MONGODB_URI)
        db = client['stockanalysis']
        print("✅ Connected to MongoDB")
        return db
    except Exception as e:
        print(f"❌ MongoDB connection error: {e}")
        return None

def get_daily_subscribers(db):
    """Fetch all users with daily frequency subscription"""
    try:
        subscribers = db.subscriptions.find({"frequency": "daily", "status": "active"})
        subscribers_list = list(subscribers)
        print(f"📊 Found {len(subscribers_list)} daily subscribers")
        return subscribers_list
    except Exception as e:
        print(f"❌ Error fetching subscribers: {e}")
        return []

def analyze_portfolio(holdings):
    """Call the portfolio analysis API"""
    try:
        # Convert MongoDB holdings to API format
        api_holdings = []
        total_value = sum(holding.get('current_value', 0) for holding in holdings)
        
        for holding in holdings:
            current_value = holding.get('current_value', 0)
            weight = current_value / total_value if total_value > 0 else 0
            
            api_holdings.append({
                'symbol': holding['symbol'],
                'weight': round(weight, 4),
                'quantity': holding.get('quantity', 0),
                'avg_price': holding.get('avg_price', 0),
                'current_price': holding.get('current_price', 0),
                'profit_loss': holding.get('profit_loss', 0)
            })
        
        # Call portfolio analysis API
        response = requests.post(f"{SERVER_URL}/api/portfolio/analysis", 
                               json={
                                   "holdings": api_holdings,
                                   "analysis_type": "daily_report"
                               },
                               timeout=30)
        
        if response.status_code == 200:
            return response.json()
        else:
            print(f"❌ Portfolio analysis failed: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ Error analyzing portfolio: {e}")
        return None

def format_portfolio_for_report(subscriber, portfolio_analysis):
    """Format portfolio data and analysis for report generation"""
    portfolio = subscriber.get('portfolio', {})
    holdings = portfolio.get('holdings', [])
    
    # Calculate portfolio summary
    total_invested = sum(h.get('total_invested', 0) for h in holdings)
    current_value = sum(h.get('current_value', 0) for h in holdings)
    total_pnl = sum(h.get('profit_loss', 0) for h in holdings)
    pnl_percentage = (total_pnl / total_invested * 100) if total_invested > 0 else 0
    
    # Create mock reports based on portfolio analysis
    mock_reports = [
        {  # Portfolio Analysis
            "type": "portfolio",
            "summary": f"Portfolio of {len(holdings)} stocks with total value ₹{current_value:,.2f}. "
                      f"Overall P&L: ₹{total_pnl:,.2f} ({pnl_percentage:+.2f}%)",
            "key_points": [
                f"Total Investment: ₹{total_invested:,.2f}",
                f"Current Value: ₹{current_value:,.2f}",
                f"Profit/Loss: ₹{total_pnl:,.2f}",
                f"Number of Holdings: {len(holdings)}"
            ]
        },
        {  # Individual Holdings Analysis
            "type": "holdings",
            "summary": "Top performers: " + ", ".join([
                f"{h['name']} (+₹{h.get('profit_loss', 0):.2f})" 
                for h in sorted(holdings, key=lambda x: x.get('profit_loss', 0), reverse=True)[:3]
            ]),
            "holdings_breakdown": [
                {
                    "symbol": h['symbol'],
                    "name": h['name'],
                    "quantity": h.get('quantity', 0),
                    "avg_price": h.get('avg_price', 0),
                    "current_price": h.get('current_price', 0),
                    "pnl": h.get('profit_loss', 0),
                    "pnl_percentage": ((h.get('current_price', 0) - h.get('avg_price', 0)) / h.get('avg_price', 1) * 100)
                }
                for h in holdings
            ]
        },
        {  # AI Analysis from Server
            "type": "ai_analysis",
            "summary": portfolio_analysis.get('portfolio_analysis', 'No AI analysis available') if portfolio_analysis else 'Portfolio analysis unavailable',
            "bias_score": portfolio_analysis.get('portfolio_bias_score', {}) if portfolio_analysis else {},
            "market_breakdown": portfolio_analysis.get('market_breakdown', {}) if portfolio_analysis else {}
        }
    ]
    
    return mock_reports

def generate_daily_reports():
    """Main function to generate daily reports for all subscribers"""
    print("🚀 Starting Daily Report Generation...")
    
    # Connect to MongoDB
    db = connect_to_mongodb()
    if db is None:
        return
    
    # Get daily subscribers
    daily_subscribers = get_daily_subscribers(db)
    if not daily_subscribers:
        print("📭 No daily subscribers found")
        return
    
    # Initialize Report Agent
    print("📝 Initializing ReportAgent...")
    agent = ReportAgent(config=Settings())
    
    # Process each subscriber
    for i, subscriber in enumerate(daily_subscribers, 1):
        try:
            email = subscriber.get('email', 'unknown')
            print(f"\n📊 Processing subscriber {i}/{len(daily_subscribers)}: {email}")
            
            portfolio = subscriber.get('portfolio', {})
            holdings = portfolio.get('holdings', [])
            
            if not holdings:
                print(f"⚠️  No holdings found for {email}, skipping...")
                continue
            
            # Analyze portfolio
            print("🔍 Analyzing portfolio...")
            portfolio_analysis = analyze_portfolio(holdings)
            
            print("✅ Portfolio analysis completed", portfolio_analysis)
            # Format data for report
            mock_reports = format_portfolio_for_report(subscriber, portfolio_analysis)
            
            # Create mock forum logs
            mock_forum_logs = f"""
[ForumHost]: Daily portfolio report for {email} - {datetime.now().strftime('%Y-%m-%d')}
[PortfolioAgent]: Analyzed {len(holdings)} holdings with total value ₹{sum(h.get('current_value', 0) for h in holdings):,.2f}
[RiskAgent]: Portfolio shows {'positive' if sum(h.get('profit_loss', 0) for h in holdings) > 0 else 'negative'} performance
[RecommendationAgent]: Focus on {'profit booking' if sum(h.get('profit_loss', 0) for h in holdings) > 1000 else 'holding position'}
"""
            
            # Generate query for report
            total_pnl = sum(h.get('profit_loss', 0) for h in holdings)
            query = f"Generate a comprehensive daily portfolio report for {email}'s investment portfolio showing current performance, profit/loss analysis, and recommendations. Total P&L: ₹{total_pnl:,.2f}"
            
            # Generate report
            print("📝 Generating report...")
            report_timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            
            report = agent.generate_report(
                query=query,
                reports=mock_reports,
                forum_logs=mock_forum_logs,
                save_report=True
            )
            
            print(f"✅ Report generated for {email}")
            print(f"📄 Report preview (first 200 chars):\n{report[:200]}...")
            
            # Save individual text report
            report_filename = f"reports/daily_report_{email.replace('@', '_at_').replace('.', '_')}_{report_timestamp}.txt"
            os.makedirs('reports', exist_ok=True)
            with open(report_filename, 'w', encoding='utf-8') as f:
                f.write(f"Daily Portfolio Report for {email}\n")
                f.write(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write("="*50 + "\n\n")
                f.write(report)
            
            print(f"💾 Report saved to: {report_filename}")
            
            # Find generated HTML report in final_reports folder
            html_file, json_file = find_generated_reports(email, report_timestamp)
            
            # If no specific timestamp match, get the latest report
            if not html_file:
                reports_dir = Path('final_reports')
                html_files = list(reports_dir.glob("final_report_*.html"))
                if html_files:
                    html_file = max(html_files, key=os.path.getctime)  # Get most recent
                    print(f"📁 Using latest HTML report: {html_file}")
            
            # Send email with report
            print(f"📧 Sending email to {email}...")
            email_sent = send_email_with_report(
                recipient_email=email,
                report_content=report,
                report_filename=report_filename,
                html_filename=str(html_file) if html_file else None
            )
            
            if email_sent:
                print(f"✉️  Email successfully sent to {email}")
                
                # Update subscription status to indicate report was sent
                try:
                    db.subscriptions.update_one(
                        {"email": email},
                        {
                            "$set": {
                                "last_report_sent": datetime.now().isoformat(),
                                "reports_sent_count": 1
                            },
                            "$inc": {"total_reports_sent": 1}
                        }
                    )
                except Exception as e:
                    print(f"⚠️  Could not update subscription status: {e}")
            else:
                print(f"❌ Failed to send email to {email}")
            
        except Exception as e:
            print(f"❌ Error processing subscriber {email}: {e}")
            import traceback
            traceback.print_exc()
            continue
    
    print(f"\n🎉 Daily report generation completed for {len(daily_subscribers)} subscribers!")

if __name__ == "__main__":
    generate_daily_reports()