import io
import json
import logging
import os
import time
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import redis
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
from reportlab.platypus.flowables import KeepTogether
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Report Generator Service", version="1.0.0")

# Redis connection
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

class ReportRequest(BaseModel):
    upload_id: str
    include_heatmap: bool = True
    include_metadata: bool = True
    include_detector_results: bool = True
    include_risk_assessment: bool = True
    format: str = "pdf"  # pdf or html

class ReportResponse(BaseModel):
    report_id: str
    upload_id: str
    format: str
    generated_at: str
    file_size: int
    download_url: str

class HealthResponse(BaseModel):
    status: str
    timestamp: float
    version: str

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        timestamp=time.time(),
        version="1.0.0"
    )

def create_risk_chart(risk_score: float, risk_level: str) -> bytes:
    """Create a risk assessment chart"""
    plt.figure(figsize=(8, 6))
    
    # Create a gauge-like chart
    categories = ['Low', 'Medium', 'High', 'Critical']
    colors_list = ['green', 'yellow', 'orange', 'red']
    
    # Map risk score to category index
    if risk_level == 'Low':
        category_idx = 0
    elif risk_level == 'Medium':
        category_idx = 1
    elif risk_level == 'High':
        category_idx = 2
    else:  # Critical
        category_idx = 3
    
    # Create bar chart
    bars = plt.bar(categories, [0.25, 0.25, 0.25, 0.25], color=colors_list, alpha=0.3)
    bars[category_idx].set_alpha(1.0)
    bars[category_idx].set_height(0.5)
    
    plt.title(f'Risk Assessment: {risk_level} ({risk_score:.2f})', fontsize=16, fontweight='bold')
    plt.ylabel('Risk Level', fontsize=12)
    plt.ylim(0, 0.6)
    
    # Add risk score text
    plt.text(category_idx, 0.4, f'{risk_score:.2f}', ha='center', va='center', 
             fontsize=14, fontweight='bold')
    
    plt.tight_layout()
    
    # Save to bytes
    img_buffer = io.BytesIO()
    plt.savefig(img_buffer, format='png', dpi=150, bbox_inches='tight')
    img_buffer.seek(0)
    plt.close()
    
    return img_buffer.getvalue()

def create_detector_comparison_chart(detector_results: Dict) -> bytes:
    """Create a chart comparing detector results"""
    if not detector_results:
        return None
    
    plt.figure(figsize=(10, 6))
    
    detectors = []
    scores = []
    colors_list = []
    
    for detector_name, result in detector_results.items():
        detectors.append(detector_name.replace('_', ' ').title())
        scores.append(result.get('score', 0.0))
        
        # Color based on score
        score = result.get('score', 0.0)
        if score < 0.3:
            colors_list.append('green')
        elif score < 0.6:
            colors_list.append('yellow')
        else:
            colors_list.append('red')
    
    bars = plt.bar(detectors, scores, color=colors_list, alpha=0.7)
    
    # Add value labels on bars
    for bar, score in zip(bars, scores):
        plt.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.01,
                f'{score:.2f}', ha='center', va='bottom', fontweight='bold')
    
    plt.title('Detector Analysis Results', fontsize=16, fontweight='bold')
    plt.ylabel('Suspicion Score', fontsize=12)
    plt.xlabel('Detectors', fontsize=12)
    plt.xticks(rotation=45, ha='right')
    plt.ylim(0, 1.1)
    plt.grid(axis='y', alpha=0.3)
    plt.tight_layout()
    
    # Save to bytes
    img_buffer = io.BytesIO()
    plt.savefig(img_buffer, format='png', dpi=150, bbox_inches='tight')
    img_buffer.seek(0)
    plt.close()
    
    return img_buffer.getvalue()

def generate_pdf_report(
    upload_id: str,
    detector_results: Dict,
    risk_assessment: Dict,
    ocr_result: Dict,
    metadata: Dict,
    include_heatmap: bool = True
) -> bytes:
    """Generate PDF forensic report"""
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        spaceAfter=30,
        alignment=1,  # Center alignment
        textColor=colors.HexColor('#2E86AB')
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        spaceAfter=12,
        textColor=colors.HexColor('#A23B72')
    )
    
    story = []
    
    # Title page
    story.append(Spacer(1, 0.5*inch))
    story.append(Paragraph("AuthCorp Digital Forensics Report", title_style))
    story.append(Spacer(1, 0.3*inch))
    story.append(Paragraph(f"Analysis ID: {upload_id}", styles['Normal']))
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
    story.append(Spacer(1, 0.5*inch))
    
    # Executive Summary
    story.append(Paragraph("Executive Summary", heading_style))
    
    if risk_assessment:
        risk_score = risk_assessment.get('overall_risk_score', 0.0)
        risk_level = risk_assessment.get('risk_level', 'Unknown')
        
        summary_text = f"""
        This document presents the findings of a comprehensive forensic analysis conducted on digital evidence.
        Based on the analysis of multiple detection algorithms and risk assessment models, the evidence has been
        classified as <b>{risk_level}</b> risk with a confidence score of {risk_score:.2f}.
        """
        story.append(Paragraph(summary_text, styles['Normal']))
        story.append(Spacer(1, 0.2*inch))
    
    # Risk Assessment Section
    story.append(Paragraph("Risk Assessment", heading_style))
    
    if risk_assessment:
        # Add risk chart
        risk_chart = create_risk_chart(
            risk_assessment.get('overall_risk_score', 0.0),
            risk_assessment.get('risk_level', 'Unknown')
        )
        
        if risk_chart:
            story.append(Image(io.BytesIO(risk_chart), width=6*inch, height=4*inch))
            story.append(Spacer(1, 0.2*inch))
        
        # Risk factors
        factors = risk_assessment.get('factors', [])
        if factors:
            story.append(Paragraph("Identified Risk Factors:", styles['Heading3']))
            for factor in factors[:5]:  # Limit to top 5 factors
                factor_text = f"• <b>{factor.get('factor_type', 'Unknown')}</b>: {factor.get('description', 'No description')} (Severity: {factor.get('severity', 0.0):.2f})"
                story.append(Paragraph(factor_text, styles['Normal']))
            story.append(Spacer(1, 0.2*inch))
        
        # Recommendations
        recommendations = risk_assessment.get('recommendations', [])
        if recommendations:
            story.append(Paragraph("Recommendations:", styles['Heading3']))
            for rec in recommendations[:3]:  # Limit to top 3 recommendations
                story.append(Paragraph(f"• {rec}", styles['Normal']))
            story.append(Spacer(1, 0.2*inch))
    
    # Detector Analysis Section
    story.append(Paragraph("Detector Analysis", heading_style))
    
    if detector_results:
        # Add detector comparison chart
        detector_chart = create_detector_comparison_chart(detector_results)
        if detector_chart:
            story.append(Image(io.BytesIO(detector_chart), width=6*inch, height=3.5*inch))
            story.append(Spacer(1, 0.2*inch))
        
        # Detailed detector results
        for detector_name, result in detector_results.items():
            detector_title = detector_name.replace('_', ' ').title()
            story.append(Paragraph(f"{detector_title}:", styles['Heading3']))
            
            score = result.get('score', 0.0)
            story.append(Paragraph(f"Suspicion Score: {score:.3f}", styles['Normal']))
            
            if 'suspicious_regions' in result and result['suspicious_regions']:
                story.append(Paragraph(f"Suspicious Regions Found: {len(result['suspicious_regions'])}", styles['Normal']))
            
            story.append(Spacer(1, 0.1*inch))
    
    # OCR Analysis Section
    if ocr_result:
        story.append(Paragraph("Text Extraction Analysis", heading_style))
        
        text_content = ocr_result.get('text_content', '')
        entities = ocr_result.get('entities', [])
        pii_detected = ocr_result.get('pii_detected', False)
        
        story.append(Paragraph(f"Text Extracted: {len(text_content)} characters", styles['Normal']))
        story.append(Paragraph(f"PII Detected: {'Yes' if pii_detected else 'No'}", styles['Normal']))
        
        if entities:
            pii_entities = [e for e in entities if e.get('redacted', False)]
            story.append(Paragraph(f"PII Entities Found: {len(pii_entities)}", styles['Normal']))
            
            # Show entity summary
            entity_summary = {}
            for entity in pii_entities:
                entity_type = entity.get('entity_type', 'Unknown')
                entity_summary[entity_type] = entity_summary.get(entity_type, 0) + 1
            
            if entity_summary:
                story.append(Paragraph("Entity Breakdown:", styles['Heading4']))
                for entity_type, count in entity_summary.items():
                    story.append(Paragraph(f"• {entity_type}: {count}", styles['Normal']))
        
        story.append(Spacer(1, 0.2*inch))
    
    # Metadata Section
    if metadata:
        story.append(Paragraph("File Metadata", heading_style))
        
        # File hashes
        hashes = metadata.get('hashes', {})
        if hashes:
            story.append(Paragraph("File Hashes:", styles['Heading3']))
            hash_data = [['Hash Type', 'Value']]
            for hash_type, hash_value in hashes.items():
                hash_data.append([hash_type.upper(), hash_value])
            
            hash_table = Table(hash_data)
            hash_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            story.append(hash_table)
            story.append(Spacer(1, 0.2*inch))
        
        # File type information
        file_type = metadata.get('file_type', {})
        if file_type:
            story.append(Paragraph("File Type Analysis:", styles['Heading3']))
            story.append(Paragraph(f"Detected Type: {file_type.get('file_type', 'Unknown')}", styles['Normal']))
            story.append(Paragraph(f"MIME Type: {file_type.get('mime_type', 'Unknown')}", styles['Normal']))
            story.append(Spacer(1, 0.1*inch))
    
    # Footer
    story.append(Spacer(1, 0.5*inch))
    story.append(Paragraph("This report was generated automatically by the AuthCorp Digital Forensics Platform.", styles['Normal']))
    story.append(Paragraph("For questions or appeals, please contact the forensic analysis team.", styles['Normal']))
    
    # Build PDF
    doc.build(story)
    
    # Get PDF bytes
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes

def generate_html_report(
    upload_id: str,
    detector_results: Dict,
    risk_assessment: Dict,
    ocr_result: Dict,
    metadata: Dict
) -> str:
    """Generate HTML forensic report"""
    
    html_template = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AuthCorp Digital Forensics Report - {{ upload_id }}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; color: #333; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }
            .section { margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
            .risk-low { background-color: #d4edda; border-color: #c3e6cb; }
            .risk-medium { background-color: #fff3cd; border-color: #ffeaa7; }
            .risk-high { background-color: #f8d7da; border-color: #f5c6cb; }
            .risk-critical { background-color: #721c24; color: white; border-color: #f5c6cb; }
            .detector-result { margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 5px; }
            .metadata-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .metadata-table th, .metadata-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .metadata-table th { background-color: #f2f2f2; }
            .entity { background: #e3f2fd; padding: 5px; margin: 5px; border-radius: 3px; display: inline-block; }
            .footer { margin-top: 50px; padding: 20px; background: #f8f9fa; border-radius: 5px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>AuthCorp Digital Forensics Report</h1>
            <p><strong>Analysis ID:</strong> {{ upload_id }}</p>
            <p><strong>Generated:</strong> {{ timestamp }}</p>
        </div>
        
        <div class="section">
            <h2>Executive Summary</h2>
            {% if risk_assessment %}
            <div class="risk-{{ risk_assessment.risk_level|lower }}">
                <h3>Risk Assessment: {{ risk_assessment.risk_level }}</h3>
                <p><strong>Overall Risk Score:</strong> {{ "%.2f"|format(risk_assessment.overall_risk_score) }}</p>
                
                {% if risk_assessment.factors %}
                <h4>Risk Factors:</h4>
                <ul>
                {% for factor in risk_assessment.factors[:5] %}
                    <li><strong>{{ factor.factor_type }}:</strong> {{ factor.description }} (Severity: {{ "%.2f"|format(factor.severity) }})</li>
                {% endfor %}
                </ul>
                {% endif %}
                
                {% if risk_assessment.recommendations %}
                <h4>Recommendations:</h4>
                <ul>
                {% for rec in risk_assessment.recommendations[:3] %}
                    <li>{{ rec }}</li>
                {% endfor %}
                </ul>
                {% endif %}
            </div>
            {% endif %}
        </div>
        
        <div class="section">
            <h2>Detector Analysis</h2>
            {% if detector_results %}
                {% for detector_name, result in detector_results.items() %}
                <div class="detector-result">
                    <h3>{{ detector_name.replace('_', ' ').title() }}</h3>
                    <p><strong>Suspicion Score:</strong> {{ "%.3f"|format(result.score) }}</p>
                    {% if result.suspicious_regions %}
                    <p><strong>Suspicious Regions:</strong> {{ result.suspicious_regions|length }}</p>
                    {% endif %}
                </div>
                {% endfor %}
            {% endif %}
        </div>
        
        {% if ocr_result %}
        <div class="section">
            <h2>Text Extraction Analysis</h2>
            <p><strong>Text Length:</strong> {{ ocr_result.text_content|length }} characters</p>
            <p><strong>PII Detected:</strong> {{ "Yes" if ocr_result.pii_detected else "No" }}</p>
            
            {% if ocr_result.entities %}
            <h4>Extracted Entities:</h4>
            {% for entity in ocr_result.entities %}
                {% if entity.redacted %}
                <span class="entity">{{ entity.entity_type }}: [REDACTED]</span>
                {% endif %}
            {% endfor %}
            {% endif %}
        </div>
        {% endif %}
        
        {% if metadata %}
        <div class="section">
            <h2>File Metadata</h2>
            
            {% if metadata.hashes %}
            <h4>File Hashes</h4>
            <table class="metadata-table">
                <tr><th>Hash Type</th><th>Value</th></tr>
                {% for hash_type, hash_value in metadata.hashes.items() %}
                <tr><td>{{ hash_type|upper }}</td><td>{{ hash_value }}</td></tr>
                {% endfor %}
            </table>
            {% endif %}
            
            {% if metadata.file_type %}
            <h4>File Type Analysis</h4>
            <p><strong>Detected Type:</strong> {{ metadata.file_type.file_type }}</p>
            <p><strong>MIME Type:</strong> {{ metadata.file_type.mime_type }}</p>
            {% endif %}
        </div>
        {% endif %}
        
        <div class="footer">
            <p>This report was generated automatically by the AuthCorp Digital Forensics Platform.</p>
            <p>For questions or appeals, please contact the forensic analysis team.</p>
        </div>
    </body>
    </html>
    """
    
    from jinja2 import Template
    
    template = Template(html_template)
    html_content = template.render(
        upload_id=upload_id,
        timestamp=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        detector_results=detector_results,
        risk_assessment=risk_assessment,
        ocr_result=ocr_result,
        metadata=metadata
    )
    
    return html_content

@app.post("/generate", response_model=ReportResponse)
async def generate_report(request: ReportRequest):
    """Generate forensic report in requested format"""
    
    try:
        start_time = time.time()
        report_id = f"report_{request.upload_id}_{int(start_time)}"
        
        # Gather data from various services
        detector_results = {}
        risk_assessment = {}
        ocr_result = {}
        metadata = {}
        
        # Get detector results from Redis
        if request.include_detector_results:
            detector_keys = redis_client.keys(f"*:{request.upload_id}*")
            for key in detector_keys:
                if 'ela' in key or 'quantization' in key or 'metadata' in key or 'ocr' in key:
                    cached_result = redis_client.get(key)
                    if cached_result:
                        try:
                            result_data = json.loads(cached_result)
                            if 'ela' in key:
                                detector_results['ela'] = result_data
                            elif 'quantization' in key:
                                detector_results['quantization'] = result_data
                            elif 'metadata' in key:
                                detector_results['metadata'] = result_data
                                metadata = result_data.get('metadata', {})
                            elif 'ocr' in key:
                                ocr_result = result_data
                        except:
                            pass
        
        # Get risk assessment
        if request.include_risk_assessment:
            risk_key = f"risk:{request.upload_id}"
            cached_risk = redis_client.get(risk_key)
            if cached_risk:
                try:
                    risk_assessment = json.loads(cached_risk)
                except:
                    pass
        
        # Generate report based on format
        if request.format.lower() == 'pdf':
            report_content = generate_pdf_report(
                request.upload_id,
                detector_results,
                risk_assessment,
                ocr_result,
                metadata,
                request.include_heatmap
            )
            content_type = "application/pdf"
            filename = f"authcorp_report_{request.upload_id}.pdf"
        else:  # HTML
            report_content = generate_html_report(
                request.upload_id,
                detector_results,
                risk_assessment,
                ocr_result,
                metadata
            )
            content_type = "text/html"
            filename = f"authcorp_report_{request.upload_id}.html"
        
        # Store report in Redis
        redis_client.setex(
            f"report:{report_id}",
            7200,  # 2 hours TTL
            report_content
        )
        
        # Create response
        response = ReportResponse(
            report_id=report_id,
            upload_id=request.upload_id,
            format=request.format.lower(),
            generated_at=datetime.now().isoformat(),
            file_size=len(report_content),
            download_url=f"/api/v1/reports/download/{report_id}"
        )
        
        logger.info(f"Report generated: {report_id} ({request.format}) for upload {request.upload_id}")
        return response
        
    except Exception as e:
        logger.error(f"Report generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")

@app.get("/download/{report_id}")
async def download_report(report_id: str):
    """Download generated report"""
    
    cached_report = redis_client.get(f"report:{report_id}")
    if not cached_report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Determine content type based on report content
    if cached_report.startswith(b'%PDF'):
        content_type = "application/pdf"
        filename = f"authcorp_report_{report_id}.pdf"
    else:
        content_type = "text/html"
        filename = f"authcorp_report_{report_id}.html"
    
    return Response(
        content=cached_report,
        media_type=content_type,
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )

@app.get("/status/{report_id}")
async def get_report_status(report_id: str):
    """Get report generation status"""
    
    cached_report = redis_client.get(f"report:{report_id}")
    if not cached_report:
        return {"status": "not_found", "report_id": report_id}
    
    return {
        "status": "ready",
        "report_id": report_id,
        "file_size": len(cached_report),
        "download_url": f"/api/v1/reports/download/{report_id}"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)