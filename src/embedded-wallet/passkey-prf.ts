type JsonObject = Record<string, any>

function fromBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('The passkey PRF input is malformed.')
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  let decoded = ''
  try {
    decoded = atob(padded)
  } catch {
    throw new Error('The passkey PRF input is malformed.')
  }
  const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0))
  if (bytes.byteLength !== 32) throw new Error('The passkey PRF input must be 32 bytes.')
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const canonical = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  if (canonical !== value) throw new Error('The passkey PRF input is malformed.')
  return bytes
}

function copyBuffer(value: Uint8Array) {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy.buffer
}

export function requestPasskeyPrf<T extends JsonObject>(options: T, salt: Uint8Array): T {
  if (salt.byteLength !== 32) throw new Error('The passkey PRF salt must be 32 bytes.')
  return { ...options, extensions: { ...(options.extensions || {}), prf: { eval: { first: copyBuffer(salt) } } } }
}

export function decodePasskeyPrfInput(value: string) {
  return fromBase64Url(value)
}

export function splitPasskeyPrf<T extends JsonObject>(response: T) {
  const first = response?.clientExtensionResults?.prf?.results?.first
  const secret = first instanceof ArrayBuffer ? new Uint8Array(first.slice(0)) : ArrayBuffer.isView(first) ? new Uint8Array(first.buffer.slice(first.byteOffset, first.byteOffset + first.byteLength)) : null
  const clientExtensionResults = { ...(response.clientExtensionResults || {}) }
  delete clientExtensionResults.prf
  return { prfSecret: secret?.byteLength === 32 ? secret : null, verificationResponse: { ...response, clientExtensionResults } as T }
}

export function extractPasskeyPrf<T extends JsonObject>(response: T) {
  const result = splitPasskeyPrf(response)
  if (!result.prfSecret) throw new Error('This passkey does not provide the WebAuthn PRF required for private-wallet recovery.')
  return { ...result, prfSecret: result.prfSecret }
}
