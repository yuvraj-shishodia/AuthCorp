export type AssistantRuntimeMode = 'openai' | 'model-endpoint' | 'local-contextual'

export interface AssistantRuntimeStatus {
  mode: AssistantRuntimeMode
  ready: boolean
  providerLabel: string
  configuredKeys: string[]
  missingKeys: string[]
  message: string
}

const readEnv = (name: string) => process.env[name]?.trim() || ''

// Prefer the best available provider, then fall back to local context when nothing is wired up.
export function getAssistantRuntimeStatus(): AssistantRuntimeStatus {
  const openAiKey = readEnv('OPENAI_API_KEY')
  const modelEndpoint = readEnv('AI_MODEL_ENDPOINT')

  if (openAiKey) {
    return {
      mode: 'openai',
      ready: true,
      providerLabel: 'OpenAI configured',
      configuredKeys: ['OPENAI_API_KEY'],
      missingKeys: [],
      message: 'OpenAI is configured. The UI is ready to switch to a hosted model when you add the provider call later.',
    }
  }

  if (modelEndpoint) {
    return {
      mode: 'model-endpoint',
      ready: true,
      providerLabel: 'Model endpoint configured',
      configuredKeys: ['AI_MODEL_ENDPOINT'],
      missingKeys: [],
      message: 'A model endpoint is configured. The assistant can be upgraded to call it later without changing the UI.',
    }
  }

  return {
    mode: 'local-contextual',
    ready: false,
    providerLabel: 'Local contextual mode',
    configuredKeys: [],
    missingKeys: ['OPENAI_API_KEY or AI_MODEL_ENDPOINT'],
    message: 'No external AI key is set yet. The assistant is running in local contextual mode until you wire one in.',
  }
}