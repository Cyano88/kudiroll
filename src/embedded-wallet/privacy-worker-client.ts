import type { EmbeddedWalletVault, PasskeyUnlock } from './vault'
import type { PrivacyWorkerRequest, PrivacyWorkerResponse, PrivacyWorkerStatus } from './privacy-worker-runtime'

type WorkerPort = Pick<Worker, 'addEventListener' | 'removeEventListener' | 'postMessage' | 'terminate'>

function requestId() {
  return crypto.randomUUID().replace(/-/g, '')
}

export class PrivacyWorkerClient {
  readonly #worker: WorkerPort

  constructor(worker: WorkerPort = new Worker(new URL('./privacy-worker.ts', import.meta.url), { type: 'module', name: 'kudiroll-private-state' })) {
    this.#worker = worker
  }

  #request(request: PrivacyWorkerRequest, transfer: Transferable[] = []): Promise<PrivacyWorkerStatus> {
    return new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent<PrivacyWorkerResponse>) => {
        if (event.data?.id !== request.id) return
        this.#worker.removeEventListener('message', onMessage as EventListener)
        if (event.data.ok) resolve(event.data.result)
        else reject(new Error(event.data.error))
      }
      this.#worker.addEventListener('message', onMessage as EventListener)
      this.#worker.postMessage(request, transfer)
    })
  }

  unlock(vault: EmbeddedWalletVault, unlock: PasskeyUnlock) {
    const transferableSecret = new Uint8Array(unlock.prfSecret).buffer
    unlock.prfSecret.fill(0)
    const request: PrivacyWorkerRequest = {
      id: requestId(),
      type: 'unlock',
      vault,
      credentialId: unlock.credentialId,
      prfInput: unlock.prfInput,
      prfSecret: transferableSecret,
    }
    return this.#request(request, [transferableSecret])
  }

  lock() {
    return this.#request({ id: requestId(), type: 'lock' })
  }

  status() {
    return this.#request({ id: requestId(), type: 'status' })
  }

  terminate() {
    this.#worker.terminate()
  }
}
