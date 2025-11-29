# Simple test script to send reports without full ReportEngine
import os
import sys
import json
import requests
import smtplib
from pathlib import Path
from datetime import datetime
from pymongo import MongoClient
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from email_validator import validate_email, EmailNotValidError

# Email configuration - UPDATE THESE VALUES
EMAIL_CONFIG = {
    'smtp_server': 'smtp.gmail.com',
    'smtp_port': 587,
    'sender_email': 'darshanjain15062002@gmail.com',  # Your email
    'sender_password': 'your_app_password',   # Your Gmail app password
    'sender_name': 'Stock Analysis Report Engine'
}

# MongoDB connection
MONGODB_URI = 'mongodb+srv://darshan:$$dar$$123@cluster0.ohxhu.mongodb.net/'
SERVER_URL = 'http://localhost:3000'

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

def generate_simple_report(subscriber):
    """Generate a simple text report for a subscriber"""
    portfolio = subscriber.get('portfolio', {})
    holdings = portfolio.get('holdings', [])
    email = subscriber.get('email', 'unknown')
    
    # Calculate portfolio summary
    total_invested = sum(h.get('total_invested', 0) for h in holdings)
    current_value = sum(h.get('current_value', 0) for h in holdings)
    total_pnl = sum(h.get('profit_loss', 0) for h in holdings)
    pnl_percentage = (total_pnl / total_invested * 100) if total_invested > 0 else 0
    
    # Generate report content
    report = f"""
DAILY PORTFOLIO REPORT
======================

Investor: {email}
Report Date: {datetime.now().strftime('%B %d, %Y')}
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

PORTFOLIO SUMMARY
================
Total Investment: ₹{total_invested:,.2f}
Current Value: ₹{current_value:,.2f}
Total P&L: ₹{total_pnl:,.2f} ({pnl_percentage:+.2f}%)
Number of Holdings: {len(holdings)}

INDIVIDUAL HOLDINGS
===================
"""
    
    for i, holding in enumerate(holdings, 1):
        pnl_pct = ((holding.get('current_price', 0) - holding.get('avg_price', 0)) / holding.get('avg_price', 1) * 100)
        report += f"""
{i}. {holding.get('name', holding.get('symbol', 'Unknown'))}
   Symbol: {holding.get('symbol', 'N/A')}
   Quantity: {holding.get('quantity', 0)}
   Avg Price: ₹{holding.get('avg_price', 0):.2f}
   Current Price: ₹{holding.get('current_price', 0):.2f}
   Investment: ₹{holding.get('total_invested', 0):,.2f}
   Current Value: ₹{holding.get('current_value', 0):,.2f}
   P&L: ₹{holding.get('profit_loss', 0):,.2f} ({pnl_pct:+.2f}%)
"""
    
    # Add market insights
    report += f"""

MARKET INSIGHTS
===============
📈 Best Performer: {max(holdings, key=lambda x: x.get('profit_loss', 0))['name']} (+₹{max(h.get('profit_loss', 0) for h in holdings):.2f})
📉 Worst Performer: {min(holdings, key=lambda x: x.get('profit_loss', 0))['name']} (₹{min(h.get('profit_loss', 0) for h in holdings):.2f})

RECOMMENDATIONS
===============
"""
    
    if total_pnl > 1000:
        report += "✅ Portfolio showing strong performance. Consider partial profit booking.\n"
    elif total_pnl < -1000:
        report += "⚠️ Portfolio showing losses. Review and consider rebalancing.\n"
    else:
        report += "📊 Portfolio performance is stable. Continue monitoring.\n"
    
    if len(holdings) < 5:
        report += "📈 Consider diversifying with additional stocks for better risk management.\n"
    
    report += f"""
NEXT STEPS
==========
1. Review individual stock performance
2. Monitor market news for your holdings
3. Consider rebalancing if needed
4. Next report will be sent tomorrow

---
This is an automated report from Stock Analysis Engine.
For questions, please contact support.
"""
    
    return report

def send_simple_email(recipient_email, report_content):
    """Send a simple email with the report"""
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
        msg['Subject'] = f"📊 Daily Portfolio Report - {datetime.now().strftime('%B %d, %Y')}"
        
        # Email body with HTML formatting
        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
                <h2 style="color: #007bff; text-align: center;">📊 Daily Portfolio Report</h2>
                <p>Dear Investor,</p>
                <p>Please find your daily portfolio analysis below:</p>
                <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px;">
{report_content}
                    </pre>
                </div>
                <p style="color: #666; font-size: 12px; text-align: center;">
                    This is an automated report. Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
                </p>
            </div>
        </body>
        </html>
        """
        
        msg.attach(MIMEText(html_body, 'html'))
        
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

def test_simple_reports():
    """Test function to generate and send simple reports"""
    print("🚀 Starting Simple Report Generation and Email Test...")
    
    # Connect to MongoDB
    db = connect_to_mongodb()
    if db is None:
        return
    
    # Get daily subscribers
    daily_subscribers = get_daily_subscribers(db)
    if not daily_subscribers:
        print("📭 No daily subscribers found")
        return
    
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
            
            # Generate simple report
            print("📝 Generating report...")
            report = generate_simple_report(subscriber)
            
            # Save report to file
            report_filename = f"simple_reports/daily_report_{email.replace('@', '_at_').replace('.', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
            os.makedirs('simple_reports', exist_ok=True)
            with open(report_filename, 'w', encoding='utf-8') as f:
                f.write(report)
            
            print(f"💾 Report saved to: {report_filename}")
            
            # Send email
            print(f"📧 Sending email to {email}...")
            email_sent = send_simple_email(email, report)
            
            if email_sent:
                print(f"✉️  Email successfully sent to {email}")
                
                # Update subscription status
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
                    print("✅ Subscription status updated")
                except Exception as e:
                    print(f"⚠️  Could not update subscription status: {e}")
            else:
                print(f"❌ Failed to send email to {email}")
                
        except Exception as e:
            print(f"❌ Error processing subscriber {email}: {e}")
            continue
    
    print(f"\n🎉 Report generation and email sending completed for {len(daily_subscribers)} subscribers!")

if __name__ == "__main__":
    print("⚠️  IMPORTANT: Update EMAIL_CONFIG with your Gmail credentials before running!")
    print("📧 Make sure to use an App Password, not your regular Gmail password.")
    print("🔗 Guide: https://support.google.com/accounts/answer/185833")
    print("\nContinuing with test...")
    test_simple_reports()