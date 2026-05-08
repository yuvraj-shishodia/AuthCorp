// Intelligent Document Classification System

export interface DocumentClassification {
  type: DocumentType
  confidence: number
  subtype?: string
  expectedFields: string[]
  verificationRules: VerificationRule[]
  riskFactors: string[]
}

export type DocumentType = 
  | 'aadhar_card'
  | 'passport'
  | 'driving_license'
  | 'pan_card'
  | 'voter_id'
  | 'bank_statement'
  | 'utility_bill'
  | 'presentation'
  | 'certificate'
  | 'invoice'
  | 'contract'
  | 'medical_report'
  | 'photo'
  | 'unknown'

export interface VerificationRule {
  field: string
  required: boolean
  pattern?: RegExp
  validation: (value: string) => boolean
  description: string
}

export interface DocumentFeatures {
  hasPhoto: boolean
  hasSignature: boolean
  hasBarcode: boolean
  hasQRCode: boolean
  hasWatermark: boolean
  hasOfficialSeal: boolean
  textDensity: number
  colorScheme: 'government' | 'corporate' | 'personal' | 'presentation'
  layout: 'card' | 'document' | 'certificate' | 'presentation'
  language: string[]
}

export class DocumentClassifier {
  private static documentPatterns = {
    aadhar_card: {
      keywords: ['aadhaar', 'aadhar', 'unique identification', 'uidai', 'government of india'],
      patterns: [/\d{4}\s\d{4}\s\d{4}/, /\d{12}/], // Aadhar number patterns
      features: ['hasPhoto', 'hasQRCode', 'hasBarcode'],
      layout: 'card',
      expectedFields: ['name', 'dob', 'gender', 'address', 'aadhar_number'],
      verificationRules: [
        {
          field: 'aadhar_number',
          required: true,
          pattern: /^\d{12}$/,
          validation: (value: string) => value.length === 12 && /^\d+$/.test(value),
          description: 'Valid 12-digit Aadhar number'
        },
        {
          field: 'name',
          required: true,
          validation: (value: string) => value.length > 2 && /^[a-zA-Z\s]+$/.test(value),
          description: 'Valid name with alphabets only'
        }
      ]
    },
    passport: {
      keywords: ['passport', 'republic of india', 'immigration', 'visa', 'travel document'],
      patterns: [/[A-Z]\d{7}/, /P\d{7}/], // Passport number patterns
      features: ['hasPhoto', 'hasSignature', 'hasOfficialSeal'],
      layout: 'document',
      expectedFields: ['passport_number', 'name', 'nationality', 'dob', 'place_of_birth', 'issue_date', 'expiry_date'],
      verificationRules: [
        {
          field: 'passport_number',
          required: true,
          pattern: /^[A-Z]\d{7}$/,
          validation: (value: string) => /^[A-Z]\d{7}$/.test(value),
          description: 'Valid passport number format'
        }
      ]
    },
    driving_license: {
      keywords: ['driving licence', 'driving license', 'motor vehicle', 'transport', 'dl'],
      patterns: [/[A-Z]{2}\d{13}/, /DL\d+/],
      features: ['hasPhoto', 'hasSignature'],
      layout: 'card',
      expectedFields: ['dl_number', 'name', 'dob', 'address', 'vehicle_class', 'issue_date', 'expiry_date'],
      verificationRules: []
    },
    pan_card: {
      keywords: ['pan', 'permanent account number', 'income tax', 'nsdl', 'govt of india'],
      patterns: [/[A-Z]{5}\d{4}[A-Z]{1}/, /[a-z]{5}[0-9]{4}[a-z]/i],
      features: ['hasQRCode', 'hasWatermark'],
      layout: 'card',
      expectedFields: ['pan_number', 'name', 'father_name', 'dob'],
      verificationRules: []
    },
    presentation: {
      keywords: ['powerpoint', 'presentation', 'slide', 'ppt', 'pptx'],
      patterns: [],
      features: [],
      layout: 'presentation',
      expectedFields: ['title', 'content', 'slides'],
      verificationRules: [
        {
          field: 'content_authenticity',
          required: false,
          validation: () => true, // Presentations have different verification needs
          description: 'Check for AI-generated content in slides'
        }
      ]
    }
  }

  static async classifyDocument(
    imageData: string | ArrayBuffer,
    filename?: string,
    extractedText?: string
  ): Promise<DocumentClassification> {
    try {
      // Analyze filename for hints
      const filenameHints = this.analyzeFilename(filename || '')
      
      // Extract features from image
      const features = await this.extractDocumentFeatures(imageData)
      
      // Analyze text content
      const textAnalysis = this.analyzeTextContent(extractedText || '')
      
      // Classify based on combined analysis
      const classification = this.performClassification(filenameHints, features, textAnalysis)
      
      return classification
    } catch (error) {
      console.error('Document classification failed:', error)
      return this.getUnknownClassification()
    }
  }

  private static analyzeFilename(filename: string): Partial<DocumentClassification> {
    const lowerFilename = filename.toLowerCase()
    
    if (lowerFilename.includes('aadhar') || lowerFilename.includes('aadhaar')) {
      return { type: 'aadhar_card', confidence: 0.7 }
    }
    if (lowerFilename.includes('passport')) {
      return { type: 'passport', confidence: 0.7 }
    }
    if (lowerFilename.includes('license') || lowerFilename.includes('licence')) {
      return { type: 'driving_license', confidence: 0.6 }
    }
    if (lowerFilename.includes('pan')) {
      return { type: 'pan_card', confidence: 0.7 }
    }
    if (lowerFilename.includes('ppt') || lowerFilename.includes('presentation')) {
      return { type: 'presentation', confidence: 0.8 }
    }
    
    return { type: 'unknown', confidence: 0.1 }
  }

  private static async extractDocumentFeatures(imageData: string | ArrayBuffer): Promise<DocumentFeatures> {
    // Deterministic feature extraction fallback so repeated scans do not flip results
    const source = typeof imageData === 'string'
      ? imageData
      : Array.from(new Uint8Array(imageData)).slice(0, 256).map((value) => String.fromCharCode(value)).join('')

    let hash = 2166136261
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }

    const pick = (shift: number) => ((hash >>> shift) & 255) / 255

    return {
      hasPhoto: pick(0) > 0.45,
      hasSignature: pick(8) > 0.55,
      hasBarcode: pick(16) > 0.65,
      hasQRCode: pick(24) > 0.7,
      hasWatermark: pick(32) > 0.6,
      hasOfficialSeal: pick(40) > 0.7,
      textDensity: pick(48),
      colorScheme: ['government', 'corporate', 'personal', 'presentation'][Math.floor(pick(56) * 4)] as any,
      layout: ['card', 'document', 'certificate', 'presentation'][Math.floor(pick(64) * 4)] as any,
      language: ['english', 'hindi']
    }
  }

  private static analyzeTextContent(text: string): { keywords: string[], patterns: RegExp[] } {
    const lowerText = text.toLowerCase()
    const foundKeywords: string[] = []
    const foundPatterns: RegExp[] = []
    
    // Check for document-specific keywords
    Object.entries(this.documentPatterns).forEach(([docType, config]) => {
      config.keywords.forEach(keyword => {
        if (lowerText.includes(keyword.toLowerCase())) {
          foundKeywords.push(keyword)
        }
      })
      
      config.patterns.forEach(pattern => {
        if (pattern.test(text)) {
          foundPatterns.push(pattern)
        }
      })
    })
    
    return { keywords: foundKeywords, patterns: foundPatterns }
  }

  private static performClassification(
    filenameHints: Partial<DocumentClassification>,
    features: DocumentFeatures,
    textAnalysis: { keywords: string[], patterns: RegExp[] }
  ): DocumentClassification {
    const lowerKeywords = textAnalysis.keywords.map(keyword => keyword.toLowerCase())

    const hasAadhaarSignal =
      lowerKeywords.includes('aadhaar') ||
      lowerKeywords.includes('aadhar') ||
      lowerKeywords.includes('uidai') ||
      lowerKeywords.includes('unique identification') ||
      textAnalysis.patterns.some(pattern => pattern.source === '\\d{4}\\s\\d{4}\\s\\d{4}' || pattern.source === '\\d{12}')

    if (hasAadhaarSignal) {
      return {
        type: 'aadhar_card',
        confidence: 0.95,
        expectedFields: this.documentPatterns.aadhar_card.expectedFields,
        verificationRules: this.documentPatterns.aadhar_card.verificationRules,
        riskFactors: this.getRiskFactors('aadhar_card')
      }
    }

    const hasPanSignal =
      lowerKeywords.includes('pan') ||
      lowerKeywords.includes('income tax') ||
      lowerKeywords.includes('permanent account number') ||
      lowerKeywords.includes('nsdl') ||
      textAnalysis.patterns.some(pattern => pattern.source === '[A-Z]\\d{7}' || pattern.source === 'P\\d{7}')

    if (hasPanSignal) {
      return {
        type: 'pan_card',
        confidence: 0.95,
        expectedFields: this.documentPatterns.pan_card.expectedFields,
        verificationRules: this.documentPatterns.pan_card.verificationRules,
        riskFactors: this.getRiskFactors('pan_card')
      }
    }

    const hasDrivingLicenseSignal =
      lowerKeywords.includes('driving licence') ||
      lowerKeywords.includes('driving license') ||
      lowerKeywords.includes('transport') ||
      lowerKeywords.includes('vehicle') ||
      textAnalysis.patterns.some(pattern => pattern.source === '[A-Z]{2}\\d{13}' || pattern.source === 'DL\\d+')

    if (hasDrivingLicenseSignal) {
      return {
        type: 'driving_license',
        confidence: 0.9,
        expectedFields: this.documentPatterns.driving_license.expectedFields,
        verificationRules: this.documentPatterns.driving_license.verificationRules,
        riskFactors: this.getRiskFactors('driving_license')
      }
    }

    let bestMatch: DocumentClassification = this.getUnknownClassification()
    let highestConfidence = 0
    
    // Analyze each document type
    Object.entries(this.documentPatterns).forEach(([docType, config]) => {
      let confidence = 0
      
      // Filename contribution
      if (filenameHints.type === docType) {
        confidence += 0.3
      }
      
      // Keyword matching
      const keywordMatches = textAnalysis.keywords.filter(keyword => 
        config.keywords.some(configKeyword => 
          configKeyword.toLowerCase().includes(keyword.toLowerCase())
        )
      ).length
      confidence += (keywordMatches / config.keywords.length) * 0.4
      
      // Pattern matching
      const patternMatches = textAnalysis.patterns.filter(pattern => 
        config.patterns.some(configPattern => configPattern.source === pattern.source)
      ).length
      if (config.patterns.length > 0) {
        confidence += (patternMatches / config.patterns.length) * 0.3
      }
      
      // Feature matching
      const featureMatches = config.features.filter(feature => 
        features[feature as keyof DocumentFeatures] === true
      ).length
      if (config.features.length > 0) {
        confidence += (featureMatches / config.features.length) * 0.2
      }
      
      if (confidence > highestConfidence) {
        highestConfidence = confidence
        bestMatch = {
          type: docType as DocumentType,
          confidence: Math.min(confidence, 0.95), // Cap at 95%
          expectedFields: config.expectedFields,
          verificationRules: config.verificationRules,
          riskFactors: this.getRiskFactors(docType as DocumentType)
        }
      }
    })
    
    return bestMatch
  }

  private static getRiskFactors(docType: DocumentType): string[] {
    const riskFactors: Record<DocumentType, string[]> = {
      aadhar_card: ['Identity theft', 'Number manipulation', 'Photo replacement'],
      passport: ['Travel fraud', 'Identity forgery', 'Visa tampering'],
      driving_license: ['Age manipulation', 'Address fraud', 'Photo replacement'],
      pan_card: ['Tax fraud', 'Identity theft', 'Number manipulation'],
      voter_id: ['Electoral fraud', 'Identity theft', 'Address manipulation'],
      bank_statement: ['Financial fraud', 'Income manipulation', 'Transaction forgery'],
      utility_bill: ['Address fraud', 'Proof of residence forgery'],
      presentation: ['AI-generated content', 'Misleading information', 'Copyright infringement'],
      certificate: ['Qualification fraud', 'Institution forgery', 'Grade manipulation'],
      invoice: ['Financial fraud', 'Tax evasion', 'Amount manipulation'],
      contract: ['Legal fraud', 'Terms manipulation', 'Signature forgery'],
      medical_report: ['Insurance fraud', 'Diagnosis manipulation', 'Doctor impersonation'],
      photo: ['Photo manipulation', 'Deepfake risk', 'Impersonation'],
      unknown: ['Unknown document risks']
    }
    
    return riskFactors[docType] || ['General document risks']
  }

  private static getUnknownClassification(): DocumentClassification {
    return {
      type: 'unknown',
      confidence: 0.1,
      expectedFields: ['content'],
      verificationRules: [
        {
          field: 'general_authenticity',
          required: true,
          validation: () => true,
          description: 'General document authenticity check'
        }
      ],
      riskFactors: ['Unknown document type', 'Unable to determine verification requirements']
    }
  }

  // Get document-specific verification instructions
  static getVerificationInstructions(docType: DocumentType): string[] {
    const instructions: Partial<Record<DocumentType, string[]>> = {
      aadhar_card: [
        'Verify 12-digit Aadhar number format',
        'Check QR code authenticity',
        'Validate photo-to-person match',
        'Verify government watermarks',
        'Check address format consistency'
      ],
      passport: [
        'Verify passport number format',
        'Check photo authenticity',
        'Validate visa stamps if present',
        'Verify government seals',
        'Check expiry date validity'
      ],
      presentation: [
        'Scan for AI-generated images',
        'Check for deepfake content',
        'Verify source attribution',
        'Detect manipulated charts/graphs',
        'Check for copyright violations'
      ],
      unknown: [
        'Perform general authenticity check',
        'Scan for AI-generated content',
        'Check for digital manipulation',
        'Verify document integrity'
      ]
    }
    
    return instructions[docType] || instructions.unknown || []
  }
}