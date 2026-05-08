import { NextResponse } from 'next/server'
import { getBlockchainAnchoringConfig } from '@/lib/blockchain-config'

export async function GET() {
  const config = getBlockchainAnchoringConfig()

  return NextResponse.json({
    networks: config.networks,
    configuredCount: config.configuredCount,
    totalCount: config.totalCount,
    defaultNetworkId: config.defaultNetworkId,
    canAnchor: config.canAnchor,
    message: config.canAnchor
      ? 'Blockchain anchoring is ready.'
      : 'Set ETHEREUM_RPC_URL and/or POLYGON_RPC_URL in .env.local to enable anchoring.',
  })
}