const VAULT_INFO = new TextEncoder().encode('KudiRoll embedded wallet vault v1')
const HEX_SECRET = /^0x[0-9a-f]{1,64}$/i

export type EmbeddedWalletSecrets = {
  signerPrivateKey: string
  viewingKey: string
}

export type EmbeddedWalletVault = {
  version: 1
  kdf: 'HKDF-SHA-256'
  cipher: 'AES-256-GCM'
  salt: string
  iv: string
  ciphertext: string
}

function cryptoApi() {
  const value = globalThis.crypto
  if (!value?.subtle) throw new Error('Secure WebCrypto is unavailable in this browser.')
  return value
}

function assertSecrets(value: EmbeddedWalletSecrets) {
  if (!HEX_SECRET.test(value.signerPrivateKey)) throw new Error('A valid Starknet signer secret is required.')
  if (!HEX_SECRET.test(value.viewingKey)) throw new Error('A valid STRK20 viewing key is required.')
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('The encrypted wallet vault is malformed.')
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  if (encodeBase64Url(bytes) !== value) throw new Error('The encrypted wallet vault is malformed.')
  return bytes
}

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function deriveVaultKey(unlockSecret: Uint8Array, salt: Uint8Array, usage: KeyUsage[]) {
  if (unlockSecret.byteLength < 32) throw new Error('The passkey unlock secret is too short.')
  const api = cryptoApi()
  const material = await api.subtle.importKey('raw', bufferOf(unlockSecret), 'HKDF', false, ['deriveKey'])
  return api.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: bufferOf(salt), info: bufferOf(VAULT_INFO) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  )
}

export async function sealEmbeddedWalletVault(secrets: EmbeddedWalletSecrets, unlockSecret: Uint8Array): Promise<EmbeddedWalletVault> {
  assertSecrets(secrets)
  const api = cryptoApi()
  const salt = api.getRandomValues(new Uint8Array(32))
  const iv = api.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(secrets))
  try {
    const key = await deriveVaultKey(unlockSecret, salt, ['encrypt'])
    const ciphertext = await api.subtle.encrypt({ name: 'AES-GCM', iv: bufferOf(iv) }, key, bufferOf(plaintext))
    return {
      version: 1,
      kdf: 'HKDF-SHA-256',
      cipher: 'AES-256-GCM',
      salt: encodeBase64Url(salt),
      iv: encodeBase64Url(iv),
      ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
    }
  } finally {
    plaintext.fill(0)
  }
}

export async function openEmbeddedWalletVault(vault: EmbeddedWalletVault, unlockSecret: Uint8Array): Promise<EmbeddedWalletSecrets> {
  if (vault.version !== 1 || vault.kdf !== 'HKDF-SHA-256' || vault.cipher !== 'AES-256-GCM') {
    throw new Error('This encrypted wallet vault version is unsupported.')
  }
  const api = cryptoApi()
  const salt = decodeBase64Url(vault.salt)
  const iv = decodeBase64Url(vault.iv)
  const ciphertext = decodeBase64Url(vault.ciphertext)
  if (salt.byteLength !== 32 || iv.byteLength !== 12 || ciphertext.byteLength < 16) throw new Error('The encrypted wallet vault is malformed.')

  let plaintext: Uint8Array | null = null
  try {
    const key = await deriveVaultKey(unlockSecret, salt, ['decrypt'])
    plaintext = new Uint8Array(await api.subtle.decrypt({ name: 'AES-GCM', iv: bufferOf(iv) }, key, bufferOf(ciphertext)))
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as EmbeddedWalletSecrets
    assertSecrets(parsed)
    return parsed
  } catch (error) {
    if (error instanceof Error && /required|unsupported|malformed/.test(error.message)) throw error
    throw new Error('The passkey could not unlock this wallet vault or its ciphertext was modified.')
  } finally {
    plaintext?.fill(0)
  }
}
