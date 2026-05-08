import CryptoJS from 'crypto-js'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { StructuredLogger } from '@/lib/logger'

// Security configuration (no defaults; require env vars)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
const JWT_SECRET = process.env.JWT_SECRET
const SALT_ROUNDS = 12

function requireEnv(name: string, value: string | undefined) {
  if (!value || value.trim().length < 16) {
    throw new Error(`${name} is not set or too weak. Set a strong value in environment.`)
  }
  return value
}

// Data encryption utilities
export class SecurityManager {
  // AES-256 encryption for sensitive data
  static encryptData(data: string): string {
    try {
      const key = requireEnv('ENCRYPTION_KEY', ENCRYPTION_KEY)
      const encrypted = CryptoJS.AES.encrypt(data, key).toString()
      return encrypted
    } catch (error) {
      console.error('Encryption failed:', error)
      throw new Error('Data encryption failed')
    }
  }

  static decryptData(encryptedData: string): string {
    try {
      const key = requireEnv('ENCRYPTION_KEY', ENCRYPTION_KEY)
      const bytes = CryptoJS.AES.decrypt(encryptedData, key)
      const decrypted = bytes.toString(CryptoJS.enc.Utf8)
      if (!decrypted) {
        throw new Error('Invalid encrypted data')
      }
      return decrypted
    } catch (error) {
      console.error('Decryption failed:', error)
      throw new Error('Data decryption failed')
    }
  }

  // Hash sensitive information
  static hashData(data: string): string {
    return CryptoJS.SHA256(data).toString()
  }

  // Generate secure tokens
  static generateToken(payload: object, expiresIn: jwt.SignOptions['expiresIn'] = '24h'): string {
    const secret = requireEnv('JWT_SECRET', JWT_SECRET)
    return jwt.sign(payload, secret, { expiresIn })
  }

  // Verify JWT tokens
  static verifyToken(token: string): any {
    try {
      const secret = requireEnv('JWT_SECRET', JWT_SECRET)
      return jwt.verify(token, secret)
    } catch (error) {
      throw new Error('Invalid token')
    }
  }

  // Generate secure random strings
  static generateSecureId(length: number = 32): string {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length)
  }

  // Sanitize input data
  static sanitizeInput(input: string): string {
    return input
      .replace(/[<>"'&]/g, (match) => {
        const entities: { [key: string]: string } = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        }
        return entities[match] || match
      })
      .trim()
  }

  // Validate file types and sizes
  static validateFile(file: File): { isValid: boolean; error?: string } {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/tiff', 'application/pdf']
    const maxSize = 50 * 1024 * 1024 // 50MB

    if (!allowedTypes.includes(file.type)) {
      return { isValid: false, error: 'Invalid file type' }
    }

    if (file.size > maxSize) {
      return { isValid: false, error: 'File size exceeds limit' }
    }

    return { isValid: true }
  }
}

// Audit logging system
export interface AuditLog {
  id: string
  timestamp: Date
  userId: string
  action: string
  resource: string
  details: Record<string, any> | string
  ipAddress?: string
  userAgent?: string
  riskLevel: 'low' | 'medium' | 'high'
  compliance: {
    gdpr: boolean
    ccpa: boolean
    hipaa: boolean
    iso27001: boolean
  }
}

export class AuditLogger {
  private static logs: AuditLog[] = []

  static async logAction({
    userId,
    action,
    resource,
    details = {},
    ipAddress,
    userAgent,
    riskLevel = 'low'
  }: Omit<AuditLog, 'id' | 'timestamp' | 'compliance'>) {
    const auditLog: AuditLog = {
      id: SecurityManager.generateSecureId(),
      timestamp: new Date(),
      userId,
      action,
      resource,
      details: SecurityManager.encryptData(JSON.stringify(details)),
      ipAddress,
      userAgent,
      riskLevel,
      compliance: {
        gdpr: true,
        ccpa: true,
        hipaa: action.includes('health') || resource.includes('medical'),
        iso27001: true
      }
    }

    this.logs.push(auditLog)
    StructuredLogger.audit({
      id: auditLog.id,
      timestamp: auditLog.timestamp,
      userId: auditLog.userId,
      action: auditLog.action,
      resource: auditLog.resource,
      riskLevel: auditLog.riskLevel
    })

    if (auditLog.riskLevel === 'high') {
      StructuredLogger.alert('audit_high_risk', {
        id: auditLog.id,
        action: auditLog.action,
        resource: auditLog.resource,
        userId: auditLog.userId
      })
    }

    return auditLog.id
  }

  static getAuditLogs(filters?: {
    userId?: string
    action?: string
    startDate?: Date
    endDate?: Date
    riskLevel?: string
  }): AuditLog[] {
    let filteredLogs = [...this.logs]

    if (filters) {
      if (filters.userId) {
        filteredLogs = filteredLogs.filter(log => log.userId === filters.userId)
      }
      if (filters.action) {
        filteredLogs = filteredLogs.filter(log => log.action.includes(filters.action!))
      }
      if (filters.startDate) {
        filteredLogs = filteredLogs.filter(log => log.timestamp >= filters.startDate!)
      }
      if (filters.endDate) {
        filteredLogs = filteredLogs.filter(log => log.timestamp <= filters.endDate!)
      }
      if (filters.riskLevel) {
        filteredLogs = filteredLogs.filter(log => log.riskLevel === filters.riskLevel)
      }
    }

    return filteredLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }
}

// Compliance manager
export class ComplianceManager {
  // GDPR compliance utilities
  static gdprCompliance = {
    // Right to be forgotten
    deleteUserData: async (userId: string) => {
      // Implementation would delete all user data
      await AuditLogger.logAction({
        userId: 'system',
        action: 'gdpr_data_deletion',
        resource: `user:${userId}`,
        details: { reason: 'GDPR right to be forgotten' },
        riskLevel: 'medium'
      })
    },

    // Data portability
    exportUserData: async (userId: string) => {
      // Implementation would export user data
      await AuditLogger.logAction({
        userId,
        action: 'gdpr_data_export',
        resource: `user:${userId}`,
        details: { format: 'JSON' },
        riskLevel: 'low'
      })
    },

    // Consent management
    recordConsent: async (userId: string, consentType: string, granted: boolean) => {
      await AuditLogger.logAction({
        userId,
        action: 'gdpr_consent_update',
        resource: `consent:${consentType}`,
        details: { granted, timestamp: new Date() },
        riskLevel: 'low'
      })
    }
  }

  // Data retention policies
  static retentionPolicies = {
    documents: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
    auditLogs: 10 * 365 * 24 * 60 * 60 * 1000, // 10 years
    userSessions: 30 * 24 * 60 * 60 * 1000, // 30 days
    analysisResults: 5 * 365 * 24 * 60 * 60 * 1000 // 5 years
  }

  // Data minimization
  static minimizeData(data: any, purpose: string): any {
    const minimizationRules: { [key: string]: string[] } = {
      'document_analysis': ['filename', 'fileType', 'analysisResults'],
      'risk_assessment': ['name', 'dateOfBirth', 'riskScore'],
      'audit_logging': ['action', 'timestamp', 'resource']
    }

    const allowedFields = minimizationRules[purpose] || Object.keys(data)
    const minimizedData: any = {}

    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        minimizedData[field] = data[field]
      }
    })

    return minimizedData
  }
}

// Zero-trust security model
export class ZeroTrustManager {
  // Continuous session verification
  static async verifySession(sessionToken: string, ipAddress: string, userAgent: string): Promise<boolean> {
    try {
      const payload = SecurityManager.verifyToken(sessionToken)
      
      // Check for suspicious activity
      const riskFactors = [
        this.checkIpReputation(ipAddress),
        this.checkUserAgentConsistency(payload.userId, userAgent),
        this.checkSessionAge(payload.iat)
      ]

      const riskScore = riskFactors.reduce((sum, factor) => sum + factor, 0)
      
      if (riskScore > 50) {
        await AuditLogger.logAction({
          userId: payload.userId,
          action: 'suspicious_session_detected',
          resource: 'session',
          details: { riskScore, ipAddress, userAgent },
          riskLevel: 'high'
        })
        return false
      }

      return true
    } catch (error) {
      return false
    }
  }

  private static checkIpReputation(ipAddress: string): number {
    // Mock IP reputation check
    const suspiciousIps = ['192.168.1.100', '10.0.0.50']
    return suspiciousIps.includes(ipAddress) ? 30 : 0
  }

  private static checkUserAgentConsistency(userId: string, userAgent: string): number {
    // Mock user agent consistency check
    return Math.random() > 0.9 ? 20 : 0
  }

  private static checkSessionAge(issuedAt: number): number {
    const age = Date.now() / 1000 - issuedAt
    const maxAge = 24 * 60 * 60 // 24 hours
    return age > maxAge ? 25 : 0
  }
}

// Privacy-preserving utilities
export class PrivacyManager {
  // Homomorphic encryption simulation
  static encryptForComputation(data: number[]): string {
    // Simplified homomorphic encryption simulation
    const encrypted = data.map(value => value * 7 + 13) // Simple transformation
    return SecurityManager.encryptData(JSON.stringify(encrypted))
  }

  // Differential privacy
  static addNoise(value: number, epsilon: number = 1.0): number {
    const noise = (Math.random() - 0.5) * (2 / epsilon)
    return Math.max(0, value + noise)
  }

  // Data anonymization
  static anonymizePersonalData(data: any): any {
    const anonymized = { ...data }
    
    // Remove or hash PII
    if (anonymized.name) {
      anonymized.name = SecurityManager.hashData(anonymized.name).substring(0, 8)
    }
    if (anonymized.email) {
      anonymized.email = SecurityManager.hashData(anonymized.email).substring(0, 8) + '@anonymized.com'
    }
    if (anonymized.phone) {
      anonymized.phone = '***-***-' + anonymized.phone.slice(-4)
    }
    if (anonymized.address) {
      anonymized.address = 'Anonymized Location'
    }

    return anonymized
  }
}