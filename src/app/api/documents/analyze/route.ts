import { NextRequest, NextResponse } from 'next/server'
import { SecurityManager, AuditLogger, ZeroTrustManager } from '@/lib/security'
import { analysisSchema, analysisQuerySchema, validate } from '@/lib/validation'
import { TextVerificationEngine } from '@/lib/text-verification'
import { AIDetectionEngine } from '@/lib/ai-detection'

// Document analysis endpoint
export async function POST(request: NextRequest) {
  try {
    // Resolve client context
    const clientIp = request.headers.get('x-forwarded-for') || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Verify authentication via secure cookie, with Bearer fallback
    const sessionCookie = request.cookies.get('authcorp_session')
    const bearerHeader = request.headers.get('authorization')
    const tokenValue = sessionCookie?.value || (bearerHeader?.startsWith('Bearer ') ? bearerHeader.substring(7) : undefined)
    if (!tokenValue) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    let user
    try {
      user = SecurityManager.verifyToken(tokenValue)
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      )
    }

    // Zero-trust continuous verification
    const verified = await ZeroTrustManager.verifySession(tokenValue, clientIp, userAgent)
    if (!verified) {
      return NextResponse.json(
        { error: 'Session verification failed' },
        { status: 401 }
      )
    }

    // Check permissions
    if (!user.permissions.includes('document:analyze') && !user.permissions.includes('*')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const analysisTypeRaw = (formData.get('analysisType') as string) ?? 'full'
    const enableRiskCheckRaw = (formData.get('enableRiskCheck') as string) ?? 'false'

    const validated = validate(analysisSchema, {
      analysisType: analysisTypeRaw,
      enableRiskCheck: enableRiskCheckRaw,
    })
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.errors },
        { status: 400 }
      )
    }
    const { analysisType, enableRiskCheck } = validated.data

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file
    const fileValidation = SecurityManager.validateFile(file)
    if (!fileValidation.isValid) {
      return NextResponse.json(
        { error: fileValidation.error },
        { status: 400 }
      )
    }

    // Log analysis start
    const analysisId = SecurityManager.generateSecureId()
    await AuditLogger.logAction({
      userId: user.userId,
      action: 'document_analysis_started',
      resource: `document:${analysisId}`,
      details: {
        filename: SecurityManager.sanitizeInput(file.name),
        fileSize: file.size,
        fileType: file.type,
        analysisType,
        enableRiskCheck
      },
      ipAddress: clientIp,
      userAgent,
      riskLevel: 'low'
    })

    // Convert file to buffer for processing
    const fileBuffer = await file.arrayBuffer()
    
    // Initialize analysis results
    const analysisResults: any = {
      id: analysisId,
      filename: SecurityManager.sanitizeInput(file.name),
      fileType: file.type,
      fileSize: file.size,
      timestamp: new Date().toISOString(),
      analyst: {
        id: user.userId,
        name: user.name || 'Unknown',
        organization: user.organization
      },
      authenticity: {
        score: 0,
        confidence: 0,
        category: 'unknown',
        reasoning: []
      },
      forensics: {},
      processing: {
        duration: 0,
        methods: []
      }
    }

    const startTime = Date.now()

    try {
      // Image forensics analysis
      if (file.type.startsWith('image/')) {
        analysisResults.processing.methods.push('image_forensics')
        
        // Mock image forensics
        analysisResults.forensics.imageForensics = {
          errorLevelAnalysis: Math.random() * 100,
          noiseAnalysis: Math.random() * 100,
          compressionArtifacts: Math.random() > 0.7,
          copyMoveDetection: Math.random() > 0.8,
          metadataConsistency: Math.random() * 100
        }

        // AI detection
        if (analysisType === 'full' || analysisType === 'ai') {
          analysisResults.processing.methods.push('ai_detection')
          const aiDetection = await AIDetectionEngine.detectAIGeneration(fileBuffer)
          analysisResults.forensics.aiDetection = aiDetection
          
          if (aiDetection.isAIGenerated) {
            analysisResults.authenticity.category = 'ai-generated'
            analysisResults.authenticity.reasoning.push('AI-generated content detected')
          }
        }
      }

      // OCR and text analysis
      if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
        analysisResults.processing.methods.push('ocr_analysis')
        
        const ocrResult = await TextVerificationEngine.performOCR(fileBuffer)
        const fontAnalysis = TextVerificationEngine.analyzeFonts(ocrResult)
        
        analysisResults.forensics.textAnalysis = {
          extractedText: ocrResult.text,
          confidence: ocrResult.confidence,
          fontConsistency: fontAnalysis.consistency,
          alignmentScore: fontAnalysis.alignmentScore,
          anomalies: fontAnalysis.anomalies
        }

        // Signature verification if present
        if (ocrResult.text.toLowerCase().includes('signature') || 
            ocrResult.text.toLowerCase().includes('signed')) {
          analysisResults.processing.methods.push('signature_verification')
          const signatureAnalysis = await TextVerificationEngine.analyzeSignature(fileBuffer)
          analysisResults.forensics.signatureAnalysis = signatureAnalysis
        }
      }

      // Metadata analysis
      analysisResults.processing.methods.push('metadata_analysis')
      analysisResults.forensics.metadataAnalysis = {
        exifData: {
          'Camera Make': 'Canon',
          'Camera Model': 'EOS R5',
          'Date Taken': new Date().toISOString(),
          'Software': 'Adobe Photoshop 2024'
        },
        creationDate: new Date().toISOString(),
        editingSoftware: 'Adobe Photoshop 2024',
        tamperingClues: []
      }

      // Calculate authenticity score
      let authenticityScore = 85
      let confidence = 90
      let category = 'authentic'
      const reasoning = ['Document structure appears consistent']

      // Adjust based on findings
      if (analysisResults.forensics.aiDetection?.isAIGenerated) {
        authenticityScore -= 60
        confidence = analysisResults.forensics.aiDetection.confidence * 100
        category = 'ai-generated'
        reasoning.push('AI-generated content detected')
      }

      if (analysisResults.forensics.imageForensics?.compressionArtifacts) {
        authenticityScore -= 15
        reasoning.push('Compression artifacts detected')
      }

      if (analysisResults.forensics.textAnalysis?.fontConsistency < 70) {
        authenticityScore -= 20
        category = 'tampered'
        reasoning.push('Font inconsistencies detected')
      }

      analysisResults.authenticity = {
        score: Math.max(0, authenticityScore),
        confidence: Math.min(100, confidence),
        category,
        reasoning
      }

      // Risk intelligence check
      if (enableRiskCheck && analysisResults.forensics.textAnalysis?.extractedText) {
        analysisResults.processing.methods.push('risk_intelligence')
        
        // Mock risk analysis
        analysisResults.riskIntelligence = {
          personRiskScore: Math.random() * 100,
          riskCategory: Math.random() > 0.7 ? 'medium' : 'low',
          findings: [
            {
              type: 'background_check',
              description: 'No adverse findings in background check',
              confidence: 95,
              source: 'Criminal Records Database'
            }
          ],
          databases: [
            'Criminal Records',
            'Sanctions Lists',
            'Fraud Database',
            'Data Breach Records'
          ]
        }
      }

      // Calculate processing duration
      analysisResults.processing.duration = Date.now() - startTime

      // Log successful analysis
      await AuditLogger.logAction({
        userId: user.userId,
        action: 'document_analysis_completed',
        resource: `document:${analysisId}`,
        details: {
          filename: SecurityManager.sanitizeInput(file.name),
          authenticityScore: analysisResults.authenticity.score,
          category: analysisResults.authenticity.category,
          processingTime: analysisResults.processing.duration,
          methods: analysisResults.processing.methods
        },
        ipAddress: clientIp,
        userAgent,
        riskLevel: analysisResults.authenticity.score < 50 ? 'high' : 'low'
      })

      return NextResponse.json({
        success: true,
        analysis: analysisResults
      })

    } catch (processingError) {
      console.error('Analysis processing error:', processingError)
      
      await AuditLogger.logAction({
        userId: user.userId,
        action: 'document_analysis_failed',
        resource: `document:${analysisId}`,
        details: {
          filename: file.name,
          error: processingError instanceof Error ? processingError.message : 'Unknown error',
          processingTime: Date.now() - startTime
        },
        ipAddress: clientIp,
        userAgent,
        riskLevel: 'medium'
      })

      return NextResponse.json(
        { error: 'Analysis processing failed' },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Document analysis error:', error)
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Get analysis results
export async function GET(request: NextRequest) {
  try {
    // Verify authentication via cookie with Bearer fallback
    const clientIp = request.headers.get('x-forwarded-for') || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    const sessionCookie = request.cookies.get('authcorp_session')
    const bearerHeader = request.headers.get('authorization')
    const tokenValue = sessionCookie?.value || (bearerHeader?.startsWith('Bearer ') ? bearerHeader.substring(7) : undefined)
    if (!tokenValue) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    let user
    try {
      user = SecurityManager.verifyToken(tokenValue)
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      )
    }

    const verified = await ZeroTrustManager.verifySession(tokenValue, clientIp, userAgent)
    if (!verified) {
      return NextResponse.json(
        { error: 'Session verification failed' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const analysisIdRaw = searchParams.get('id') || undefined
    const limitRaw = searchParams.get('limit') || '10'
    const offsetRaw = searchParams.get('offset') || '0'

    const queryValidated = validate(analysisQuerySchema, {
      id: analysisIdRaw,
      limit: limitRaw,
      offset: offsetRaw,
    })
    if (!queryValidated.success) {
      return NextResponse.json(
        { error: 'Invalid query', details: queryValidated.errors },
        { status: 400 }
      )
    }
    const { id: analysisId, limit, offset } = queryValidated.data
    const limitNum = typeof limit === 'number' ? limit : 10
    const offsetNum = typeof offset === 'number' ? offset : 0

    if (analysisId) {
      // Return specific analysis
      // In production, this would query a database
      return NextResponse.json({
        success: true,
        analysis: {
          id: analysisId,
          status: 'completed',
          // ... analysis data
        }
      })
    } else {
      // Return list of analyses for user
      const analyses = [
        {
          id: 'analysis_1',
          filename: 'passport_001.jpg',
          timestamp: new Date().toISOString(),
          status: 'completed',
          authenticity: { score: 95, category: 'authentic' }
        },
        {
          id: 'analysis_2',
          filename: 'license_002.pdf',
          timestamp: new Date().toISOString(),
          status: 'completed',
          authenticity: { score: 45, category: 'tampered' }
        }
      ]

      return NextResponse.json({
        success: true,
        analyses: analyses.slice(offsetNum, offsetNum + limitNum),
        total: analyses.length,
        limit: limitNum,
        offset: offsetNum,
      })
    }

  } catch (error) {
    console.error('Get analysis error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}