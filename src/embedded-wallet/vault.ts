const KEY_SLOT_INFO = new TextEncoder().encode('KudiRoll passkey vault slot v2')
const HEX_VALUE = /^0x[0-9a-f]{1,64}$/i

export type EmbeddedWalletPrivateState = { accountAddress: string; signerProvider: 'argent-web-wallet'; viewingKey: string }
export type PasskeyUnlock = { credentialId: string; prfInput: string; prfSecret: Uint8Array }
export type EmbeddedWalletKeySlot = { credentialId: string; prfInput: string; salt: string; iv: string; wrappedKey: string }
export type EmbeddedWalletVault = {
  version: 2
  kdf: 'HKDF-SHA-256'
  cipher: 'AES-256-GCM'
  accountAddress: string
  signerProvider: 'argent-web-wallet'
  payloadIv: string
  ciphertext: string
  keySlots: EmbeddedWalletKeySlot[]
}

function cryptoApi() {
  const value = globalThis.crypto
  if (!value?.subtle) throw new Error('Secure WebCrypto is unavailable in this browser.')
  return value
}

function assertPrivateState(value: EmbeddedWalletPrivateState) {
  if (!HEX_VALUE.test(value.accountAddress)) throw new Error('A valid Starknet account address is required.')
  if (value.signerProvider !== 'argent-web-wallet') throw new Error('This embedded signer provider is unsupported.')
  if (!HEX_VALUE.test(value.viewingKey)) throw new Error('A valid STRK20 viewing key is required.')
}

function assertCredentialId(value: string) {
  if (!value || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('The passkey credential ID is malformed.')
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('The encrypted wallet vault is malformed.')
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const bytes = Uint8Array.from(atob(padded), character => character.charCodeAt(0))
  if (encodeBase64Url(bytes) !== value) throw new Error('The encrypted wallet vault is malformed.')
  return bytes
}

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function associatedData(vault: Pick<EmbeddedWalletVault, 'version' | 'accountAddress' | 'signerProvider'>) {
  return new TextEncoder().encode(`${vault.version}:${vault.accountAddress.toLowerCase()}:${vault.signerProvider}`)
}

async function deriveWrappingKey(unlock: PasskeyUnlock, salt: Uint8Array, usage: KeyUsage[]) {
  assertCredentialId(unlock.credentialId)
  if (unlock.prfSecret.byteLength < 32) throw new Error('The passkey PRF secret is too short.')
  const api = cryptoApi()
  const material = await api.subtle.importKey('raw', bufferOf(unlock.prfSecret), 'HKDF', false, ['deriveKey'])
  const credentialBinding = new TextEncoder().encode(unlock.credentialId)
  const info = new Uint8Array(KEY_SLOT_INFO.byteLength + credentialBinding.byteLength)
  info.set(KEY_SLOT_INFO)
  info.set(credentialBinding, KEY_SLOT_INFO.byteLength)
  return api.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: bufferOf(salt), info: bufferOf(info) }, material, { name: 'AES-GCM', length: 256 }, false, usage)
}

async function wrapVaultKey(vaultKey: Uint8Array, unlock: PasskeyUnlock): Promise<EmbeddedWalletKeySlot> {
  if (decodeBase64Url(unlock.prfInput).byteLength !== 32) throw new Error('The passkey PRF input is malformed.')
  const api = cryptoApi()
  const salt = api.getRandomValues(new Uint8Array(32))
  const iv = api.getRandomValues(new Uint8Array(12))
  const key = await deriveWrappingKey(unlock, salt, ['encrypt'])
  const wrappedKey = await api.subtle.encrypt({ name: 'AES-GCM', iv: bufferOf(iv) }, key, bufferOf(vaultKey))
  return { credentialId: unlock.credentialId, prfInput: unlock.prfInput, salt: encodeBase64Url(salt), iv: encodeBase64Url(iv), wrappedKey: encodeBase64Url(new Uint8Array(wrappedKey)) }
}

async function unwrapVaultKey(vault: EmbeddedWalletVault, unlock: PasskeyUnlock) {
  const slot = vault.keySlots.find(candidate => candidate.credentialId === unlock.credentialId)
  if (!slot) throw new Error('This passkey is not authorized to unlock the wallet vault.')
  const salt = decodeBase64Url(slot.salt)
  const iv = decodeBase64Url(slot.iv)
  const wrappedKey = decodeBase64Url(slot.wrappedKey)
  if (salt.byteLength !== 32 || iv.byteLength !== 12 || wrappedKey.byteLength !== 48) throw new Error('The encrypted wallet vault is malformed.')
  const key = await deriveWrappingKey(unlock, salt, ['decrypt'])
  return new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM', iv: bufferOf(iv) }, key, bufferOf(wrappedKey)))
}

function assertVault(vault: EmbeddedWalletVault) {
  if (vault.version !== 2 || vault.kdf !== 'HKDF-SHA-256' || vault.cipher !== 'AES-256-GCM' || vault.signerProvider !== 'argent-web-wallet') throw new Error('This encrypted wallet vault version is unsupported.')
  if (!HEX_VALUE.test(vault.accountAddress) || !Array.isArray(vault.keySlots) || vault.keySlots.length < 1) throw new Error('The encrypted wallet vault is malformed.')
  const ids = new Set<string>()
  for (const slot of vault.keySlots) {
    assertCredentialId(slot.credentialId)
    if (decodeBase64Url(slot.prfInput).byteLength !== 32) throw new Error('The encrypted wallet vault is malformed.')
    if (ids.has(slot.credentialId)) throw new Error('The encrypted wallet vault contains duplicate passkey slots.')
    ids.add(slot.credentialId)
  }
}

export async function sealEmbeddedWalletVault(state: EmbeddedWalletPrivateState, unlock: PasskeyUnlock): Promise<EmbeddedWalletVault> {
  assertPrivateState(state)
  const api = cryptoApi()
  const vaultKey = api.getRandomValues(new Uint8Array(32))
  const payloadIv = api.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(state))
  const metadata = { version: 2 as const, accountAddress: state.accountAddress.toLowerCase(), signerProvider: state.signerProvider }
  try {
    const payloadKey = await api.subtle.importKey('raw', bufferOf(vaultKey), { name: 'AES-GCM' }, false, ['encrypt'])
    const ciphertext = await api.subtle.encrypt({ name: 'AES-GCM', iv: bufferOf(payloadIv), additionalData: bufferOf(associatedData(metadata)) }, payloadKey, bufferOf(plaintext))
    return { ...metadata, kdf: 'HKDF-SHA-256', cipher: 'AES-256-GCM', payloadIv: encodeBase64Url(payloadIv), ciphertext: encodeBase64Url(new Uint8Array(ciphertext)), keySlots: [await wrapVaultKey(vaultKey, unlock)] }
  } finally {
    plaintext.fill(0)
    vaultKey.fill(0)
  }
}

export async function openEmbeddedWalletVault(vault: EmbeddedWalletVault, unlock: PasskeyUnlock): Promise<EmbeddedWalletPrivateState> {
  assertVault(vault)
  const payloadIv = decodeBase64Url(vault.payloadIv)
  const ciphertext = decodeBase64Url(vault.ciphertext)
  if (payloadIv.byteLength !== 12 || ciphertext.byteLength < 16) throw new Error('The encrypted wallet vault is malformed.')
  let vaultKey: Uint8Array | null = null
  let plaintext: Uint8Array | null = null
  try {
    vaultKey = await unwrapVaultKey(vault, unlock)
    const payloadKey = await cryptoApi().subtle.importKey('raw', bufferOf(vaultKey), { name: 'AES-GCM' }, false, ['decrypt'])
    plaintext = new Uint8Array(await cryptoApi().subtle.decrypt({ name: 'AES-GCM', iv: bufferOf(payloadIv), additionalData: bufferOf(associatedData(vault)) }, payloadKey, bufferOf(ciphertext)))
    const state = JSON.parse(new TextDecoder().decode(plaintext)) as EmbeddedWalletPrivateState
    assertPrivateState(state)
    if (state.accountAddress.toLowerCase() !== vault.accountAddress.toLowerCase() || state.signerProvider !== vault.signerProvider) throw new Error('The wallet vault metadata does not match its encrypted payload.')
    return state
  } catch (error) {
    if (error instanceof Error && /required|unsupported|malformed|not authorized|duplicate|metadata/.test(error.message)) throw error
    throw new Error('The passkey could not unlock this wallet vault or its ciphertext was modified.')
  } finally {
    vaultKey?.fill(0)
    plaintext?.fill(0)
  }
}

export async function addEmbeddedWalletKeySlot(vault: EmbeddedWalletVault, currentUnlock: PasskeyUnlock, newUnlock: PasskeyUnlock) {
  assertVault(vault)
  assertCredentialId(newUnlock.credentialId)
  if (vault.keySlots.some(slot => slot.credentialId === newUnlock.credentialId)) throw new Error('This passkey already has a wallet vault slot.')
  const vaultKey = await unwrapVaultKey(vault, currentUnlock)
  try {
    return { ...vault, keySlots: [...vault.keySlots, await wrapVaultKey(vaultKey, newUnlock)] }
  } finally {
    vaultKey.fill(0)
  }
}

export function removeEmbeddedWalletKeySlot(vault: EmbeddedWalletVault, credentialId: string) {
  assertVault(vault)
  const keySlots = vault.keySlots.filter(slot => slot.credentialId !== credentialId)
  if (keySlots.length === vault.keySlots.length) throw new Error('This passkey has no wallet vault slot.')
  if (keySlots.length < 2) throw new Error('Keep at least two passkey slots before removing wallet access.')
  return { ...vault, keySlots }
}
