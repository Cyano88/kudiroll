import { PrivacyWorkerRuntime, type PrivacyWorkerRequest } from './privacy-worker-runtime'

type DedicatedWorkerScope = {
  addEventListener(type: 'message', listener: (event: MessageEvent<PrivacyWorkerRequest>) => void): void
  postMessage(message: unknown): void
}

const scope = globalThis as unknown as DedicatedWorkerScope
const runtime = new PrivacyWorkerRuntime()

scope.addEventListener('message', event => {
  void runtime.handle(event.data).then(response => scope.postMessage(response))
})
