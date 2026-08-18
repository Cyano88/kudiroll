import { openEmbeddedWalletVault, type EmbeddedWalletPrivateState, type EmbeddedWalletVault } from './vault'

export type PrivacyWorkerStatus = { locked: boolean; accountAddress?: string; signerProvider?: 'argent-web-wallet' }
export type PrivacyWorkerRequest =
  | { id: string; type: 'unlock'; vault: EmbeddedWalletVault; credentialId: string; prfInput: string; prfSecret: ArrayBuffer }
  | { id: string; type: 'lock' }
  | { id: string; type: 'status' }
export type PrivacyWorkerResponse =
  | { id: string; ok: true; result: PrivacyWorkerStatus }
  | { id: string; ok: false; error: string }

function publicStatus(state: EmbeddedWalletPrivateState | null): PrivacyWorkerStatus {
  return state ? { locked: false, accountAddress: state.accountAddress, signerProvider: state.signerProvider } : { locked: true }
}

export class PrivacyWorkerRuntime {
  #state: EmbeddedWalletPrivateState | null = null

  async handle(request: PrivacyWorkerRequest): Promise<PrivacyWorkerResponse> {
    if (!request?.id || !/^[A-Za-z0-9_-]{1,128}$/.test(request.id)) return { id: '', ok: false, error: 'The private wallet worker request is malformed.' }
    try {
      if (request.type === 'lock') {
        this.#state = null
        return { id: request.id, ok: true, result: publicStatus(this.#state) }
      }
      if (request.type === 'status') return { id: request.id, ok: true, result: publicStatus(this.#state) }
      if (request.type !== 'unlock' || !(request.prfSecret instanceof ArrayBuffer)) throw new Error('The private wallet worker request is malformed.')
      const prfSecret = new Uint8Array(request.prfSecret)
      try {
        this.#state = await openEmbeddedWalletVault(request.vault, { credentialId: request.credentialId, prfInput: request.prfInput, prfSecret })
        return { id: request.id, ok: true, result: publicStatus(this.#state) }
      } finally {
        prfSecret.fill(0)
      }
    } catch (error) {
      this.#state = null
      return { id: request.id, ok: false, error: error instanceof Error ? error.message : 'The private wallet worker could not complete the request.' }
    }
  }
}
