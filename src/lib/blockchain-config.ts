export type BlockchainNetworkId = 'ethereum' | 'polygon'

export type BlockchainNetworkTone = 'blue' | 'emerald'

export interface BlockchainNetworkDefinition {
  id: BlockchainNetworkId
  label: string
  chainId: number
  rpcEnvKey: 'ETHEREUM_RPC_URL' | 'POLYGON_RPC_URL'
  explorerLabel: string
  explorerUrl: string
  description: string
  tone: BlockchainNetworkTone
  symbol: string
}

export interface BlockchainNetworkStatus extends BlockchainNetworkDefinition {
  configured: boolean
}

export interface BlockchainAnchoringConfig {
  networks: BlockchainNetworkStatus[]
  configuredCount: number
  totalCount: number
  defaultNetworkId: BlockchainNetworkId | null
  canAnchor: boolean
}

// Only networks with an RPC URL should show up as usable anchor targets.
const BLOCKCHAIN_NETWORKS: BlockchainNetworkDefinition[] = [
  {
    id: 'ethereum',
    label: 'Ethereum',
    chainId: 1,
    rpcEnvKey: 'ETHEREUM_RPC_URL',
    explorerLabel: 'Etherscan',
    explorerUrl: 'https://etherscan.io',
    description: 'High-trust anchor for immutable public proof',
    tone: 'blue',
    symbol: 'ETH',
  },
  {
    id: 'polygon',
    label: 'Polygon',
    chainId: 137,
    rpcEnvKey: 'POLYGON_RPC_URL',
    explorerLabel: 'Polygonscan',
    explorerUrl: 'https://polygonscan.com',
    description: 'Lower-cost anchor for frequent evidence receipts',
    tone: 'emerald',
    symbol: 'POL',
  },
]

export function getBlockchainAnchoringConfig(): BlockchainAnchoringConfig {
  // Rebuild this snapshot on demand so the UI always reflects the current environment.
  const networks = BLOCKCHAIN_NETWORKS.map((network) => ({
    ...network,
    configured: Boolean(process.env[network.rpcEnvKey]?.trim()),
  }))

  const configuredNetworks = networks.filter((network) => network.configured)

  return {
    networks,
    configuredCount: configuredNetworks.length,
    totalCount: networks.length,
    defaultNetworkId: configuredNetworks[0]?.id ?? networks[0]?.id ?? null,
    canAnchor: configuredNetworks.length > 0,
  }
}

export function getConfiguredBlockchainNetworkIds(): BlockchainNetworkId[] {
  return getBlockchainAnchoringConfig()
    .networks
    .filter((network) => network.configured)
    .map((network) => network.id)
}

export function getConfiguredBlockchainNetwork(networkId: string): BlockchainNetworkStatus | undefined {
  return getBlockchainAnchoringConfig().networks.find((network) => network.id === networkId)
}