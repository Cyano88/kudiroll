import assert from 'node:assert/strict'
import test from 'node:test'
import { decodePasskeyPrfInput, extractPasskeyPrf, requestPasskeyPrf, splitPasskeyPrf } from '../src/embedded-wallet/passkey-prf'

test('adds a 32-byte PRF request without mutating WebAuthn options', () => {
  const options = { challenge: 'challenge', extensions: { credProps: true } }
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const next = requestPasskeyPrf(options, salt) as any
  assert.equal((options.extensions as any).prf, undefined)
  assert.equal(next.extensions.credProps, true)
  assert.deepEqual(new Uint8Array(next.extensions.prf.eval.first), salt)
})

test('extracts PRF material locally and strips it from the server response', () => {
  const secret = crypto.getRandomValues(new Uint8Array(32))
  const response = { id: 'credential', clientExtensionResults: { appid: false, prf: { enabled: true, results: { first: secret.buffer } } } }
  const extracted = extractPasskeyPrf(response)
  assert.deepEqual(extracted.prfSecret, secret)
  assert.equal((extracted.verificationResponse.clientExtensionResults as any).prf, undefined)
  assert.equal(extracted.verificationResponse.clientExtensionResults.appid, false)
})

test('rejects authenticators without PRF support', () => {
  assert.throws(() => extractPasskeyPrf({ clientExtensionResults: {} }), /does not provide/)
  assert.equal(splitPasskeyPrf({ clientExtensionResults: {} }).prfSecret, null)
  assert.throws(() => requestPasskeyPrf({}, new Uint8Array(8)), /32 bytes/)
})

test('decodes only canonical 32-byte PRF inputs', () => {
  const input = Buffer.alloc(32, 7).toString('base64url')
  assert.deepEqual(decodePasskeyPrfInput(input), new Uint8Array(32).fill(7))
  assert.throws(() => decodePasskeyPrfInput('short'), /32 bytes|malformed/)
})
