import { createStore } from '@starknet-io/get-starknet-discovery'
import { constants, WalletAccountV6, walletV6 } from 'starknet'

// Wallet discovery pulls in the Starknet Wallet Standard runtime. Keep it out of
// the initial sign-in bundle so email and passkey users do not pay that cost.
export const walletStore = createStore({ eip1193Adapters: [] })

export async function connectStarknetWallet(choice: Parameters<typeof WalletAccountV6.connect>[1]) {
  const account = await WalletAccountV6.connect({ nodeUrl: constants.NetworkName.SN_MAIN }, choice)
  const chainId = await walletV6.requestChainId(choice)
  let supportedApiVersions: string[] = []
  try {
    supportedApiVersions = (await walletV6.supportedWalletApi(choice)).map(String)
  } catch {
    // Standard Starknet wallets can still authenticate and manage workspace data.
  }
  return { account, chainId, supportedApiVersions }
}
