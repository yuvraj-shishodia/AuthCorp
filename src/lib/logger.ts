type LogLevel = 'info' | 'warn' | 'error' | 'audit'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: string
  meta?: Record<string, any>
}

export class StructuredLogger {
  private static format(entry: LogEntry) {
    return JSON.stringify(entry)
  }

  static info(message: string, meta?: Record<string, any>, context?: string) {
    const entry: LogEntry = { level: 'info', message, timestamp: new Date().toISOString(), context, meta }
    console.log(StructuredLogger.format(entry))
  }

  static warn(message: string, meta?: Record<string, any>, context?: string) {
    const entry: LogEntry = { level: 'warn', message, timestamp: new Date().toISOString(), context, meta }
    console.warn(StructuredLogger.format(entry))
  }

  static error(message: string, meta?: Record<string, any>, context?: string) {
    const entry: LogEntry = { level: 'error', message, timestamp: new Date().toISOString(), context, meta }
    console.error(StructuredLogger.format(entry))
  }

  static audit(meta: Record<string, any>) {
    const entry: LogEntry = { level: 'audit', message: 'audit_event', timestamp: new Date().toISOString(), meta }
    console.log(StructuredLogger.format(entry))
  }

  static async alert(type: string, meta?: Record<string, any>) {
    const payload = { type, timestamp: new Date().toISOString(), meta }
    const url = process.env.ALERT_WEBHOOK_URL
    if (!url) return
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    } catch (err) {
      StructuredLogger.error('alert_webhook_failed', { error: String(err) }, 'alert')
    }
  }
}