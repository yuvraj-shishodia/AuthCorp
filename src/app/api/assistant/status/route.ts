import { NextResponse } from 'next/server'
import { getAssistantRuntimeStatus } from '@/lib/assistant-runtime'

export async function GET() {
  return NextResponse.json(getAssistantRuntimeStatus())
}