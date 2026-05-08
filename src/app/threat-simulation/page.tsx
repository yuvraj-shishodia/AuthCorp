'use client'

import { useState } from 'react'

type Scenario = 'phishing' | 'deepfake' | 'document_forgery' | 'insider_misuse'

export default function ThreatSimulationPage() {
  const [scenario, setScenario] = useState<Scenario>('phishing')
  const [intensity, setIntensity] = useState(5)
  const [target, setTarget] = useState('Finance Dept')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  async function simulate() {
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/threats/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scenario, intensity, target })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Simulation error')
      setResult(data)
    } catch (e: any) {
      setError(String(e.message || e))
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Threat Simulation</h1>
      <div className="space-y-3 max-w-xl">
        <label className="block text-sm">
          Scenario
          <select className="mt-1 w-full border rounded px-3 py-2" value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
            <option value="phishing">Phishing</option>
            <option value="deepfake">Deepfake</option>
            <option value="document_forgery">Document Forgery</option>
            <option value="insider_misuse">Insider Misuse</option>
          </select>
        </label>
        <label className="block text-sm">
          Intensity ({intensity})
          <input type="range" min={1} max={10} value={intensity} onChange={(e) => setIntensity(parseInt(e.target.value))} className="mt-1 w-full" />
        </label>
        <label className="block text-sm">
          Target
          <input className="mt-1 w-full border rounded px-3 py-2" value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
        <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={simulate}>Run Simulation</button>
        {result && (
          <div className="text-sm text-gray-800 space-y-1">
            <div>Risk Score: <span className="font-semibold">{result.riskScore}</span></div>
            <div>Recommendation: {result.recommendation}</div>
          </div>
        )}
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>
    </div>
  )
}