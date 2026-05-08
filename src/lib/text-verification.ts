// OCR and Text Verification Engine

export interface OCRResult {
  text: string
  confidence: number
  boundingBoxes: TextRegion[]
  language: string
  orientation: number
}

export interface TextRegion {
  text: string
  confidence: number
  bbox: {
    x: number
    y: number
    width: number
    height: number
  }
  fontSize: number
  fontFamily: string
  color: string
}

export interface FontAnalysis {
  consistency: number
  detectedFonts: FontInfo[]
  anomalies: FontAnomaly[]
  kerningIssues: KerningIssue[]
  alignmentScore: number
}

export interface FontInfo {
  family: string
  size: number
  weight: string
  style: string
  frequency: number
  regions: TextRegion[]
}

export interface FontAnomaly {
  type: 'size_inconsistency' | 'family_mismatch' | 'spacing_irregular' | 'baseline_shift'
  description: string
  severity: 'low' | 'medium' | 'high'
  location: { x: number; y: number; width: number; height: number }
  confidence: number
}

export interface KerningIssue {
  characters: string
  expectedSpacing: number
  actualSpacing: number
  deviation: number
  location: { x: number; y: number }
}

export interface SignatureAnalysis {
  isPresent: boolean
  confidence: number
  authenticity: {
    score: number
    factors: AuthenticityFactor[]
  }
  comparison?: SignatureComparison
  biometrics: SignatureBiometrics
}

export interface AuthenticityFactor {
  factor: string
  score: number
  weight: number
  description: string
}

export interface SignatureComparison {
  referenceSignature: string
  similarity: number
  differences: SignatureDifference[]
}

export interface SignatureDifference {
  type: 'pressure' | 'speed' | 'angle' | 'shape' | 'size'
  severity: number
  description: string
}

export interface SignatureBiometrics {
  pressure: number[]
  velocity: number[]
  acceleration: number[]
  angles: number[]
  penLifts: number
  duration: number
  boundingBox: { x: number; y: number; width: number; height: number }
}

export interface WatermarkAnalysis {
  detected: boolean
  type: 'digital' | 'physical' | 'embedded'
  authenticity: number
  location: { x: number; y: number; width: number; height: number }
  degradation: number
  expectedFeatures: string[]
  missingFeatures: string[]
}

export class TextVerificationEngine {
  // OCR Processing
  static async performOCR(imageData: string | ArrayBuffer): Promise<OCRResult> {
    // Mock OCR implementation - in production would use Tesseract.js or cloud OCR
    await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate processing
    
    const mockText = `PASSPORT
United States of America
Name: JOHN MICHAEL SMITH
Date of Birth: 15 MAR 1985
Place of Birth: NEW YORK, NY
Passport No: 123456789
Date of Issue: 01 JAN 2020
Date of Expiry: 01 JAN 2030
Authority: U.S. DEPARTMENT OF STATE`
    
    const mockRegions: TextRegion[] = [
      {
        text: 'PASSPORT',
        confidence: 0.98,
        bbox: { x: 100, y: 50, width: 200, height: 30 },
        fontSize: 24,
        fontFamily: 'Arial Bold',
        color: '#000000'
      },
      {
        text: 'United States of America',
        confidence: 0.95,
        bbox: { x: 80, y: 90, width: 240, height: 20 },
        fontSize: 16,
        fontFamily: 'Arial',
        color: '#000000'
      },
      {
        text: 'JOHN MICHAEL SMITH',
        confidence: 0.97,
        bbox: { x: 150, y: 150, width: 180, height: 18 },
        fontSize: 14,
        fontFamily: 'Arial',
        color: '#000000'
      }
    ]
    
    return {
      text: mockText,
      confidence: 0.96,
      boundingBoxes: mockRegions,
      language: 'en',
      orientation: 0
    }
  }
  
  // Font Analysis
  static analyzeFonts(ocrResult: OCRResult): FontAnalysis {
    const fontMap = new Map<string, FontInfo>()
    const anomalies: FontAnomaly[] = []
    const kerningIssues: KerningIssue[] = []
    
    // Analyze font consistency
    ocrResult.boundingBoxes.forEach(region => {
      const fontKey = `${region.fontFamily}-${region.fontSize}`
      
      if (fontMap.has(fontKey)) {
        const existing = fontMap.get(fontKey)!
        existing.frequency++
        existing.regions.push(region)
      } else {
        fontMap.set(fontKey, {
          family: region.fontFamily,
          size: region.fontSize,
          weight: 'normal',
          style: 'normal',
          frequency: 1,
          regions: [region]
        })
      }
    })
    
    const detectedFonts = Array.from(fontMap.values())
    
    // Detect font anomalies
    if (detectedFonts.length > 3) {
      anomalies.push({
        type: 'family_mismatch',
        description: 'Too many different fonts detected for a single document',
        severity: 'medium',
        location: { x: 0, y: 0, width: 400, height: 600 },
        confidence: 0.8
      })
    }
    
    // Check for size inconsistencies
    const sizesInSameFont = detectedFonts.filter(f => f.family === 'Arial')
    if (sizesInSameFont.length > 1) {
      const sizeVariation = Math.max(...sizesInSameFont.map(f => f.size)) - 
                           Math.min(...sizesInSameFont.map(f => f.size))
      if (sizeVariation > 6) {
        anomalies.push({
          type: 'size_inconsistency',
          description: 'Unusual font size variation detected',
          severity: 'low',
          location: { x: 0, y: 0, width: 400, height: 600 },
          confidence: 0.7
        })
      }
    }
    
    // Calculate consistency score
    const dominantFont = detectedFonts.reduce((prev, current) => 
      prev.frequency > current.frequency ? prev : current
    )
    const consistency = (dominantFont.frequency / ocrResult.boundingBoxes.length) * 100
    
    return {
      consistency,
      detectedFonts,
      anomalies,
      kerningIssues,
      alignmentScore: this.calculateAlignmentScore(ocrResult.boundingBoxes)
    }
  }
  
  private static calculateAlignmentScore(regions: TextRegion[]): number {
    if (regions.length < 2) return 100
    
    // Check left alignment
    const leftEdges = regions.map(r => r.bbox.x)
    const leftVariation = Math.max(...leftEdges) - Math.min(...leftEdges)
    
    // Check baseline alignment for same-line text
    const baselines = regions.map(r => r.bbox.y + r.bbox.height)
    const baselineVariation = Math.max(...baselines) - Math.min(...baselines)
    
    // Score based on alignment consistency
    const alignmentScore = Math.max(0, 100 - (leftVariation + baselineVariation) / 2)
    return alignmentScore
  }
  
  // Signature Verification
  static async analyzeSignature(
    signatureImage: string | ArrayBuffer,
    referenceSignature?: string
  ): Promise<SignatureAnalysis> {
    await new Promise(resolve => setTimeout(resolve, 800)) // Simulate processing
    
    // Mock signature analysis
    const mockBiometrics: SignatureBiometrics = {
      pressure: [0.3, 0.5, 0.7, 0.8, 0.6, 0.4, 0.2],
      velocity: [2.1, 3.2, 4.1, 3.8, 2.9, 2.1, 1.5],
      acceleration: [0.5, 1.2, 0.8, -0.3, -0.9, -0.6, -0.4],
      angles: [45, 52, 48, 43, 39, 41, 44],
      penLifts: 2,
      duration: 2.3,
      boundingBox: { x: 50, y: 200, width: 150, height: 40 }
    }
    
    const authenticityFactors: AuthenticityFactor[] = [
      {
        factor: 'Pressure Variation',
        score: 85,
        weight: 0.25,
        description: 'Natural pressure variation consistent with human writing'
      },
      {
        factor: 'Velocity Consistency',
        score: 78,
        weight: 0.20,
        description: 'Writing speed shows natural human patterns'
      },
      {
        factor: 'Stroke Continuity',
        score: 92,
        weight: 0.30,
        description: 'Continuous strokes without artificial breaks'
      },
      {
        factor: 'Pen Lift Patterns',
        score: 88,
        weight: 0.15,
        description: 'Natural pen lift patterns observed'
      },
      {
        factor: 'Tremor Analysis',
        score: 82,
        weight: 0.10,
        description: 'Micro-tremors consistent with human motor control'
      }
    ]
    
    const overallScore = authenticityFactors.reduce(
      (sum, factor) => sum + (factor.score * factor.weight), 0
    )
    
    let comparison: SignatureComparison | undefined
    if (referenceSignature) {
      comparison = {
        referenceSignature,
        similarity: 87.5,
        differences: [
          {
            type: 'pressure',
            severity: 0.15,
            description: 'Slightly higher pressure in middle section'
          },
          {
            type: 'speed',
            severity: 0.08,
            description: 'Minor speed variation in final stroke'
          }
        ]
      }
    }
    
    return {
      isPresent: true,
      confidence: 0.94,
      authenticity: {
        score: overallScore,
        factors: authenticityFactors
      },
      comparison,
      biometrics: mockBiometrics
    }
  }
  
  // Watermark and Seal Analysis
  static analyzeWatermarks(imageData: string | ArrayBuffer): WatermarkAnalysis {
    // Mock watermark analysis
    return {
      detected: true,
      type: 'physical',
      authenticity: 89,
      location: { x: 200, y: 300, width: 100, height: 100 },
      degradation: 15,
      expectedFeatures: [
        'Eagle emblem',
        'Microtext border',
        'Security thread',
        'Color-changing ink'
      ],
      missingFeatures: ['Security thread']
    }
  }
  
  // Cross-document consistency check
  static checkDocumentConsistency(documents: OCRResult[]): {
    consistency: number
    inconsistencies: DocumentInconsistency[]
  } {
    const inconsistencies: DocumentInconsistency[] = []
    
    if (documents.length < 2) {
      return { consistency: 100, inconsistencies }
    }
    
    // Extract common fields
    const extractedData = documents.map(doc => this.extractStructuredData(doc.text))
    
    // Check name consistency
    const names = extractedData.map(data => data.name).filter((name): name is string => Boolean(name))
    if (names.length > 1 && !this.areNamesConsistent(names)) {
      inconsistencies.push({
        type: 'name_mismatch',
        description: 'Name variations detected across documents',
        severity: 'high',
        documents: [0, 1],
        details: { names }
      })
    }
    
    // Check date of birth consistency
    const dobs = extractedData.map(data => data.dateOfBirth).filter(Boolean)
    if (dobs.length > 1 && new Set(dobs).size > 1) {
      inconsistencies.push({
        type: 'dob_mismatch',
        description: 'Date of birth inconsistency found',
        severity: 'high',
        documents: [0, 1],
        details: { dobs }
      })
    }
    
    // Check address consistency
    const addresses = extractedData.map(data => data.address).filter((address): address is string => Boolean(address))
    if (addresses.length > 1 && !this.areAddressesConsistent(addresses)) {
      inconsistencies.push({
        type: 'address_mismatch',
        description: 'Address inconsistency detected',
        severity: 'medium',
        documents: [0, 1],
        details: { addresses }
      })
    }
    
    const consistency = Math.max(0, 100 - (inconsistencies.length * 25))
    return { consistency, inconsistencies }
  }
  
  private static extractStructuredData(text: string): {
    name?: string
    dateOfBirth?: string
    address?: string
    idNumber?: string
  } {
    const data: any = {}
    
    // Extract name
    const nameMatch = text.match(/Name:?\s*([A-Z\s]+)/i)
    if (nameMatch) data.name = nameMatch[1].trim()
    
    // Extract date of birth
    const dobMatch = text.match(/(?:Date of Birth|DOB):?\s*(\d{1,2}\s+[A-Z]{3}\s+\d{4})/i)
    if (dobMatch) data.dateOfBirth = dobMatch[1]
    
    // Extract address
    const addressMatch = text.match(/Address:?\s*([^\n]+)/i)
    if (addressMatch) data.address = addressMatch[1].trim()
    
    // Extract ID number
    const idMatch = text.match(/(?:Passport No|ID|License):?\s*([A-Z0-9]+)/i)
    if (idMatch) data.idNumber = idMatch[1]
    
    return data
  }
  
  private static areNamesConsistent(names: string[]): boolean {
    // Normalize names for comparison
    const normalized = names.map(name => 
      name.toUpperCase().replace(/[^A-Z\s]/g, '').trim()
    )
    
    // Check if all names are similar (allowing for middle name variations)
    const firstName = normalized[0].split(' ')[0]
    const lastName = normalized[0].split(' ').pop()
    
    return normalized.every(name => 
      name.includes(firstName) && name.includes(lastName!)
    )
  }
  
  private static areAddressesConsistent(addresses: string[]): boolean {
    // Simple address consistency check
    const normalized = addresses.map(addr => 
      addr.toUpperCase().replace(/[^A-Z0-9\s]/g, '')
    )
    
    // Check for common elements (street number, city, state)
    const commonElements = normalized[0].split(' ')
    return normalized.every(addr => 
      commonElements.some(element => 
        element.length > 2 && addr.includes(element)
      )
    )
  }
}

export interface DocumentInconsistency {
  type: 'name_mismatch' | 'dob_mismatch' | 'address_mismatch' | 'id_mismatch'
  description: string
  severity: 'low' | 'medium' | 'high'
  documents: number[]
  details: Record<string, any>
}

// Text quality assessment
export class TextQualityAnalyzer {
  static assessQuality(ocrResult: OCRResult): {
    overallQuality: number
    factors: QualityFactor[]
    recommendations: string[]
  } {
    const factors: QualityFactor[] = []
    const recommendations: string[] = []
    
    // Confidence assessment
    const avgConfidence = ocrResult.boundingBoxes.reduce(
      (sum, region) => sum + region.confidence, 0
    ) / ocrResult.boundingBoxes.length
    
    factors.push({
      name: 'OCR Confidence',
      score: avgConfidence * 100,
      weight: 0.3,
      description: 'Average confidence of text recognition'
    })
    
    if (avgConfidence < 0.8) {
      recommendations.push('Consider rescanning document with higher resolution')
    }
    
    // Text density assessment
    const textDensity = ocrResult.text.length / 1000 // Normalize by expected length
    factors.push({
      name: 'Text Density',
      score: Math.min(100, textDensity * 50),
      weight: 0.2,
      description: 'Amount of readable text detected'
    })
    
    // Character recognition quality
    const specialChars = (ocrResult.text.match(/[^a-zA-Z0-9\s]/g) || []).length
    const charQuality = Math.max(0, 100 - (specialChars / ocrResult.text.length) * 200)
    
    factors.push({
      name: 'Character Quality',
      score: charQuality,
      weight: 0.25,
      description: 'Quality of individual character recognition'
    })
    
    // Layout preservation
    const layoutScore = ocrResult.boundingBoxes.length > 0 ? 85 : 0
    factors.push({
      name: 'Layout Preservation',
      score: layoutScore,
      weight: 0.25,
      description: 'How well document layout was preserved'
    })
    
    const overallQuality = factors.reduce(
      (sum, factor) => sum + (factor.score * factor.weight), 0
    )
    
    return {
      overallQuality,
      factors,
      recommendations
    }
  }
}

export interface QualityFactor {
  name: string
  score: number
  weight: number
  description: string
}