import type { Call, Signature, TypedData } from 'starknet'

export type EmbeddedSignerProvider = 'argent-web-wallet'
export type EmbeddedSmartAccount = {
  address: string
  execute(calls: Call | Call[]): Promise<{ transaction_hash: string }>
  signMessage(typedData: TypedData): Promise<Signature>
  getChainId(): Promise<string>
}
export type ExtensionlessSigner = {
  provider: EmbeddedSignerProvider
  address: string
  execute(calls: Call | Call[]): Promise<{ transaction_hash: string }>
  signMessage(typedData: TypedData): Promise<Signature>
  assertMainnet(): Promise<void>
}

const MAINNET_CHAIN_IDS = new Set(['SN_MAIN', '0X534E5F4D41494E'])

export function createExtensionlessSigner(provider: EmbeddedSignerProvider, account: EmbeddedSmartAccount): ExtensionlessSigner {
  if (provider !== 'argent-web-wallet') throw new Error('This embedded signer provider is unsupported.')
  if (!/^0x[0-9a-f]{1,64}$/i.test(account.address)) throw new Error('The embedded signer returned an invalid Starknet address.')
  return {
    provider,
    address: account.address.toLowerCase(),
    execute: calls => account.execute(calls),
    signMessage: typedData => account.signMessage(typedData),
    async assertMainnet() {
      const chainId = await account.getChainId()
      if (!MAINNET_CHAIN_IDS.has(chainId.toUpperCase())) throw new Error('KudiRoll embedded signing currently supports Starknet Mainnet only.')
    },
  }
}

// STRK20 must consume the smart account's account-valid signature, including
// guardian or co-signer fields. A raw private-key signer is intentionally absent.
export type Strk20AccountSigner = Pick<ExtensionlessSigner, 'address' | 'signMessage' | 'execute' | 'assertMainnet'>
