import { useEffect, useState } from 'react'
import {
  ArrowRightIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ArrowsRightLeftIcon,
  BuildingOffice2Icon,
  ChartBarSquareIcon,
  CheckIcon,
  EllipsisHorizontalIcon,
  EnvelopeIcon,
  HomeIcon,
  KeyIcon,
  MoonIcon,
  SunIcon,
  UserGroupIcon,
  WalletIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { decodePasskeyPrfInput, requestPasskeyPrf, splitPasskeyPrf } from './embedded-wallet/passkey-prf'
import type { WalletWithStarknetFeatures } from '@starknet-io/get-starknet-wallet-standard/features'
import type { WalletAccountV6 } from 'starknet'
import {
  isStarknetAddress,
  requireStarknetMainnet,
  readPrivateUsdcBalance,
  simulatePrivatePayroll,
  simulatePaycrestWithdraw,
  simulateUsdcShield,
  submitPrivatePayroll,
  submitPaycrestWithdraw,
  submitUsdcShield,
  supportsStrk20Api,
  withTimeout,
} from './phase0'
import type { TreasuryReadiness, TreasuryShieldRecord } from './treasury-readiness'
import { isConnectableStarknetWallet, startInjectedWalletDiscovery } from './wallet-discovery'
import { createRailPayRun, resolveUnknownRailPayRun, updateRailPayRun, verifyRailPayRun } from './rail/client'
import type { PayRunExecutionManifest } from './rail/contracts'
import { kudiRailUrl } from './rail/api-origin'

type Check = { ok: boolean; detail: string }
type PublicProbe = {
  ok: boolean
  checkedAt: string
  token: { symbol: string; network: string; contractAddress: string; decimals: number } | null
  quote: { rate: string; orderType?: string; refundTimeoutMinutes?: number } | null
  checks: Record<string, Check>
  stale?: boolean
  warning?: string
}
type Institution = { code: string; name: string; type?: string }
type VerifiedAccount = { accountName: string; fingerprint: string }
type Phase0Order = {
  id: string
  reference: string
  amountNgn: string
  amountUsdc: string
  receiveAddress: string
  validUntil: string
  accountName: string
  bankLast4: string
  network: string
  token: string
  providerStatus: string
  displayStatus: 'ready-to-pay' | 'payment-submitted' | 'awaiting-paycrest-detection' | 'reconciliation-required' | 'refunding' | 'refunded' | 'completed' | 'payment-window-closed' | 'payment-failed'
  transactionHash: string
  submissionState: string
  chainStatus: string
  chainMessage: string
  reconciliationReason: string
  createdAt: string
  updatedAt: string
}
type PaycrestOrderSummary = Phase0Order
type ConnectedWallet = WalletAccountV6
type SavedWorker = { id: string; name: string; walletAddress: string; defaultAmountUsdc: string; createdAt: string; updatedAt: string }
type SavedTeam = { id: string; name: string; description: string; workers: SavedWorker[]; createdAt: string; updatedAt: string }
type SavedPayRunItem = { id: string; workerId: string; workerName: string; walletAddress: string; amountUsdc: string; status: string }
type SavedPayRun = { id: string; teamId: string; teamName: string; status: string; totalUsdc: string; items: SavedPayRunItem[]; transactionHash: string; submissionAttemptedAt: string; finalityCheckedAt: string; acceptedBlockNumber: number | null; finalityMessage: string; createdAt: string; updatedAt: string }
type BusinessProfile = { ownerName: string; businessName: string; jobTitle: string; email: string; phone: string; emailVerifiedAt: string; updatedAt: string }
type AccountData = { walletAddress: string; profile: BusinessProfile; teams: SavedTeam[]; payRuns: SavedPayRun[]; bankPayouts: PaycrestOrderSummary[]; treasuryShields: TreasuryShieldRecord[]; passkeys: { credentialId: string; deviceType: string; backedUp: boolean; prfCapable: boolean; createdAt: string; lastUsedAt: string }[]; recoveryReady: boolean; encryptedWalletBackup: { available: true; updatedAt: string } | null; createdAt: string; updatedAt: string }
type ProductSection = 'overview' | 'workers' | 'payroll' | 'activity' | 'providers' | 'settings' | 'lab'
type Theme = 'light' | 'dark'

function readableError(reason: unknown) {
  if (reason instanceof Error) return reason.message
  if (reason && typeof reason === 'object' && 'message' in reason) return String(reason.message)
  return String(reason || 'Unknown error')
}

function privateBalanceError(reason: unknown) {
  const message = readableError(reason)
  if (/NOT_REGISTERED/i.test(message)) return 'Your private balance is not ready yet. Open Ready X, shield USDC, then check again.'
  if (/USER_REFUSED_OP/i.test(message)) return 'Request cancelled in Ready.'
  if (/API_VERSION_NOT_SUPPORTED/i.test(message)) return 'Ready does not support the requested STRK20 API version.'
  return `Could not read private USDC: ${message}`
}

function privacyActionError(reason: unknown) {
  const message = readableError(reason)
  if (/SCREEN|SANCTION|COMPLIANCE|POLICY/i.test(message)) return 'The wallet screening check did not approve this request. Nothing was submitted.'
  if (/INSUFFICIENT|NOT ENOUGH|BALANCE.*LOW/i.test(message)) return 'The wallet reports insufficient public USDC or fee allowance. Review the current fee shown in the wallet, reduce the shield amount, or add public funds.'
  if (/USER_REFUSED|USER_REJECTED|rejected by user|cancelled/i.test(message)) return 'Wallet approval was cancelled. Nothing was submitted.'
  if (/NOT_REGISTERED/i.test(message)) return 'This wallet has no shielded STRK20 account yet. Shield USDC first.'
  if (/API_VERSION_NOT_SUPPORTED|not support.*STRK20/i.test(message)) return 'This wallet does not support the required STRK20 privacy API.'
  return message
}

function transactionLabel(result: unknown) {
  if (!result || typeof result !== 'object') return 'Payment submitted. Paycrest is confirming the deposit.'
  const record = result as Record<string, unknown>
  const value = record.transaction_hash ?? record.transactionHash ?? record.tx_hash ?? record.txHash
  return value ? `Payment submitted. Transaction ${String(value)} is waiting for Paycrest confirmation.` : 'Payment submitted. Paycrest is confirming the deposit.'
}

function transactionHashFrom(result: unknown) {
  if (!result || typeof result !== 'object') return ''
  const record = result as Record<string, unknown>
  return String(record.transaction_hash ?? record.transactionHash ?? record.tx_hash ?? record.txHash ?? '').trim()
}

const payoutStatusLabels: Record<Phase0Order['displayStatus'], string> = {
  'ready-to-pay': 'Ready to pay', 'payment-submitted': 'Payment submitted', 'awaiting-paycrest-detection': 'Awaiting Paycrest detection',
  'reconciliation-required': 'Reconciliation required', refunding: 'Refunding', refunded: 'Refunded', completed: 'Completed',
  'payment-window-closed': 'Payment window closed', 'payment-failed': 'Payment failed',
}

export function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = window.localStorage.getItem('kudiroll-theme')
      if (saved === 'light' || saved === 'dark') return saved
    } catch {}
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [section, setSection] = useState<ProductSection>(() => {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return 'overview'
    const requested = new URLSearchParams(window.location.search).get('section') as ProductSection | null
    return requested && ['overview', 'workers', 'payroll', 'activity', 'providers', 'settings', 'lab'].includes(requested) ? requested : 'overview'
  })
  const previewMode = ['127.0.0.1', 'localhost'].includes(window.location.hostname) && (new URLSearchParams(window.location.search).has('preview') || new URLSearchParams(window.location.search).has('section'))
  const [enteredApp, setEnteredApp] = useState(previewMode)
  const [sessionStatus, setSessionStatus] = useState<'checking' | 'signed-in' | 'signed-out' | 'error'>(previewMode ? 'signed-in' : 'checking')
  const [sessionError, setSessionError] = useState('')
  const [legalView, setLegalView] = useState<'terms' | 'privacy' | null>(null)
  const [publicProbe, setPublicProbe] = useState<PublicProbe | null>(null)
  const [probeError, setProbeError] = useState('')
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null)
  const [walletChoices, setWalletChoices] = useState<WalletWithStarknetFeatures[]>([])
  const [accountData, setAccountData] = useState<AccountData | null>(null)
  const [walletVersions, setWalletVersions] = useState<string[]>([])
  const [privateBalance, setPrivateBalance] = useState('Not checked')
  const [privateBalanceUsdc, setPrivateBalanceUsdc] = useState<number | null>(null)
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [institutionError, setInstitutionError] = useState('')
  const [bankCode, setBankCode] = useState('')
  const [accountIdentifier, setAccountIdentifier] = useState('')
  const [verifiedAccount, setVerifiedAccount] = useState<VerifiedAccount | null>(null)
  const [amountNgn, setAmountNgn] = useState('1000')
  const [order, setOrder] = useState<Phase0Order | null>(null)
  const [orderError, setOrderError] = useState('')
  const [paycrestOrders, setPaycrestOrders] = useState<PaycrestOrderSummary[]>([])
  const [orderHistoryError, setOrderHistoryError] = useState('')
  const [recoveryOrderId, setRecoveryOrderId] = useState('')
  const [recoveryTransactionHash, setRecoveryTransactionHash] = useState('')
  const [paycrestConfigured, setPaycrestConfigured] = useState<boolean | null>(null)
  const [liveOrdersEnabled, setLiveOrdersEnabled] = useState(false)
  const [simulationState, setSimulationState] = useState<'idle' | 'passed' | 'failed' | 'submitted'>('idle')
  const [simulationMessage, setSimulationMessage] = useState('Create a verified Paycrest order to begin.')
  const [busy, setBusy] = useState('')
  const [now, setNow] = useState(Date.now())
  const [shieldAmount, setShieldAmount] = useState('1')
  const [shieldState, setShieldState] = useState<'idle' | 'passed' | 'submitted' | 'failed'>('idle')
  const [shieldMessage, setShieldMessage] = useState('Simulate first. Shielding then requires a public token approval and a public pool deposit in your wallet.')
  const [shieldTransactionHash, setShieldTransactionHash] = useState('')
  const [treasuryReadiness, setTreasuryReadiness] = useState<TreasuryReadiness | null>(null)
  const [treasuryError, setTreasuryError] = useState('')
  const [emailDeliveryConfigured, setEmailDeliveryConfigured] = useState(false)
  const [emailAddress, setEmailAddress] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [emailAuthStep, setEmailAuthStep] = useState<'request' | 'verify' | 'link' | 'secure'>('request')
  const [emailAuthNotice, setEmailAuthNotice] = useState('')
  const [pendingEmailLink, setPendingEmailLink] = useState(false)

  const walletAddress = wallet?.address || accountData?.walletAddress || ''
  const accountFingerprint = `${bankCode}:${accountIdentifier}`
  const accountIsVerified = verifiedAccount?.fingerprint === accountFingerprint
  const trackedOrder = order ? paycrestOrders.find(item => item.id === order.id) || order : null
  const orderExpired = trackedOrder ? Date.parse(trackedOrder.validUntil) <= now && !trackedOrder.transactionHash : true
  const exactAmountCovered = trackedOrder && privateBalanceUsdc !== null ? Number(trackedOrder.amountUsdc) <= privateBalanceUsdc : false
  const currentOrderStatus = trackedOrder ? payoutStatusLabels[trackedOrder.displayStatus] : ''

  async function restoreSession() {
    if (previewMode) return
    setSessionStatus('checking')
    setSessionError('')
    try {
      const response = await fetch(kudiRailUrl('/api/account/me', import.meta.env.VITE_KUDIRAIL_API_URL), {
        cache: 'no-store',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      const data = await response.json().catch(() => null)
      if (response.status === 401) {
        setAccountData(null)
        setEnteredApp(false)
        setSessionStatus('signed-out')
        return
      }
      if (!response.ok) throw new Error(data?.error || `Session check returned HTTP ${response.status}.`)
      setAccountData(data.account)
      setEnteredApp(true)
      setSessionStatus('signed-in')
    } catch (error) {
      setSessionError(readableError(error))
      setSessionStatus('error')
    }
  }

  useEffect(() => { void restoreSession() }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    let stop = () => {}
    // Wallet discovery is optional on the public sign-in screen. Load it after
    // first paint, while every connection action remains capable of awaiting it.
    void import('./wallet-runtime').then(({ walletStore }) => {
      if (!active) return
      const update = (wallets: readonly WalletWithStarknetFeatures[]) => setWalletChoices([...wallets])
      update(walletStore.getWallets())
      const unsubscribe = walletStore.subscribe(update)
      const stopDiscovery = startInjectedWalletDiscovery(walletStore)
      stop = () => { stopDiscovery(); unsubscribe() }
    }).catch(() => {})
    return () => { active = false; stop() }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try { window.localStorage.setItem('kudiroll-theme', theme) } catch {}
  }, [theme])

  useEffect(() => {
    if (section === 'lab') {
      void localJson('/api/phase0/health').then(data => {
        const configured = data.paycrest?.apiConfigured === true
        setPaycrestConfigured(configured)
        setLiveOrdersEnabled(Boolean(data.liveOrdersEnabled))
        if (configured) void loadInstitutions()
        else {
          setInstitutions([])
          setInstitutionError('')
        }
      }).catch(() => {
        setPaycrestConfigured(false)
        setLiveOrdersEnabled(false)
      })
    }
    if (enteredApp && accountData && (section === 'overview' || section === 'activity' || section === 'lab')) void loadPaycrestOrders()
  }, [section, enteredApp, accountData?.walletAddress])

  useEffect(() => {
    if (!accountData?.walletAddress) {
      setTreasuryReadiness(null)
      return
    }
    void loadTreasuryReadiness()
  }, [accountData?.walletAddress])

  useEffect(() => {
    void localJson('/api/account/email/status').then(data => setEmailDeliveryConfigured(data.configured === true)).catch(() => setEmailDeliveryConfigured(false))
  }, [])

  useEffect(() => {
    if (!accountData?.walletAddress || !treasuryReadiness || !['submitted', 'maturing', 'unknown'].includes(treasuryReadiness.status)) return
    const timer = window.setInterval(() => void loadTreasuryReadiness(), 20_000)
    return () => window.clearInterval(timer)
  }, [accountData?.walletAddress, treasuryReadiness?.status])

  useEffect(() => {
    if (!accountData?.walletAddress || !paycrestOrders.some(item => !['completed', 'refunded', 'payment-failed', 'payment-window-closed'].includes(item.displayStatus))) return
    const timer = window.setInterval(() => void loadPaycrestOrders(), 15_000)
    return () => window.clearInterval(timer)
  }, [accountData?.walletAddress, paycrestOrders.map(item => `${item.id}:${item.displayStatus}:${item.chainStatus}`).join('|')])

  async function localJson(path: string, init: RequestInit = {}, attempts = 2) {
    let lastError: unknown
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 12_000)
      try {
        const response = await fetch(kudiRailUrl(path, import.meta.env.VITE_KUDIRAIL_API_URL), {
          ...init,
          cache: 'no-store',
          credentials: 'include',
          headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
          signal: controller.signal,
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || `Local API returned HTTP ${response.status}.`)
        return data
      } catch (error) {
        lastError = error
        if (attempt < attempts && (!init.method || init.method === 'GET')) await new Promise(resolve => window.setTimeout(resolve, 450))
        else break
      } finally {
        window.clearTimeout(timeout)
      }
    }
    throw new Error(`Could not complete the KudiRoll request. ${readableError(lastError)}`)
  }

  async function loadInstitutions() {
    setInstitutionError('')
    try {
      const data = await localJson('/api/phase0/paycrest/institutions')
      setInstitutions(Array.isArray(data.institutions) ? data.institutions : [])
    } catch (error) {
      setInstitutionError(readableError(error))
    }
  }

  async function loadPaycrestOrders() {
    setOrderHistoryError('')
    try {
      const data = await localJson('/api/phase0/paycrest/orders')
      setPaycrestConfigured(data.configured !== false)
      const orders = Array.isArray(data.orders) ? data.orders as PaycrestOrderSummary[] : []
      setPaycrestOrders(orders)
      setOrder(current => {
        const refreshed = current ? orders.find(item => item.id === current.id) : null
        const active = refreshed || (!current ? orders.find(item => !['completed', 'refunded', 'payment-failed', 'payment-window-closed'].includes(item.displayStatus)) : null)
        if (active?.transactionHash) {
          setSimulationState('submitted')
          setSimulationMessage(active.chainMessage || active.reconciliationReason || 'Payment submitted. KudiRail is tracking Starknet and Paycrest evidence.')
        }
        return active || current
      })
    } catch (error) {
      setOrderHistoryError(readableError(error))
    }
  }

  async function refreshHistory() {
    await Promise.all([refreshAccount(), loadTreasuryReadiness(), loadPaycrestOrders()])
  }

  async function probePaycrest() {
    setBusy('paycrest')
    setProbeError('')
    try {
      await localJson('/api/phase0/health')
      const data = await localJson('/api/phase0/paycrest/public') as PublicProbe
      setPublicProbe(data)
    } catch (error) {
      setPublicProbe(null)
      setProbeError(readableError(error))
    } finally {
      setBusy('')
    }
  }

  async function connectWallet(selectedWallet?: WalletWithStarknetFeatures): Promise<ConnectedWallet | null> {
    setBusy('wallet')
    try {
      const { connectStarknetWallet, walletStore } = await import('./wallet-runtime')
      walletStore._refreshInjectedWallets()
      const discoveredWallets = walletStore.getWallets()
      const choice = [selectedWallet, ...discoveredWallets, ...walletChoices]
        .find(candidate => candidate && /ready/i.test(candidate.name) && isConnectableStarknetWallet(candidate))
      if (!choice) throw new Error('Ready X was not detected. Install or unlock Ready X, then try again.')
      const connected = await withTimeout(
        connectStarknetWallet(choice),
        60_000,
        'Wallet connection timed out. Reopen the wallet and try again.',
      )
      requireStarknetMainnet(connected.chainId)
      if (accountData?.walletAddress && BigInt(connected.account.address) !== BigInt(accountData.walletAddress)) {
        throw new Error('This workspace belongs to a different Ready X account. Switch accounts in Ready X and try again.')
      }
      setWallet(connected.account)
      setWalletVersions(connected.supportedApiVersions)
      return connected.account
    } catch (error) {
      alert(readableError(error))
      return null
    } finally {
      setBusy('')
    }
  }

  async function signIn(selectedWallet?: WalletWithStarknetFeatures) {
    const connected = wallet || await connectWallet(selectedWallet)
    if (!connected) return
    const address = connected.address
    try {
      setBusy('account')
      const challenge = await accountJson('/api/account/challenge', { method: 'POST', body: JSON.stringify({ address }) })
      const rawSignature: unknown = await connected.signMessage(challenge.challenge.typedData)
      const signature = Array.isArray(rawSignature)
        ? rawSignature.map(String)
        : rawSignature && typeof rawSignature === 'object' && 'r' in rawSignature && 's' in rawSignature
          ? [String(rawSignature.r), String(rawSignature.s)]
          : []
      const session = await accountJson('/api/account/session', { method: 'POST', body: JSON.stringify({ address, nonce: challenge.challenge.nonce, signature }) })
      if (pendingEmailLink) {
        const linked = await accountJson('/api/account/email/link', { method: 'POST' })
        setAccountData(linked.account)
        setPendingEmailLink(false)
        setEmailAuthStep('secure')
        setEmailAuthNotice('Email verified and account linked. Secure this device to finish.')
      } else {
        setAccountData(session.account)
        setEnteredApp(true)
        setSessionStatus('signed-in')
      }
    } catch (error) {
      const message = readableError(error)
      alert(/timeout|timed out/i.test(message)
        ? 'Ready X connected, but the sign-in approval timed out. Open Ready X and click Continue with Ready X again; you do not need to reconnect.'
        : `Could not open your KudiRoll account. ${message}`)
    } finally {
      setBusy('')
    }
  }

  async function signInWithPasskey() {
    try {
      setBusy('passkey-signin')
      const request = await accountJson('/api/account/passkeys/authentication/options', { method: 'POST' })
      const response = await startAuthentication({ optionsJSON: request.options })
      const session = await accountJson('/api/account/passkeys/authentication/verify', { method: 'POST', body: JSON.stringify({ response }) })
      setAccountData(session.account)
      setEnteredApp(true)
      setSessionStatus('signed-in')
    } catch (error) {
      alert(`Could not sign in with this passkey. ${readableError(error)}`)
    } finally {
      setBusy('')
    }
  }

  async function requestEmailSignIn() {
    try {
      setBusy('email-request')
      setEmailAuthNotice('')
      await accountJson('/api/account/email/authentication/request', { method: 'POST', body: JSON.stringify({ email: emailAddress }) })
      setEmailCode('')
      setEmailAuthStep('verify')
      setEmailAuthNotice('We sent a six-digit code. It expires in 10 minutes.')
    } catch (error) {
      setEmailAuthNotice(readableError(error))
    } finally {
      setBusy('')
    }
  }

  async function verifyEmailSignIn() {
    try {
      setBusy('email-verify')
      setEmailAuthNotice('')
      const result = await accountJson('/api/account/email/authentication/verify', { method: 'POST', body: JSON.stringify({ code: emailCode }) })
      if (result.mode === 'signin') {
        setAccountData(result.account)
        if (result.account?.passkeys?.length) setEnteredApp(true)
        else {
          setEmailAuthStep('secure')
          setEmailAuthNotice('Email verified. Secure this device before continuing.')
        }
      } else {
        setPendingEmailLink(true)
        setEmailAuthStep('link')
        setEmailAuthNotice('Email verified. Link the Starknet account you want KudiRoll to use.')
      }
    } catch (error) {
      setEmailAuthNotice(readableError(error))
    } finally {
      setBusy('')
    }
  }

  async function createPasskey() {
    let prfSecret: Uint8Array | null = null
    try {
      setBusy('passkey-register')
      const request = await accountJson('/api/account/passkeys/registration/options', { method: 'POST' })
      const response = await startRegistration({ optionsJSON: requestPasskeyPrf(request.options, decodePasskeyPrfInput(request.prfInput)) as any })
      const extracted = splitPasskeyPrf(response)
      prfSecret = extracted.prfSecret
      const result = await accountJson('/api/account/passkeys/registration/verify', { method: 'POST', body: JSON.stringify({ response: extracted.verificationResponse, prfCapable: Boolean(prfSecret) }) })
      setAccountData(result.account)
      alert(prfSecret ? 'Passkey created and verified for private-wallet recovery.' : 'Passkey created for sign-in, but this authenticator did not expose the PRF required for private-wallet recovery.')
      return true
    } catch (error) {
      alert(`Could not create the passkey. ${readableError(error)}`)
      return false
    } finally {
      prfSecret?.fill(0)
      setBusy('')
    }
  }

  async function registerPasskey() {
    await createPasskey()
  }

  async function secureEmailAccount() {
    if (await createPasskey()) {
      setEmailAuthStep('request')
      setEmailAuthNotice('')
      setEnteredApp(true)
      setSessionStatus('signed-in')
    }
  }

  async function verifyPasskeyPrf(credentialId: string) {
    let prfSecret: Uint8Array | null = null
    try {
      setBusy('passkey-prf')
      const request = await accountJson('/api/account/passkeys/prf/options', { method: 'POST', body: JSON.stringify({ credentialId }) })
      const response = await startAuthentication({ optionsJSON: requestPasskeyPrf(request.options, decodePasskeyPrfInput(request.prfInput)) as any })
      const extracted = splitPasskeyPrf(response)
      prfSecret = extracted.prfSecret
      const result = await accountJson('/api/account/passkeys/prf/verify', { method: 'POST', body: JSON.stringify({ response: extracted.verificationResponse, prfCapable: Boolean(prfSecret) }) })
      setAccountData(result.account)
      alert('This passkey is verified for private-wallet recovery.')
    } catch (error) {
      alert(`Could not verify this recovery passkey. ${readableError(error)}`)
    } finally {
      prfSecret?.fill(0)
      setBusy('')
    }
  }

  async function revokePasskey(credentialId: string) {
    if (!window.confirm('Revoke this passkey? A different recovery passkey must approve the change.')) return
    try {
      setBusy('passkey-revoke')
      const request = await accountJson('/api/account/passkeys/revocation/options', { method: 'POST', body: JSON.stringify({ credentialId }) })
      const response = await startAuthentication({ optionsJSON: request.options })
      const result = await accountJson('/api/account/passkeys/revocation/verify', { method: 'POST', body: JSON.stringify({ response }) })
      setAccountData(result.account)
      alert('Passkey revoked. Sessions created by that credential were invalidated.')
    } catch (error) {
      alert(`Could not revoke the passkey. ${readableError(error)}`)
    } finally {
      setBusy('')
    }
  }

  async function accountJson(path: string, init: RequestInit = {}) {
    const response = await fetch(kudiRailUrl(path, import.meta.env.VITE_KUDIRAIL_API_URL), {
      ...init,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.error || `Account request returned HTTP ${response.status}.`)
    return data
  }

  async function refreshAccount() {
    const data = await accountJson('/api/account/me')
    setAccountData(data.account)
  }

  async function loadTreasuryReadiness() {
    setTreasuryError('')
    try {
      const data = await accountJson('/api/account/treasury/readiness')
      const readiness = data.readiness as TreasuryReadiness
      setTreasuryReadiness(readiness)
      if (readiness.shield?.transactionHash) {
        setShieldTransactionHash(readiness.shield.transactionHash)
        setShieldState(readiness.status === 'reverted' || readiness.status === 'unknown' ? 'failed' : 'submitted')
        setShieldMessage(readiness.message)
      }
    } catch (error) {
      setTreasuryError(readableError(error))
    }
  }

  async function mutateAccount(path: string, init: RequestInit) {
    const result = await accountJson(path, init)
    await refreshAccount()
    return result
  }

  async function leaveWallet() {
    await accountJson('/api/account/session', { method: 'DELETE' }).catch(() => undefined)
    const disconnectFeature = wallet?.walletProvider.features['standard:disconnect']
    if (disconnectFeature) await disconnectFeature.disconnect().catch(() => undefined)
    setWallet(null)
    setWalletVersions([])
    setPrivateBalance('Not checked')
    setPrivateBalanceUsdc(null)
    setAccountData(null)
    setTreasuryReadiness(null)
    setTreasuryError('')
    resetOrder()
    setEnteredApp(false)
    setSessionStatus('signed-out')
  }

  async function deleteKudiRollAccount(confirmation: string) {
    const result = await accountJson('/api/account', { method: 'DELETE', body: JSON.stringify({ confirmation }) })
    await leaveWallet()
    return result
  }

  async function checkBalance() {
    if (!wallet) return
    if (!supportsStrk20Api(walletVersions)) {
      setPrivateBalanceUsdc(null)
      setPrivateBalance('This wallet does not advertise the Ready STRK20 private-payroll API.')
      return
    }
    setBusy('balance')
    try {
      const balances = await withTimeout(readPrivateUsdcBalance(wallet), 60_000)
      const units = BigInt(balances[0]?.balance || '0x0')
      const value = Number(units) / 1_000_000
      setPrivateBalanceUsdc(value)
      setPrivateBalance(`${value} USDC`)
    } catch (error) {
      setPrivateBalanceUsdc(null)
      setPrivateBalance(privateBalanceError(error))
    } finally {
      setBusy('')
    }
  }

  async function simulateShield() {
    if (!wallet || !supportsStrk20Api(walletVersions)) {
      setShieldState('failed')
      setShieldMessage('Connect Ready X or another wallet that advertises STRK20 Wallet API 0.10.3 or newer.')
      return
    }
    setBusy('simulate-shield')
    setShieldTransactionHash('')
    try {
      await withTimeout(simulateUsdcShield(wallet, shieldAmount), 90_000)
      setShieldState('passed')
      setShieldMessage('Preview complete. No funds moved. Ready X will show the public token approval and pool deposit before anything is submitted.')
    } catch (error) {
      setShieldState('failed')
      setShieldMessage(privacyActionError(error))
    } finally {
      setBusy('')
    }
  }

  async function shieldUsdc() {
    if (!wallet || shieldState !== 'passed') return
    setBusy('submit-shield')
    try {
      const result = await withTimeout(submitUsdcShield(wallet, shieldAmount), 180_000, 'The wallet did not return before timeout. Check your wallet and Starkscan before retrying; the transaction may still have been submitted.')
      await accountJson('/api/account/treasury/shields', { method: 'POST', body: JSON.stringify({ transactionHash: result.transaction_hash, amountUsdc: shieldAmount }) })
      await refreshAccount()
      setShieldState('submitted')
      setShieldTransactionHash(result.transaction_hash)
      setShieldMessage('Shield transaction submitted. KudiRoll is checking Starknet finality and the required 10-block maturity window.')
      await loadTreasuryReadiness()
    } catch (error) {
      setShieldState('failed')
      setShieldMessage(privacyActionError(error))
    } finally {
      setBusy('')
    }
  }

  function resetOrder() {
    setOrder(null)
    setOrderError('')
    setSimulationState('idle')
    setSimulationMessage('Create a verified Paycrest order to begin.')
  }

  function changeBank(value: string) {
    setBankCode(value)
    setVerifiedAccount(null)
    resetOrder()
  }

  function changeAccount(value: string) {
    setAccountIdentifier(value.replace(/\D/g, '').slice(0, 10))
    setVerifiedAccount(null)
    resetOrder()
  }

  async function verifyAccount() {
    setBusy('verify-account')
    setOrderError('')
    try {
      const fingerprint = accountFingerprint
      const data = await localJson('/api/phase0/paycrest/verify-account', {
        method: 'POST',
        body: JSON.stringify({ institution: bankCode, accountIdentifier }),
      }, 1)
      setVerifiedAccount({ accountName: String(data.account.accountName), fingerprint })
    } catch (error) {
      setVerifiedAccount(null)
      setOrderError(readableError(error))
    } finally {
      setBusy('')
    }
  }

  async function createOrder() {
    if (!liveOrdersEnabled) return setOrderError('Live Paycrest order creation is locked while the Starknet settlement route is uncertified.')
    if (!wallet || !walletAddress || !accountIsVerified || privateBalanceUsdc === null) return
    setBusy('create-order')
    setOrderError('')
    try {
      let probe = publicProbe
      if (!probe?.quote?.rate) {
        probe = await localJson('/api/phase0/paycrest/public') as PublicProbe
        setPublicProbe(probe)
      }
      const estimatedUsdc = Number(amountNgn) / Number(probe.quote?.rate || 0)
      if (!Number.isFinite(estimatedUsdc) || estimatedUsdc * 1.1 > privateBalanceUsdc) {
        throw new Error('This payout may exceed your private USDC after fees. Reduce the Naira amount or shield more USDC.')
      }
      const data = await localJson('/api/phase0/paycrest/order', {
        method: 'POST',
        body: JSON.stringify({
          amountNgn,
          institution: bankCode,
          accountIdentifier,
          refundAddress: walletAddress,
          memo: 'KudiRoll payout',
        }),
      }, 1)
      const next = data.order as Phase0Order
      setOrder(next)
      void loadPaycrestOrders()
      setNow(Date.now())
      setSimulationState('idle')
      setSimulationMessage('Order created. Preview the exact payment before approving it.')
      if (Number(next.amountUsdc) > privateBalanceUsdc) {
        setOrderError('Paycrest created the order, but its exact USDC total exceeds your current private balance. Do not pay this order.')
      }
    } catch (error) {
      setOrderError(readableError(error))
    } finally {
      setBusy('')
    }
  }

  async function simulate() {
    if (!wallet || !trackedOrder) return
    setBusy('simulate')
    setSimulationState('idle')
    try {
      if (Date.parse(trackedOrder.validUntil) <= Date.now()) throw new Error('This Paycrest payment window has closed. Create a fresh order.')
      if (!exactAmountCovered) throw new Error('The exact order amount exceeds the last checked private USDC balance.')
      await withTimeout(simulatePaycrestWithdraw(wallet, trackedOrder.receiveAddress, trackedOrder.amountUsdc), 90_000)
      setSimulationState('passed')
      setSimulationMessage('Preview complete. No funds moved. Review the details, then approve the payment in Ready X.')
    } catch (error) {
      setSimulationState('failed')
      setSimulationMessage(`Simulation rejected: ${readableError(error)}`)
    } finally {
      setBusy('')
    }
  }

  async function submit() {
    if (!wallet || !trackedOrder || simulationState !== 'passed') return
    setBusy('submit')
    let submittedHash = ''
    try {
      if (Date.parse(trackedOrder.validUntil) <= Date.now()) throw new Error('This Paycrest payment window closed before approval. Do not send to it.')
      await localJson(`/api/phase0/paycrest/orders/${encodeURIComponent(trackedOrder.id)}/submission`, { method: 'POST', body: JSON.stringify({ state: 'submitting' }) }, 1)
      const result = await withTimeout(submitPaycrestWithdraw(wallet, trackedOrder.receiveAddress, trackedOrder.amountUsdc), 180_000, 'The wallet outcome is unknown after three minutes. Do not submit again; check Ready activity first.')
      const transactionHash = transactionHashFrom(result)
      if (!transactionHash) throw new Error('The wallet outcome is unknown because Ready returned no transaction hash. Do not submit again; check Ready activity first.')
      submittedHash = transactionHash
      await localJson(`/api/phase0/paycrest/orders/${encodeURIComponent(trackedOrder.id)}/submission`, { method: 'POST', body: JSON.stringify({ transactionHash }) }, 1)
      setSimulationState('submitted')
      setSimulationMessage(transactionLabel(result))
      await loadPaycrestOrders()
    } catch (error) {
      const message = privacyActionError(error)
      const cancelled = /cancelled|USER_REFUSED|USER_REJECTED|rejected by user/i.test(readableError(error))
      if (trackedOrder) await localJson(`/api/phase0/paycrest/orders/${encodeURIComponent(trackedOrder.id)}/submission`, { method: 'POST', body: JSON.stringify({ state: cancelled ? 'cancelled' : 'unknown' }) }, 1).catch(() => null)
      setSimulationState(cancelled ? 'failed' : 'submitted')
      setSimulationMessage(cancelled ? message : `${message}${submittedHash ? ` Ready returned transaction ${submittedHash}.` : ''} KudiRail has blocked duplicate payment until this attempt is reconciled.`)
      void loadPaycrestOrders()
    } finally {
      setBusy('')
    }
  }

  async function reconcilePayout(orderId: string) {
    setBusy(`reconcile:${orderId}`)
    try {
      await localJson(`/api/phase0/paycrest/orders/${encodeURIComponent(orderId)}/reconcile`, { method: 'POST' }, 1)
      await loadPaycrestOrders()
    } catch (error) {
      setOrderError(`Could not reconcile this payment. ${readableError(error)}`)
    } finally { setBusy('') }
  }

  async function exportPayoutEvidence(orderId: string) {
    setBusy(`evidence:${orderId}`)
    try {
      const response = await fetch(kudiRailUrl(`/api/phase0/paycrest/orders/${encodeURIComponent(orderId)}/evidence`, import.meta.env.VITE_KUDIRAIL_API_URL), { credentials: 'include', cache: 'no-store' })
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || `HTTP ${response.status}`)
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `kudirail-paycrest-${orderId}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setOrderError(`Could not export incident evidence. ${readableError(error)}`)
    } finally { setBusy('') }
  }

  async function recoverEarlierPayout() {
    setBusy('recover-payout')
    setOrderError('')
    try {
      const result = await localJson('/api/phase0/paycrest/orders/recover', {
        method: 'POST',
        body: JSON.stringify({ orderId: recoveryOrderId.trim(), transactionHash: recoveryTransactionHash.trim() }),
      }, 1)
      setOrder(result.payout)
      setSimulationState('submitted')
      setSimulationMessage(result.payout?.reconciliationReason || result.payout?.chainMessage || 'Earlier payment recovered into KudiRail.')
      setRecoveryOrderId('')
      setRecoveryTransactionHash('')
      await loadPaycrestOrders()
    } catch (error) {
      setOrderError(`Could not recover this payment. ${readableError(error)}`)
    } finally { setBusy('') }
  }

  if (!enteredApp && (sessionStatus === 'checking' || sessionStatus === 'error')) {
    return <SessionGate theme={theme} error={sessionStatus === 'error' ? sessionError : ''} onRetry={restoreSession} onToggleTheme={() => setTheme(current => current === 'light' ? 'dark' : 'light')} />
  }

  if (!enteredApp) {
    return <SignInLanding
      theme={theme}
      busy={Boolean(busy)}
      wallets={walletChoices}
      legalView={legalView}
      onPasskeySignIn={signInWithPasskey}
      onRefreshWallets={() => { void import('./wallet-runtime').then(({ walletStore }) => walletStore._refreshInjectedWallets()) }}
      onSignIn={signIn}
      onOpenLegal={setLegalView}
      onCloseLegal={() => setLegalView(null)}
      onToggleTheme={() => setTheme(current => current === 'light' ? 'dark' : 'light')}
    />
  }

  const paycrestPilot = <div className="sectionStack paycrestPilot">
    <section className="panel sectionIntro">
      <div><span className="panelKicker">Bank payout</span><h2>Pay a Nigerian bank account</h2><p>Verify the recipient, check the current rate, and review the exact private USDC payment before Ready asks for approval.</p></div>
      <span className={`statePill ${liveOrdersEnabled ? 'safe' : 'neutral'}`}>{liveOrdersEnabled ? 'Live' : 'Unavailable'}</span>
    </section>

    <section className="pilotReadiness">
      <article><span>Paycrest quote</span><strong>{publicProbe?.quote ? `₦${publicProbe.quote.rate} / USDC` : 'Not checked'}</strong><button className="plainButton" onClick={probePaycrest} disabled={Boolean(busy)}>{busy === 'paycrest' ? 'Checking…' : 'Refresh quote'}</button></article>
      <article><span>Private balance</span><strong>{privateBalanceUsdc === null ? 'Not checked' : `${privateBalanceUsdc} USDC`}</strong><button className="plainButton" onClick={checkBalance} disabled={Boolean(busy)}>{busy === 'balance' ? 'Checking…' : 'Check balance'}</button></article>
      <article><span>Settlement route</span><strong>Starknet → NGN</strong><small>Paycrest bank payout</small></article>
    </section>
    {(probeError || publicProbe?.warning) && <div className="inlineError">{probeError || publicProbe?.warning}</div>}

    <section className="panel payoutComposer">
      <div className="flowSteps"><span className={accountIsVerified ? 'done' : 'active'}>1 Recipient</span><span className={order ? 'done' : accountIsVerified ? 'active' : ''}>2 Order</span><span className={simulationState === 'passed' || simulationState === 'submitted' ? 'done' : order ? 'active' : ''}>3 Wallet check</span><span className={simulationState === 'submitted' ? 'done' : simulationState === 'passed' ? 'active' : ''}>4 Approve</span></div>
      {!liveOrdersEnabled && <div className="routeNotice"><strong>Read-only demo</strong><span>{paycrestConfigured === false ? 'Paycrest production credentials are not configured yet.' : 'Creating another order is disabled until the production settlement check is complete.'}</span></div>}
      <div className="formGrid">
        <label>Bank<select value={bankCode} onChange={event => changeBank(event.target.value)} disabled={paycrestConfigured === false || Boolean(busy) || Boolean(order)}><option value="">{paycrestConfigured === false ? 'Unavailable' : institutionError ? 'Banks unavailable' : institutions.length ? 'Select bank' : 'Loading banks…'}</option>{institutions.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
        <label>Account number<input value={accountIdentifier} onChange={event => changeAccount(event.target.value)} inputMode="numeric" autoComplete="off" placeholder="10 digits" disabled={Boolean(busy) || Boolean(order)} /></label>
        <div className="fieldAction"><button className="secondary" onClick={verifyAccount} disabled={Boolean(busy) || !bankCode || accountIdentifier.length !== 10 || Boolean(order)}>{busy === 'verify-account' ? 'Verifying…' : accountIsVerified ? 'Verified' : 'Verify account'}</button></div>
      </div>
      {institutionError && <div className="inlineError">{institutionError} <button className="textButton" onClick={loadInstitutions}>Retry</button></div>}
      {accountIsVerified && <div className="verifiedBox"><span>Verified recipient</span><strong>{verifiedAccount.accountName}</strong><small>{institutions.find(item => item.code === bankCode)?.name} · account ending {accountIdentifier.slice(-4)}</small></div>}
      <div className="orderGate">
        <label>Amount to receive<input value={amountNgn} onChange={event => { setAmountNgn(event.target.value.replace(/[^\d.]/g, '')); resetOrder() }} inputMode="decimal" disabled={Boolean(order)} /><small>NGN</small></label>
        <button onClick={createOrder} disabled={!liveOrdersEnabled || Boolean(busy) || !wallet || privateBalanceUsdc === null || !accountIsVerified || Boolean(order)}>{liveOrdersEnabled ? busy === 'create-order' ? 'Creating order…' : 'Continue to payment' : 'Payout unavailable'}</button>
      </div>
      {orderError && <div className="errorBox"><strong>Could not continue</strong><span>{orderError}</span></div>}
      {!trackedOrder && <details className="shieldDetails"><summary>Recover an earlier wallet payment</summary><div className="formGrid"><label>Paycrest order ID<input value={recoveryOrderId} onChange={event => setRecoveryOrderId(event.target.value)} autoComplete="off" /></label><label>Starknet transaction hash<input value={recoveryTransactionHash} onChange={event => setRecoveryTransactionHash(event.target.value)} autoComplete="off" /></label><div className="fieldAction"><button className="secondary" onClick={recoverEarlierPayout} disabled={Boolean(busy) || !recoveryOrderId.trim() || !/^0x[0-9a-fA-F]{1,64}$/.test(recoveryTransactionHash.trim())}>{busy === 'recover-payout' ? 'Recovering...' : 'Recover payment'}</button></div></div><p>KudiRail verifies that the order belongs to this signed-in Starknet account, then compares the exact wallet transaction with Paycrest.</p></details>}
      {trackedOrder && <PayoutReceipt order={trackedOrder} status={currentOrderStatus} busy={busy} orderExpired={orderExpired} exactAmountCovered={exactAmountCovered} simulationState={simulationState} onSimulate={simulate} onReconcile={reconcilePayout} onExport={exportPayoutEvidence} onClose={resetOrder} />}
      {trackedOrder && <div className={`simulation ${simulationState}`}><strong>{trackedOrder.displayStatus === 'reconciliation-required' ? 'Provider reconciliation needed' : simulationState === 'passed' ? 'Payment ready' : trackedOrder.transactionHash ? currentOrderStatus : 'Payment preview'}</strong><span>{trackedOrder.reconciliationReason || trackedOrder.chainMessage || simulationMessage}</span></div>}
      {simulationState === 'passed' && trackedOrder && !trackedOrder.transactionHash && <section className="paymentApproval" aria-label="Approve bank payout"><div><span>Final review</span><strong>Pay {trackedOrder.amountUsdc} USDC</strong><p>{trackedOrder.accountName} receives ₦{trackedOrder.amountNgn}. Ready X will show the final wallet approval; cancelling it sends nothing.</p></div><button onClick={submit} disabled={Boolean(busy) || orderExpired}>{busy === 'submit' ? 'Waiting for approval…' : 'Approve in Ready X'}</button></section>}
    </section>
  </div>

  const readinessLabel = treasuryReadiness?.status === 'ready' ? 'Payroll ready' : treasuryReadiness?.status === 'maturing' ? treasuryReadiness.blocksRemaining + ' blocks left' : treasuryReadiness?.status === 'submitted' ? 'Awaiting finality' : treasuryReadiness?.status === 'reverted' ? 'Reverted' : treasuryReadiness?.status === 'unknown' ? 'Verification delayed' : 'Not funded'
  const shieldPanel = <section className="panel shieldPanel">
    <div className="panelTitle"><div><span>Payroll funds</span><h3>Add private USDC</h3></div><span className={'statePill ' + (treasuryReadiness?.status === 'ready' ? 'safe' : treasuryReadiness?.status === 'reverted' || treasuryReadiness?.status === 'unknown' || shieldState === 'failed' ? 'blocked' : 'neutral')}>{readinessLabel}</span></div>
    <p className="shieldDisclosure">Funding is a public onchain transaction. Payroll becomes private after the deposit is confirmed.</p>
    <details className="shieldDetails"><summary>How funding works</summary><div className="shieldSteps"><div><strong>1</strong><span>Approve USDC</span></div><div><strong>2</strong><span>Deposit funds</span></div><div><strong>3</strong><span>Wait for confirmation</span></div></div><p>Ready X shows the current network and pool fees before you approve.</p></details>
    <div className="treasuryTracker"><div><span>Status</span><strong>{treasuryReadiness?.message || 'No funding transaction is being tracked.'}</strong></div><button className="plainButton" onClick={loadTreasuryReadiness} disabled={!accountData || Boolean(busy)}>Refresh</button></div>
    {treasuryError && <div className="inlineError">{treasuryError}</div>}
    <div className="shieldControls"><label>Amount<input value={shieldAmount} onChange={event => { setShieldAmount(event.target.value.replace(/[^\d.]/g, '')); setShieldState('idle') }} inputMode="decimal" placeholder="1.00" /><small>USDC</small></label><button onClick={simulateShield} disabled={!wallet || Boolean(busy)}>{busy === 'simulate-shield' ? 'Opening preview…' : 'Preview funding'}</button></div>
    {shieldState !== 'idle' && <div className={'simulation ' + shieldState}><strong>{shieldState === 'passed' ? 'Ready to fund' : shieldState === 'submitted' ? 'Funding submitted' : 'Funding needs attention'}</strong><span>{shieldMessage}</span>{shieldTransactionHash && <a href={'https://starkscan.co/tx/' + shieldTransactionHash} target="_blank" rel="noreferrer">Open transaction on Starkscan</a>}</div>}
    {shieldState === 'passed' && <div className="shieldApproval"><span>Ready X will request the required USDC approvals. Cancelling sends nothing.</span><button onClick={shieldUsdc} disabled={Boolean(busy)}>{busy === 'submit-shield' ? 'Waiting for approval…' : 'Fund ' + (shieldAmount || '0') + ' USDC'}</button></div>}
  </section>

  return <ProductShell
    theme={theme}
    section={section}
    onSection={setSection}
    wallet={wallet}
    walletAddress={walletAddress}
    walletVersions={walletVersions}
    privateBalance={privateBalance}
    privateBalanceUsdc={privateBalanceUsdc}
    busy={busy}
    paycrestOrders={paycrestOrders}
    paycrestConfigured={paycrestConfigured}
    liveOrdersEnabled={liveOrdersEnabled}
    orderHistoryError={orderHistoryError}
    paycrestPilot={paycrestPilot}
    shieldPanel={shieldPanel}
    treasuryReadiness={treasuryReadiness}
    accountData={accountData}
    emailDeliveryConfigured={emailDeliveryConfigured}
    onMutateAccount={mutateAccount}
    onRefreshOrders={loadPaycrestOrders}
    onRefreshHistory={refreshHistory}
    onReconcilePayout={reconcilePayout}
    onExportPayoutEvidence={exportPayoutEvidence}
    onConnect={connectWallet}
    onReadBalance={checkBalance}
    onDisconnect={leaveWallet}
    onDeleteAccount={deleteKudiRollAccount}
    onRegisterPasskey={registerPasskey}
    onVerifyPasskeyPrf={verifyPasskeyPrf}
    onRevokePasskey={revokePasskey}
    onToggleTheme={() => setTheme(current => current === 'light' ? 'dark' : 'light')}
  />
}

function SessionGate({ theme, error, onRetry, onToggleTheme }: { theme: Theme; error: string; onRetry: () => void; onToggleTheme: () => void }) {
  return <div className="sessionGate">
    <ThemeToggle theme={theme} onToggle={onToggleTheme} className="signInThemeToggle" />
    <div className="sessionCard">
      <img src="/kudiroll-mark.svg" alt="" />
      <strong>KudiRoll</strong>
      {error ? <><h1>We could not restore your workspace</h1><p>{error}</p><button onClick={onRetry}><ArrowPathIcon aria-hidden="true" /> Try again</button></> : <><LoadingRing /><p>Opening your workspace…</p></>}
    </div>
  </div>
}

function SignInLanding({
  theme,
  busy,
  wallets,
  legalView,
  onPasskeySignIn,
  onRefreshWallets,
  onSignIn,
  onOpenLegal,
  onCloseLegal,
  onToggleTheme,
}: {
  theme: Theme
  busy: boolean
  wallets: WalletWithStarknetFeatures[]
  legalView: 'terms' | 'privacy' | null
  onPasskeySignIn: () => void
  onRefreshWallets: () => void
  onSignIn: (wallet?: WalletWithStarknetFeatures) => void
  onOpenLegal: (view: 'terms' | 'privacy') => void
  onCloseLegal: () => void
  onToggleTheme: () => void
}) {
  const legalContent = legalView === 'terms'
    ? {
        title: 'Terms of use',
        body: 'Use KudiRoll only for payouts you are authorized to manage. You remain responsible for reviewing recipients, amounts, and wallet approvals. KudiRoll does not custody funds, and blockchain transactions cannot normally be reversed.',
      }
    : {
        title: 'Privacy',
        body: 'KudiRoll saves team names, worker names, Starknet addresses, default amounts, and pay-run records to your wallet-secured account. KudiRoll never asks for or stores wallet private keys, viewing keys, proofs, OTPs, recovery phrases, or bank details.',
      }
  const readyWallets = wallets.filter(candidate => /ready/i.test(candidate.name) && isConnectableStarknetWallet(candidate))

  return <div className="signInGate">
    <div className="signInBackdrop" aria-hidden="true" />
    <ThemeToggle theme={theme} onToggle={onToggleTheme} className="signInThemeToggle" />
    <main className="signInMain">
      <section className="signInStory" aria-label="KudiRoll private payroll">
        <div className="signInBrand"><img src="/kudiroll-mark.svg" alt="" /><strong>KudiRoll</strong></div>
        <div className="signInStoryCopy">
          <span>Private payroll for modern teams</span>
          <h2>Pay your people.<br />Keep payroll private.</h2>
          <p>Prepare team payments, review every amount, and use private USDC from one secure Starknet workspace.</p>
        </div>
        <div className="signInTrust">Self-custodial Starknet payroll</div>
      </section>

      <section className="signInCard" aria-labelledby="sign-in-title">
        <div className="signInCardTop"><span>Welcome back</span></div>
        <h1 id="sign-in-title">Sign in to KudiRoll</h1>
        <p className="signInBody">Open your payroll workspace with Ready X.</p>

        {readyWallets.length ? <div className="walletChoices">{readyWallets.map((candidate, index) => <button className="signInPrimary" key={`${candidate.name}-${index}`} onClick={() => onSignIn(candidate)} disabled={busy}><span className="signInButtonLabel"><WalletIcon aria-hidden="true" /><span>{busy ? 'Opening Ready X...' : 'Continue with Ready X'}</span></span>{busy ? <LoadingRing /> : <ArrowRightIcon aria-hidden="true" />}</button>)}</div> : <div className="walletMissing"><div className="walletStatus"><WalletIcon aria-hidden="true" /><strong>Ready X is not connected</strong></div><button className="signInPrimary" onClick={onRefreshWallets} disabled={busy}><span className="signInButtonLabel"><ArrowPathIcon aria-hidden="true" /><span>Check again</span></span><ArrowRightIcon aria-hidden="true" /></button><a className="walletStoreLink" href="https://chromewebstore.google.com/detail/ready-x/dlcobpjiigpikoobohmabehhmhfoodbb" target="_blank" rel="noreferrer">Get Ready X <ArrowTopRightOnSquareIcon aria-hidden="true" /></a></div>}

        <div className="signInOptions" aria-label="Other sign-in options">
          <div className="signInOptionRow"><EnvelopeIcon aria-hidden="true" /><span><strong>Email sign-in</strong><small>Coming soon</small></span></div>
          <button className="signInOptionRow signInPasskey" onClick={onPasskeySignIn} disabled={busy}><KeyIcon aria-hidden="true" /><span><strong>{busy ? 'Checking passkey...' : 'Use a saved passkey'}</strong><small>For existing workspaces</small></span><ArrowRightIcon aria-hidden="true" /></button>
        </div>

        <div className="signInRule" />
        <p className="signInConsent">By continuing, you agree to the <button onClick={() => onOpenLegal('terms')}>Terms</button> and acknowledge the <button onClick={() => onOpenLegal('privacy')}>Privacy notice</button>.</p>
        <div className="signInPowered"><span>Private payroll</span><i aria-hidden="true" /><span>Powered by</span><strong>Starknet</strong></div>
      </section>
    </main>

    {legalView && <div className="legalOverlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCloseLegal() }}>
      <section className="legalDialog" role="dialog" aria-modal="true" aria-labelledby="legal-title">
        <div><span>KudiRoll</span><h2 id="legal-title">{legalContent.title}</h2></div>
        <p>{legalContent.body}</p>
        <button onClick={onCloseLegal}>Close</button>
      </section>
    </div>}
  </div>
}

function ProductShell({
  theme,
  section,
  onSection,
  wallet,
  walletAddress,
  walletVersions,
  privateBalance,
  privateBalanceUsdc,
  busy,
  paycrestOrders,
  paycrestConfigured,
  liveOrdersEnabled,
  orderHistoryError,
  paycrestPilot,
  shieldPanel,
  treasuryReadiness,
  accountData,
  emailDeliveryConfigured,
  onMutateAccount,
  onRefreshOrders,
  onRefreshHistory,
  onReconcilePayout,
  onExportPayoutEvidence,
  onConnect,
  onReadBalance,
  onDisconnect,
  onDeleteAccount,
  onRegisterPasskey,
  onVerifyPasskeyPrf,
  onRevokePasskey,
  onToggleTheme,
}: {
  theme: Theme
  section: ProductSection
  onSection: (section: ProductSection) => void
  wallet: ConnectedWallet | null
  walletAddress: string
  walletVersions: string[]
  privateBalance: string
  privateBalanceUsdc: number | null
  busy: string
  paycrestOrders: PaycrestOrderSummary[]
  paycrestConfigured: boolean | null
  liveOrdersEnabled: boolean
  orderHistoryError: string
  paycrestPilot: React.ReactNode
  shieldPanel: React.ReactNode
  treasuryReadiness: TreasuryReadiness | null
  accountData: AccountData | null
  emailDeliveryConfigured: boolean
  onMutateAccount: (path: string, init: RequestInit) => Promise<any>
  onRefreshOrders: () => void
  onRefreshHistory: () => void
  onReconcilePayout: (orderId: string) => void
  onExportPayoutEvidence: (orderId: string) => void
  onConnect: () => void
  onReadBalance: () => void
  onDisconnect: () => void
  onDeleteAccount: (confirmation: string) => Promise<any>
  onRegisterPasskey: () => void
  onVerifyPasskeyPrf: (credentialId: string) => void
  onRevokePasskey: (credentialId: string) => void
  onToggleTheme: () => void
}) {
  const prfPasskeyCount = accountData?.passkeys.filter(passkey => passkey.prfCapable).length ?? 0
  const [teamName, setTeamName] = useState('')
  const [teamDescription, setTeamDescription] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [workerName, setWorkerName] = useState('')
  const [workerAddress, setWorkerAddress] = useState('')
  const [workerAmount, setWorkerAmount] = useState('')
  const [workerError, setWorkerError] = useState('')
  const [draftNotice, setDraftNotice] = useState('')
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({})
  const [selectedWorkers, setSelectedWorkers] = useState<Record<string, boolean>>({})
  const [accountAction, setAccountAction] = useState('')
  const [activePayRun, setActivePayRun] = useState<SavedPayRun | null>(null)
  const [activeExecutionManifest, setActiveExecutionManifest] = useState<PayRunExecutionManifest | null>(null)
  const [emailVerificationCode, setEmailVerificationCode] = useState('')
  const [batchState, setBatchState] = useState<'idle' | 'passed' | 'submitted' | 'unknown' | 'failed'>('idle')
  const [batchMessage, setBatchMessage] = useState('')
  const [profileForm, setProfileForm] = useState({ ownerName: '', businessName: '', jobTitle: '', email: '', phone: '' })
  const [profileNotice, setProfileNotice] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)

  const nav: Array<{ id: ProductSection; label: string; icon: IconName }> = [
    { id: 'overview', label: 'Home', icon: 'home' },
    { id: 'workers', label: 'Team', icon: 'people' },
    { id: 'payroll', label: 'Pay run', icon: 'wallet' },
    { id: 'activity', label: 'History', icon: 'activity' },
    { id: 'providers', label: 'Payout methods', icon: 'route' },
  ]
  const teams = accountData?.teams ?? []
  const profileComplete = Boolean(accountData?.profile.ownerName && accountData?.profile.businessName)
  const setupStepsComplete = Number(profileComplete) + Number(Boolean(teams.length)) + Number(teams.some(team => team.workers.length))
  const selectedTeam = teams.find(team => team.id === selectedTeamId) ?? teams[0] ?? null
  const selectedItems = selectedTeam?.workers.filter(worker => selectedWorkers[worker.id] !== false) ?? []
  const totalDraft = selectedItems.reduce((sum, worker) => sum + Number(draftAmounts[worker.id] || worker.defaultAmountUsdc || 0), 0)
  const supportsPrivatePayroll = supportsStrk20Api(walletVersions)
  const hasExistingSpendableBalance = treasuryReadiness?.status === 'none' && privateBalanceUsdc !== null && privateBalanceUsdc > 0
  const treasuryReady = treasuryReadiness?.status === 'ready' || hasExistingSpendableBalance
  const pageTitle: Record<ProductSection, string> = {
    overview: 'Home', workers: 'Team', payroll: 'Pay run', activity: 'History',
    providers: 'Payout methods', settings: 'Business profile', lab: 'Bank payout',
  }

  useEffect(() => {
    if (teams.length && !teams.some(team => team.id === selectedTeamId)) setSelectedTeamId(teams[0].id)
  }, [teams, selectedTeamId])

  useEffect(() => {
    const profile = accountData?.profile
    setProfileForm({
      ownerName: profile?.ownerName ?? '',
      businessName: profile?.businessName ?? '',
      jobTitle: profile?.jobTitle ?? '',
      email: profile?.email ?? '',
      phone: profile?.phone ?? '',
    })
  }, [accountData?.profile])

  useEffect(() => {
    if (!mobileMoreOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileMoreOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileMoreOpen])

  function updateProfileField(field: keyof typeof profileForm, value: string) {
    setProfileForm(current => ({ ...current, [field]: value }))
    setProfileNotice('')
  }

  async function saveBusinessProfile() {
    setProfileNotice('')
    setAccountAction('profile')
    try {
      await onMutateAccount('/api/account/profile', { method: 'PATCH', body: JSON.stringify(profileForm) })
      setProfileNotice('Business profile saved to this wallet account.')
    } catch (error) { setProfileNotice(readableError(error)) }
    finally { setAccountAction('') }
  }

  async function requestEmailVerification() {
    setAccountAction('email-request')
    setProfileNotice('')
    try {
      await onMutateAccount('/api/account/email/verification/request', { method: 'POST' })
      setProfileNotice('Verification code sent. It expires in 10 minutes and cannot recover wallet funds.')
    } catch (error) {
      setProfileNotice(readableError(error))
    } finally {
      setAccountAction('')
    }
  }

  async function verifyBusinessEmail() {
    setAccountAction('email-verify')
    setProfileNotice('')
    try {
      await onMutateAccount('/api/account/email/verification/verify', { method: 'POST', body: JSON.stringify({ code: emailVerificationCode }) })
      setEmailVerificationCode('')
      setProfileNotice('Business email verified. Email remains an identity contact, not a wallet recovery key.')
    } catch (error) {
      setProfileNotice(readableError(error))
    } finally {
      setAccountAction('')
    }
  }

  async function deleteBusinessAccount() {
    if (deleteConfirmation !== 'DELETE KUDIROLL ACCOUNT') return
    setProfileNotice('')
    setAccountAction('delete-account')
    try { await onDeleteAccount(deleteConfirmation) }
    catch (error) {
      setProfileNotice(readableError(error))
      setAccountAction('')
    }
  }

  async function createSavedTeam() {
    setWorkerError('')
    if (teamName.trim().length < 2) return setWorkerError('Enter a team name.')
    setAccountAction('team')
    try {
      await onMutateAccount('/api/account/teams', { method: 'POST', body: JSON.stringify({ name: teamName, description: teamDescription }) })
      setTeamName('')
      setTeamDescription('')
    } catch (error) { setWorkerError(readableError(error)) }
    finally { setAccountAction('') }
  }

  async function addWorker() {
    setWorkerError('')
    if (!selectedTeam) return setWorkerError('Create or select a team first.')
    if (workerName.trim().length < 2) return setWorkerError('Enter this person’s name.')
    if (!isStarknetAddress(workerAddress)) return setWorkerError('Enter a valid Starknet wallet address beginning with 0x.')
    if (!/^\d+(?:\.\d{1,6})?$/.test(workerAmount) || Number(workerAmount) <= 0) return setWorkerError('Enter a default USDC amount.')
    setAccountAction('worker')
    try {
      await onMutateAccount(`/api/account/teams/${selectedTeam.id}/workers`, { method: 'POST', body: JSON.stringify({ name: workerName, walletAddress: workerAddress, defaultAmountUsdc: workerAmount }) })
      setWorkerName('')
      setWorkerAddress('')
      setWorkerAmount('')
    } catch (error) { setWorkerError(readableError(error)) }
    finally { setAccountAction('') }
  }

  function updateAmount(id: string, value: string) {
    const clean = value.replace(/[^\d.]/g, '')
    setDraftAmounts(current => ({ ...current, [id]: clean }))
    setDraftNotice('')
  }

  async function prepareDraft() {
    if (!wallet) return setDraftNotice('Connect your wallet before previewing this pay run.')
    if (!supportsPrivatePayroll) return setDraftNotice('This wallet can manage your KudiRoll account, but private payroll requires Ready X with STRK20 API 0.10.3.')
    if (!selectedTeam) return setDraftNotice('Select a saved team first.')
    if (accountData?.payRuns.some(run => run.status === 'submitting' || run.status === 'unknown')) return setDraftNotice('Resolve the existing unknown payroll submission in History before creating another pay run.')
    if (!selectedItems.length || selectedItems.some(worker => !Number(draftAmounts[worker.id] || worker.defaultAmountUsdc))) return setDraftNotice('Select workers and enter an amount greater than zero for each person.')
    if (privateBalanceUsdc === null) return setDraftNotice('Check your available balance before previewing this pay run.')
    if (totalDraft > privateBalanceUsdc) return setDraftNotice('The total is higher than your available private USDC balance.')
    setAccountAction('payrun')
    try {
      const result = await createRailPayRun(onMutateAccount, { teamId: selectedTeam.id, items: selectedItems.map(worker => ({ workerId: worker.id, amountUsdc: draftAmounts[worker.id] || worker.defaultAmountUsdc })) })
      setActivePayRun(result.payRun)
      setActiveExecutionManifest(result.executionManifest)
      setBatchState('idle')
      setBatchMessage('Review this saved snapshot, then ask Ready to simulate the complete private batch.')
      setDraftNotice('Pay run saved as a draft. Nothing was sent.')
    } catch (error) { setDraftNotice(readableError(error)) }
    finally { setAccountAction('') }
  }

  async function simulateBatch() {
    if (!wallet || !activePayRun || !activeExecutionManifest) return
    if (activeExecutionManifest.payRunId !== activePayRun.id || activeExecutionManifest.signing.serverCanSubmit) return setBatchMessage('KudiRoll Rail returned an invalid client-signing manifest. Nothing was submitted.')
    if (!supportsPrivatePayroll) return setBatchMessage('Reconnect with Ready X to simulate this private payroll batch.')
    if (!treasuryReady) return setBatchMessage(treasuryReadiness?.message || 'Verify a mature shield or check an existing spendable private balance before preparing payroll.')
    setAccountAction('simulate-batch')
    try {
      await withTimeout(simulatePrivatePayroll(wallet, activeExecutionManifest.actions.map(item => ({ recipient: item.recipient, amountUsdc: item.amountUsdc }))), 90_000)
      await updateRailPayRun(onMutateAccount, activePayRun.id, { status: 'prepared' })
      setActivePayRun(current => current ? { ...current, status: 'prepared' } : current)
      setBatchState('passed')
      setBatchMessage(`Ready accepted all ${activePayRun.items.length} private transfers as one atomic batch.`)
    } catch (error) {
      setBatchState('failed')
      const message = readableError(error)
      setBatchMessage(/NOT_REGISTERED/i.test(message) ? 'At least one worker is not registered for private transfers in Ready. Register every receiving wallet, then retry.' : `Ready rejected the batch: ${message}`)
    } finally { setAccountAction('') }
  }

  async function submitBatch() {
    if (!wallet || !activePayRun || !activeExecutionManifest || batchState !== 'passed') return
    if (activeExecutionManifest.payRunId !== activePayRun.id || activeExecutionManifest.signing.serverCanSubmit) return setBatchMessage('KudiRoll Rail returned an invalid client-signing manifest. Nothing was submitted.')
    if (!supportsPrivatePayroll) return setBatchMessage('Reconnect with Ready X to submit this private payroll batch.')
    if (!treasuryReady) return setBatchMessage(treasuryReadiness?.message || 'Treasury readiness must be verified before payroll can be submitted.')
    setAccountAction('submit-batch')
    try {
      await updateRailPayRun(onMutateAccount, activePayRun.id, { status: 'submitting' })
      setActivePayRun(current => current ? { ...current, status: 'submitting', submissionAttemptedAt: new Date().toISOString() } : current)
      const submission = submitPrivatePayroll(wallet, activeExecutionManifest.actions.map(item => ({ recipient: item.recipient, amountUsdc: item.amountUsdc }))).then(async result => {
        const record = result && typeof result === 'object' ? result as Record<string, unknown> : {}
        const transactionHash = String(record.transaction_hash ?? record.transactionHash ?? '')
        if (!transactionHash) throw new Error('Payroll wallet outcome is still unknown because Ready returned no transaction hash.')
        try {
          await updateRailPayRun(onMutateAccount, activePayRun.id, { status: 'submitted', transactionHash })
        } catch {
          await updateRailPayRun(onMutateAccount, activePayRun.id, { status: 'unknown', transactionHash }).catch(() => null)
          setActivePayRun(current => current ? { ...current, status: 'unknown', transactionHash } : current)
          throw new Error(`Payroll wallet outcome is still unknown after Ready returned transaction hash ${transactionHash} because KudiRoll could not save confirmation.`)
        }
        setActivePayRun(current => current ? { ...current, status: 'submitted', transactionHash } : current)
        setBatchState('submitted')
        setBatchMessage(`Private payroll submitted in one transaction: ${shortAddress(transactionHash)}`)
        return transactionHash
      })
      const transactionHash = await withTimeout(submission, 180_000, 'Payroll wallet outcome is still unknown after three minutes.')
      setBatchState('submitted')
      setBatchMessage(`Private payroll submitted in one transaction: ${shortAddress(transactionHash)}`)
    } catch (error) {
      const message = readableError(error)
      if (/outcome is still unknown/i.test(message)) {
        const recoveredHash = message.match(/transaction hash (0x[0-9a-fA-F]{1,64})/)?.[1] || ''
        const update = await updateRailPayRun(onMutateAccount, activePayRun.id, { status: 'unknown', ...(recoveredHash ? { transactionHash: recoveredHash } : {}) }).catch(() => null)
        if (update?.payRun) setActivePayRun(update.payRun)
        else if (recoveredHash) setActivePayRun(current => current ? { ...current, status: 'unknown', transactionHash: recoveredHash } : current)
        else onRefreshHistory()
        setBatchState('unknown')
        setBatchMessage(recoveredHash
          ? `Ready returned ${shortAddress(recoveredHash)}, but KudiRoll could not confirm durable storage. Do not retry; keep this hash and verify it from History when the service recovers.`
          : 'Ready has not returned a transaction hash. Do not submit this payroll again; keep this page open for late recovery and check Ready before taking further action.')
      } else {
        await updateRailPayRun(onMutateAccount, activePayRun.id, { status: 'failed' }).catch(() => onRefreshHistory())
        setActivePayRun(current => current ? { ...current, status: 'failed' } : current)
        setBatchState('failed')
        setBatchMessage(`Payroll was not submitted: ${message}`)
      }
    } finally { setAccountAction('') }
  }

  async function verifyPayRun(payRunId: string) {
    setAccountAction(`verify-pay-run:${payRunId}`)
    try {
      const result = await verifyRailPayRun(onMutateAccount, payRunId)
      if (result.pending) window.alert(result.message)
    } catch (error) {
      window.alert(`Could not verify this payroll transaction. ${readableError(error)}`)
    } finally { setAccountAction('') }
  }

  async function resolveUnknownPayRun(payRunId: string) {
    const confirmation = window.prompt('First check Ready activity and confirm that no transaction was submitted. Then type NO TRANSACTION IN READY to unlock payroll retries.')
    if (confirmation !== 'NO TRANSACTION IN READY') return
    setAccountAction(`resolve-pay-run:${payRunId}`)
    try {
      await resolveUnknownRailPayRun(onMutateAccount, payRunId, confirmation)
    } catch (error) {
      window.alert(`Could not release this unknown submission. ${readableError(error)}`)
    } finally { setAccountAction('') }
  }

  return <div className="productFrame">
    <aside className="sideRail">
      <button className="brandButton" onClick={() => onSection('overview')}><img src="/kudiroll-mark.svg" alt="" /><strong>KudiRoll</strong></button>
      <nav aria-label="Primary navigation">
        {nav.map(item => <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => onSection(item.id)}><AppIcon name={item.icon} /><span>{item.label}</span></button>)}
      </nav>
      <div className="railBottom">
        <a href="https://kudirail-production.up.railway.app/docs" target="_blank" rel="noreferrer"><AppIcon name="route" /><span>KudiRail docs</span></a>
        <button className={section === 'settings' ? 'active' : ''} onClick={() => onSection('settings')}><AppIcon name="building" /><span>Business profile</span></button>
      </div>
    </aside>

    <section className="productWorkspace">
      <header className="productTopbar">
        <div><span className="eyebrow">KudiRoll payroll</span><h1>{pageTitle[section]}</h1></div>
        <div className="topActions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          {!wallet ? <button className="compactButton" onClick={onConnect} disabled={Boolean(busy)}>{busy === 'wallet' ? 'Connecting…' : 'Connect wallet'}</button> : <button className="walletChip" onClick={onReadBalance} title="Check available balance"><span>{shortAddress(walletAddress)}</span><i>{privateBalanceUsdc === null ? 'Check balance' : `${privateBalanceUsdc} USDC`}</i></button>}
        </div>
      </header>

      {section === 'overview' && <div className="dashboardLayout">
        <div className="dashboardMain">
          <section className="welcomeStrip">
            <div><span>Private payroll</span><h2>Pay your team with confidence</h2><p>Add your team, enter each payment, and review the full pay run before you continue.</p></div>
            <button onClick={() => onSection('payroll')}>Start a pay run</button>
          </section>

          <div className="metricGrid">
            <article className="balanceCard">
              <div className="metricHead"><span>Available to pay</span><AppIcon name="wallet" /></div>
              <strong>{privateBalanceUsdc === null ? '—' : privateBalanceUsdc.toFixed(6)}</strong>
              <small>{!wallet ? 'Connect your wallet to see your private USDC' : privateBalanceUsdc === null ? privateBalance : 'Private USDC available for payroll'}</small>
              <div className="balanceActions">{!wallet ? <button onClick={onConnect}>Connect wallet</button> : <><button onClick={onReadBalance}>{busy === 'balance' ? 'Checking…' : 'Check balance'}</button><button className="quiet" onClick={() => onSection('providers')}>Add funds</button></>}</div>
            </article>
            <article className="metricCard"><span>Saved teams</span><strong>{teams.length}</strong><small>{teams.length ? `${teams.reduce((sum, team) => sum + team.workers.length, 0)} people across ${teams.length} ${teams.length === 1 ? 'team' : 'teams'}` : 'Create your first payroll team'}</small><button onClick={() => onSection('workers')}>Manage teams</button></article>
          </div>

          <section className="panel recentPanel">
            <div className="panelTitle"><div><span>Pay runs</span><h3>Recent payments</h3></div><button className="plainButton" onClick={() => onSection('activity')}>View history</button></div>
            {accountData?.payRuns.length ? <div className="orderList">{accountData.payRuns.slice(0, 3).map(run => <PayRunRow key={run.id} run={run} compact />)}</div> : <EmptyState title="No pay runs yet" detail="Create a team, select its workers, and save your first pay run." />}
          </section>

        </div>

        <aside className="dashboardAside">
          <section className="panel healthPanel"><div className="panelTitle"><div><span>Getting started</span><h3>Account setup</h3></div><span className="countPill">{setupStepsComplete} of 3</span></div><div className="checkList"><StatusLine done={profileComplete} label="Complete business profile" /><StatusLine done={Boolean(teams.length)} label="Create a saved team" /><StatusLine done={teams.some(team => team.workers.length)} label="Add workers" /></div></section>
        </aside>
      </div>}

      {section === 'workers' && <div className="sectionStack">
        <section className="panel sectionIntro"><div><span className="panelKicker">Saved payroll groups</span><h2>Teams</h2><p>Create reusable teams, then save each worker and their default private USDC amount.</p></div><span className="countPill">{teams.length} {teams.length === 1 ? 'team' : 'teams'}</span></section>
        <section className="panel formPanel"><div className="twoFieldGrid"><label>Team name<input value={teamName} onChange={event => setTeamName(event.target.value)} placeholder="e.g. Lagos operations" /></label><label>Description<input value={teamDescription} onChange={event => setTeamDescription(event.target.value)} placeholder="Optional payroll note" /></label></div><div className="formFooter"><span>{walletAddress ? `Saved to ${shortAddress(walletAddress)}.` : 'Saved to your verified wallet account.'}</span><button onClick={createSavedTeam} disabled={Boolean(accountAction)}>{accountAction === 'team' ? 'Creating…' : 'Create team'}</button></div></section>
        {teams.length ? <>
          <section className="teamSelector" aria-label="Saved teams">{teams.map(team => <button key={team.id} className={selectedTeam?.id === team.id ? 'active' : ''} onClick={() => { setSelectedTeamId(team.id); setWorkerError('') }}><strong>{team.name}</strong><span>{team.workers.length} {team.workers.length === 1 ? 'worker' : 'workers'}</span></button>)}</section>
          {selectedTeam && <section className="panel directoryPanel"><div className="panelTitle"><div><span>Selected team</span><h3>{selectedTeam.name}</h3></div><button className="rowAction" onClick={async () => { if (confirm(`Delete ${selectedTeam.name}? Existing pay-run history will remain.`)) await onMutateAccount(`/api/account/teams/${selectedTeam.id}`, { method: 'DELETE' }) }}>Delete team</button></div><p className="teamDescription">{selectedTeam.description || 'No team description.'}</p><div className="workerForm"><label>Name<input value={workerName} onChange={event => setWorkerName(event.target.value)} placeholder="e.g. Ada Okafor" /></label><label>Wallet address<input value={workerAddress} onChange={event => setWorkerAddress(event.target.value)} placeholder="0x..." autoComplete="off" /></label><label>Default USDC<input value={workerAmount} onChange={event => setWorkerAmount(event.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" inputMode="decimal" /></label><button onClick={addWorker} disabled={Boolean(accountAction)}>{accountAction === 'worker' ? 'Saving…' : 'Add worker'}</button></div>{workerError && <div className="inlineError">{workerError}</div>}{selectedTeam.workers.length ? <div className="dataList">{selectedTeam.workers.map(worker => <div className="dataRow" key={worker.id}><div className="avatar">{initials(worker.name)}</div><div className="dataIdentity"><strong>{worker.name}</strong><span>{shortAddress(worker.walletAddress)}</span></div><span className="defaultAmount">{worker.defaultAmountUsdc} USDC</span><button className="rowAction" onClick={() => onMutateAccount(`/api/account/teams/${selectedTeam.id}/workers/${worker.id}`, { method: 'DELETE' })}>Remove</button></div>)}</div> : <EmptyState title="No workers in this team" detail="Add the first worker above. Their details will remain after refresh and sign-in." />}</section>}
        </> : <EmptyState title="Create your first team" detail="Teams keep worker details separate and reusable for future pay runs." />}
      </div>}

      {section === 'payroll' && <div className="sectionStack">
        <section className="panel sectionIntro"><div><span className="panelKicker">New payroll</span><h2>Create a pay run</h2><p>Select a saved team, choose who gets paid, and review one combined total.</p></div>{teams.length > 0 && <select className="teamSelect" value={selectedTeam?.id || ''} onChange={event => { setSelectedTeamId(event.target.value); setDraftNotice('') }}>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select>}</section>
        <div className={'treasuryGate ' + (treasuryReady ? 'ready' : 'waiting')}><div><strong>{treasuryReady ? 'Treasury ready' : 'Treasury not ready'}</strong><span>{hasExistingSpendableBalance ? 'Ready confirmed from the spendable private balance you deliberately checked.' : treasuryReadiness?.message || 'Shield USDC, wait for finality and 10 blocks, or check an existing private balance.'}</span></div><button className="plainButton" onClick={() => onSection('providers')}>Manage funds</button></div>
        <section className="panel payrollComposer">
          {selectedTeam?.workers.length ? <>
            <div className="previewBanner"><strong>Draft pay run</strong><span>Saving this draft does not move money or open Ready.</span></div>
            <div className="composerHead"><div><span>{selectedTeam.name}</span><strong>{totalDraft.toFixed(6)} USDC</strong></div><button className="plainButton" onClick={() => setSelectedWorkers(Object.fromEntries(selectedTeam.workers.map(worker => [worker.id, selectedItems.length !== selectedTeam.workers.length])))}>{selectedItems.length === selectedTeam.workers.length ? 'Clear selection' : 'Select everyone'}</button></div>
            <div className="payrollRows">{selectedTeam.workers.map(worker => <div className={`payrollRow ${selectedWorkers[worker.id] === false ? 'excluded' : ''}`} key={worker.id}><input className="workerCheck" type="checkbox" checked={selectedWorkers[worker.id] !== false} onChange={event => setSelectedWorkers(current => ({ ...current, [worker.id]: event.target.checked }))} aria-label={`Include ${worker.name}`} /><div className="avatar">{initials(worker.name)}</div><div className="dataIdentity"><strong>{worker.name}</strong><span>{shortAddress(worker.walletAddress)}</span></div><label>Amount in USDC<input value={draftAmounts[worker.id] ?? worker.defaultAmountUsdc} onChange={event => updateAmount(worker.id, event.target.value)} inputMode="decimal" placeholder="0.00" disabled={selectedWorkers[worker.id] === false} /></label></div>)}</div>
            <div className="composerFooter"><div><span>{selectedItems.length} of {selectedTeam.workers.length} selected · Available balance</span><strong>{privateBalanceUsdc === null ? 'Check private balance' : `${privateBalanceUsdc} USDC`}</strong></div><button onClick={prepareDraft} disabled={Boolean(accountAction)}>{accountAction === 'payrun' ? 'Saving…' : 'Save and review pay run'}</button></div>
            {draftNotice && <div className="draftNotice"><AppIcon name="activity" /><span>{draftNotice}</span></div>}
            {activePayRun && <section className="batchReview">
              <div className="batchHead"><div><span>Saved pay run</span><strong>{activePayRun.teamName}</strong></div><div><span>One private batch</span><strong>{activePayRun.totalUsdc} USDC</strong></div></div>
              <div className="batchItems">{activePayRun.items.map(item => <div key={item.id}><span>{item.workerName}</span><strong>{item.amountUsdc} USDC</strong></div>)}</div>
              <div className={`simulation ${batchState}`}><strong>{batchState === 'passed' ? 'Ready batch check passed' : batchState === 'submitted' ? 'Payroll submitted' : batchState === 'unknown' ? 'Submission outcome unknown' : batchState === 'failed' ? 'Batch needs attention' : 'Ready batch check'}</strong><span>{batchMessage}</span></div>
              {batchState === 'idle' || batchState === 'failed' ? <button onClick={simulateBatch} disabled={Boolean(accountAction) || !treasuryReady}>{accountAction === 'simulate-batch' ? 'Checking in Ready…' : treasuryReady ? 'Simulate ' + activePayRun.items.length + ' private transfers' : 'Waiting for treasury readiness'}</button> : null}
              {batchState === 'passed' && <div className="batchApproval"><strong>One approval pays the whole team.</strong><p>Review the recipients and total above. Ready X will show the final approval; cancelling it sends nothing.</p><button onClick={submitBatch} disabled={Boolean(accountAction)}>{accountAction === 'submit-batch' ? 'Waiting for approval…' : 'Approve payroll in Ready X'}</button></div>}
            </section>}
          </> : <EmptyState title={teams.length ? 'This team has no workers' : 'Create a team to continue'} detail={teams.length ? 'Add workers to the selected team before preparing payroll.' : 'Create a saved team and add its workers first.'} action="Manage teams" onAction={() => onSection('workers')} />}
        </section>
      </div>}

      {section === 'activity' && <div className="sectionStack">
        <section className="panel sectionIntro"><div><span className="panelKicker">Account records</span><h2>Transaction history</h2><p>Tracked treasury shields and immutable payroll snapshots stay available independently of optional payout providers.</p></div><button className="secondary" onClick={onRefreshHistory}>Refresh history</button></section>
        {accountData?.treasuryShields.length ? <section className="panel historyPanel"><div className="panelTitle"><div><span>Public pool funding</span><h3>Treasury shields</h3></div></div><div className="orderList">{accountData.treasuryShields.map(shield => <TreasuryShieldRow key={shield.transactionHash} shield={shield} readiness={treasuryReadiness?.shield?.transactionHash === shield.transactionHash ? treasuryReadiness : null} />)}</div></section> : <EmptyState title="No tracked treasury shields" detail="A shield appears here after KudiRoll receives its transaction hash from Ready." />}
        {accountData?.payRuns.length ? <section className="panel historyPanel"><div className="panelTitle"><h3>Team pay runs</h3></div><div className="orderList">{accountData.payRuns.map(run => <PayRunRow key={run.id} run={run} onVerify={verifyPayRun} onResolveUnknown={resolveUnknownPayRun} verifying={accountAction === `verify-pay-run:${run.id}` || accountAction === `resolve-pay-run:${run.id}`} />)}</div></section> : <EmptyState title="No team pay runs yet" detail="Save a draft from Pay run and it will appear here." action="Create pay run" onAction={() => onSection('payroll')} />}
        {orderHistoryError && <div className="inlineError">Optional settlement history could not refresh. {orderHistoryError}</div>}
        <section className="panel historyPanel"><div className="panelTitle"><div><span>Settlement records</span><h3>Bank payout orders</h3></div></div>{paycrestConfigured === false ? <EmptyState title="Bank payouts are unavailable" detail="Private payroll and STRK20 history remain available." /> : paycrestOrders.length ? <div className="orderList">{paycrestOrders.map(order => <PaycrestOrderRow key={order.id} order={order} busy={busy} onReconcile={onReconcilePayout} onExport={onExportPayoutEvidence} />)}</div> : <EmptyState title="No bank payout orders" detail="Your Nigerian bank payouts will appear here." action="Open bank payout" onAction={() => onSection('lab')} />}</section>
      </div>}

      {section === 'providers' && <div className="sectionStack">
        <section className="panel sectionIntro"><div><span className="panelKicker">Funds and payouts</span><h2>Manage payroll funds</h2><p>Add private USDC and choose how your team gets paid.</p></div></section>
        {shieldPanel}
        <div className="providerSectionTitle"><span>Payout routes</span><h3>How your team gets paid</h3></div>
        <div className="providerGrid"><ProviderCard title="Private USDC" status="Available" tone="safe" detail="Send privately to a compatible Starknet wallet." /><ProviderCard title="Naira bank account" status={paycrestConfigured && liveOrdersEnabled ? 'Live' : 'Unavailable'} tone={paycrestConfigured && liveOrdersEnabled ? 'safe' : 'neutral'} detail="Pay a verified Nigerian bank account from private USDC." action="Open bank payout" onAction={() => onSection('lab')} /></div>
      </div>}

      {section === 'lab' && paycrestPilot}

      {section === 'settings' && <div className="sectionStack profileStack">
        <section className="panel sectionIntro"><div><span className="panelKicker">Business account</span><h2>Business profile</h2><p>Keep the owner and business details associated with this KudiRoll wallet account up to date.</p></div></section>
        <section className="panel profilePanel">
          <div className="panelTitle"><div><span>Profile details</span><h3>Account owner</h3></div>{accountData?.profile.updatedAt && <span className="profileUpdated">Updated {new Date(accountData.profile.updatedAt).toLocaleDateString()}</span>}</div>
          <div className="profileGrid">
            <label>Owner’s full name<input value={profileForm.ownerName} onChange={event => updateProfileField('ownerName', event.target.value)} placeholder="e.g. Amina Bello" autoComplete="name" /></label>
            <label>Business name<input value={profileForm.businessName} onChange={event => updateProfileField('businessName', event.target.value)} placeholder="e.g. Bello Foods" autoComplete="organization" /></label>
            <label>Role or title<input value={profileForm.jobTitle} onChange={event => updateProfileField('jobTitle', event.target.value)} placeholder="e.g. Owner" autoComplete="organization-title" /></label>
            <label>Business email<input value={profileForm.email} onChange={event => updateProfileField('email', event.target.value)} placeholder="name@business.com" type="email" autoComplete="email" /></label>
            <label>Phone number <span className="optionalLabel">Optional</span><input value={profileForm.phone} onChange={event => updateProfileField('phone', event.target.value)} placeholder="+234…" type="tel" autoComplete="tel" /></label>
            <label>Wallet account<input value={accountData?.walletAddress || walletAddress} readOnly aria-readonly="true" /></label>
          </div>
          <div className="formFooter"><span>Profile details are stored by KudiRoll under this wallet address.</span><button onClick={saveBusinessProfile} disabled={Boolean(accountAction)}>{accountAction === 'profile' ? 'Saving…' : 'Save profile'}</button></div>
          <div className="emailVerification"><div><strong>Business email</strong><span>{accountData?.profile.emailVerifiedAt ? `Verified ${new Date(accountData.profile.emailVerifiedAt).toLocaleDateString()}` : !accountData?.profile.email ? 'Save an email to begin verification.' : emailDeliveryConfigured ? 'Not verified' : 'Verification delivery is not configured.'}</span></div>{!accountData?.profile.emailVerifiedAt && accountData?.profile.email && emailDeliveryConfigured && <div className="emailVerificationActions"><button className="secondary" onClick={requestEmailVerification} disabled={Boolean(accountAction)}>{accountAction === 'email-request' ? 'Sending…' : 'Send code'}</button><input value={emailVerificationCode} onChange={event => setEmailVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" inputMode="numeric" autoComplete="one-time-code" /><button onClick={verifyBusinessEmail} disabled={emailVerificationCode.length !== 6 || Boolean(accountAction)}>{accountAction === 'email-verify' ? 'Verifying…' : 'Verify email'}</button></div>}</div>
          {profileNotice && <div className="profileNotice">{profileNotice}</div>}
        </section>
        <section className="panel accountScope">
          <div className="panelTitle"><div><span>Extension-free access</span><h3>Passkeys and recovery</h3></div><span className={`statePill ${accountData?.recoveryReady ? 'safe' : 'neutral'}`}>{accountData?.recoveryReady ? 'Recovery ready' : 'Setup incomplete'}</span></div>
          <p className="passkeyCopy">KudiRoll requires two PRF-capable passkeys before private state can be backed up. The embedded smart account signs transactions; KudiRoll never stores its signer key.</p>
          <button onClick={onRegisterPasskey} disabled={Boolean(accountAction) || busy === 'passkey-register' || busy === 'passkey-prf' || busy === 'passkey-revoke'}>{busy === 'passkey-register' ? 'Creating passkey…' : accountData?.passkeys.length ? 'Add recovery passkey' : 'Create passkey'}</button>
          <div className="recoveryChecks"><div><strong>{prfPasskeyCount} / 2 recovery passkeys</strong><span>{accountData?.recoveryReady ? 'Two PRF-capable recovery credentials are configured.' : 'Verify two passkeys on separate devices or password-manager ecosystems.'}</span></div><div><strong>{accountData?.profile.emailVerifiedAt ? 'Email identity verified' : 'Email recovery inactive'}</strong><span>Email can verify account identity, but it never decrypts or recovers wallet funds by itself.</span></div></div>
          {!!accountData?.passkeys.length && <div className="passkeyList">{accountData.passkeys.map((passkey, index) => <div key={passkey.credentialId}><span><strong>Passkey {index + 1}</strong><small>{passkey.deviceType === 'multiDevice' ? 'Synced credential' : 'Device credential'} · {passkey.prfCapable ? 'private recovery ready' : 'sign-in only'} · added {new Date(passkey.createdAt).toLocaleDateString()} · …{passkey.credentialId.slice(-8)}</small></span><div className="passkeyActions"><button className="secondary" onClick={() => onVerifyPasskeyPrf(passkey.credentialId)} disabled={busy === 'passkey-prf'}>{busy === 'passkey-prf' ? 'Checking…' : passkey.prfCapable ? 'Test recovery' : 'Verify recovery'}</button><button className="quiet" onClick={() => onRevokePasskey(passkey.credentialId)} disabled={accountData.passkeys.length <= 2 || (passkey.prfCapable && prfPasskeyCount <= 2) || busy === 'passkey-revoke'}>{busy === 'passkey-revoke' ? 'Verifying…' : 'Revoke'}</button></div></div>)}</div>}
        </section>
        <section className="panel accountScope">
          <div className="panelTitle"><div><span>Account data</span><h3>What KudiRoll stores</h3></div><button className="quiet" onClick={onDisconnect}>Disconnect wallet</button></div>
          <div className="scopeList"><div><strong>Business profile</strong><span>The owner and contact details entered above.</span></div><div><strong>Payroll workspace</strong><span>{teams.length} saved {teams.length === 1 ? 'team' : 'teams'} and {accountData?.payRuns.length ?? 0} pay-run {(accountData?.payRuns.length ?? 0) === 1 ? 'record' : 'records'}.</span></div><div><strong>Security boundary</strong><span>KudiRoll stores passkey public credentials and may store encrypted STRK20 private-state ciphertext. Signer keys, plaintext viewing keys, proofs, and recovery secrets never reach the server.</span></div></div>
        </section>
        <section className="panel dangerZone">
          <div><span>Permanent action</span><h3>Delete KudiRoll account</h3><p>This permanently removes this business profile, saved teams, workers, and pay-run records from KudiRoll. It does not delete your Starknet wallet, onchain transactions, or records retained independently by Paycrest.</p></div>
          <label>Type DELETE KUDIROLL ACCOUNT<input value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} placeholder="DELETE KUDIROLL ACCOUNT" autoComplete="off" /></label>
          <button className="dangerButton" onClick={deleteBusinessAccount} disabled={deleteConfirmation !== 'DELETE KUDIROLL ACCOUNT' || Boolean(accountAction)}>{accountAction === 'delete-account' ? 'Deleting account…' : 'Delete account permanently'}</button>
        </section>
      </div>}
    </section>

    {mobileMoreOpen && <div className="mobileMoreBackdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setMobileMoreOpen(false) }}>
      <section id="mobile-more-menu" className="mobileMoreSheet" role="dialog" aria-modal="true" aria-labelledby="mobile-more-title">
        <div className="mobileMoreHead"><div><span>More</span><h2 id="mobile-more-title">Account and payouts</h2></div><button type="button" onClick={() => setMobileMoreOpen(false)} aria-label="Close more menu"><XMarkIcon aria-hidden="true" /></button></div>
        <button type="button" autoFocus className={section === 'providers' ? 'active' : ''} onClick={() => { onSection('providers'); setMobileMoreOpen(false) }}><AppIcon name="route" /><span><strong>Payout methods</strong><small>Private USDC and Naira bank payouts</small></span><ArrowRightIcon aria-hidden="true" /></button>
        <button type="button" className={section === 'settings' ? 'active' : ''} onClick={() => { onSection('settings'); setMobileMoreOpen(false) }}><AppIcon name="building" /><span><strong>Business profile</strong><small>Owner details and account controls</small></span><ArrowRightIcon aria-hidden="true" /></button>
      </section>
    </div>}
    <nav className="mobileNav" aria-label="Mobile navigation">{nav.slice(0, 4).map(item => <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => { onSection(item.id); setMobileMoreOpen(false) }}><AppIcon name={item.icon} /><span>{item.label}</span></button>)}<button type="button" aria-expanded={mobileMoreOpen} aria-controls="mobile-more-menu" className={section === 'providers' || section === 'settings' || mobileMoreOpen ? 'active' : ''} onClick={() => setMobileMoreOpen(open => !open)}><AppIcon name="more" /><span>More</span></button></nav>
  </div>
}

type IconName = 'home' | 'people' | 'wallet' | 'activity' | 'route' | 'building' | 'more'

function ThemeToggle({ theme, onToggle, className = '' }: { theme: Theme; onToggle: () => void; className?: string }) {
  const next = theme === 'light' ? 'dark' : 'light'
  return <button type="button" className={`themeToggle ${className}`.trim()} onClick={onToggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
    {theme === 'light' ? <MoonIcon aria-hidden="true" /> : <SunIcon aria-hidden="true" />}
  </button>
}

function AppIcon({ name }: { name: IconName }) {
  const icons: Record<IconName, typeof HomeIcon> = {
    home: HomeIcon,
    people: UserGroupIcon,
    wallet: WalletIcon,
    activity: ChartBarSquareIcon,
    route: ArrowsRightLeftIcon,
    building: BuildingOffice2Icon,
    more: EllipsisHorizontalIcon,
  }
  const Icon = icons[name]
  return <Icon aria-hidden="true" />
}

function LoadingRing() {
  return <span className="loadingRing" role="status" aria-label="Loading" />
}

function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) {
  return <div className="emptyState"><div><strong>{title}</strong><p>{detail}</p></div>{action && onAction && <button className="secondary" onClick={onAction}>{action}</button>}</div>
}

function StatusLine({ done, label }: { done: boolean; label: string }) {
  return <div><i className={done ? 'done' : ''}>{done ? <CheckIcon aria-hidden="true" /> : null}</i><span>{label}</span></div>
}

function ProviderCard({ title, status, detail, tone, action, onAction }: { title: string; status: string; detail: string; tone: 'safe' | 'blocked' | 'neutral'; action?: string; onAction?: () => void }) {
  return <article className="providerCard"><div className="providerTop"><div className={`providerMark ${tone}`}><AppIcon name={tone === 'safe' ? 'wallet' : 'route'} /></div><span className={`statePill ${tone}`}>{status}</span></div><h3>{title}</h3><p>{detail}</p>{action && onAction && <button className="plainButton" onClick={onAction}>{action}<ArrowRightIcon aria-hidden="true" /></button>}</article>
}

function TreasuryShieldRow({ shield, readiness }: { shield: TreasuryShieldRecord; readiness: TreasuryReadiness | null }) {
  const status = readiness?.status || 'recorded'
  const safe = status === 'ready'
  const blocked = status === 'reverted' || status === 'unknown'
  const detail = status === 'ready' ? 'Finalized and mature' : status === 'maturing' ? `${readiness?.blocksRemaining ?? 0} blocks until mature` : status === 'submitted' ? 'Awaiting finality' : status === 'reverted' ? 'Transaction reverted' : status === 'unknown' ? 'Verification delayed' : 'Saved transaction evidence'
  return <article className="historyRow">
    <div className="historyIdentity"><span className="historyMark"><AppIcon name="wallet" /></span><div><strong>Public treasury shield</strong><a href={`https://starkscan.co/tx/${shield.transactionHash}`} target="_blank" rel="noreferrer">{shortAddress(shield.transactionHash)}</a></div></div>
    <div className="historyAmount"><strong>{shield.amountUsdc} USDC</strong><span>Public pool deposit</span></div>
    <div className="historyStatus"><span className={`statePill ${safe ? 'safe' : blocked ? 'blocked' : 'neutral'}`}>{status}</span><small>{detail}</small></div>
    <div className="historyMeta"><strong>{new Date(shield.submittedAt).toLocaleDateString()}</strong><span>STRK20</span></div>
  </article>
}

function PayoutReceipt({ order, status, busy, orderExpired, exactAmountCovered, simulationState, onSimulate, onReconcile, onExport, onClose }: {
  order: Phase0Order
  status: string
  busy: string
  orderExpired: boolean
  exactAmountCovered: boolean
  simulationState: string
  onSimulate: () => void
  onReconcile: (orderId: string) => void
  onExport: (orderId: string) => void
  onClose: () => void
}) {
  const needsAttention = order.displayStatus === 'reconciliation-required' || order.displayStatus === 'payment-failed'
  const terminal = ['completed', 'refunded', 'payment-failed', 'payment-window-closed'].includes(order.displayStatus)
  return <div className="orderReceipt">
    <div className="receiptHead"><div><span>Paycrest order</span><strong>{order.id}</strong></div><em className={needsAttention ? 'expired' : ''}>{status}</em></div>
    <div className="receiptGrid">
      <div><span>Recipient</span><strong>{order.accountName}</strong><small>Account ending {order.bankLast4}</small></div>
      <div><span>Recipient receives</span><strong>NGN {order.amountNgn}</strong></div>
      <div><span>You pay</span><strong>{order.amountUsdc} USDC</strong></div>
      <div><span>Payment window</span><strong>{new Date(order.validUntil).toLocaleString()}</strong></div>
    </div>
    <div className="actions">
      {!order.transactionHash && order.displayStatus === 'ready-to-pay' && <button onClick={onSimulate} disabled={Boolean(busy) || orderExpired || !exactAmountCovered}>{busy === 'simulate' ? 'Opening preview...' : simulationState === 'passed' ? 'Preview again' : 'Preview payment'}</button>}
      {order.transactionHash && <>
        <button onClick={() => onReconcile(order.id)} disabled={Boolean(busy)}>{busy === `reconcile:${order.id}` ? 'Checking...' : 'Check payment status'}</button>
        <button className="ghost" onClick={() => onExport(order.id)} disabled={Boolean(busy)}>{busy === `evidence:${order.id}` ? 'Exporting...' : 'Export incident evidence'}</button>
        <a href={`https://starkscan.co/tx/${order.transactionHash}`} target="_blank" rel="noreferrer">Open on Starkscan</a>
      </>}
      {terminal && <button className="ghost" onClick={onClose} disabled={Boolean(busy)}>Close details</button>}
    </div>
  </div>
}

function PaycrestOrderRow({ order, compact = false, busy = '', onReconcile, onExport }: { order: PaycrestOrderSummary; compact?: boolean; busy?: string; onReconcile?: (orderId: string) => void; onExport?: (orderId: string) => void }) {
  const final = order.displayStatus === 'completed' || order.displayStatus === 'refunded'
  const blocked = order.displayStatus === 'reconciliation-required' || order.displayStatus === 'payment-failed'
  const time = order.updatedAt || order.createdAt
  const detail = order.displayStatus === 'ready-to-pay' ? 'Order created; no payment submitted' :
    order.displayStatus === 'payment-submitted' ? 'Transaction saved; checking Starknet' :
    order.displayStatus === 'awaiting-paycrest-detection' ? 'Starknet payment verified; provider detection pending' :
    order.displayStatus === 'reconciliation-required' ? 'Onchain payment verified; provider support action needed' :
    order.displayStatus === 'refunding' ? 'Paycrest is returning the payment' :
    order.displayStatus === 'refunded' ? 'Refund completed' :
    order.displayStatus === 'completed' ? 'Bank payout completed' :
    order.displayStatus === 'payment-window-closed' ? 'No payment was submitted' : 'Payment did not complete'
  return <article className={`historyRow ${compact ? 'compact' : ''}`}>
    <div className="historyIdentity"><span className="historyMark"><AppIcon name="route" /></span><div><strong>{order.accountName || 'Naira payout'}</strong>{order.transactionHash ? <a href={`https://starkscan.co/tx/${order.transactionHash}`} target="_blank" rel="noreferrer">{shortAddress(order.transactionHash)}</a> : <span>{order.bankLast4 ? `Account ending ${order.bankLast4}` : order.reference || shortAddress(order.id)}</span>}</div></div>
    {!compact && <div className="historyAmount"><strong>{order.amountNgn ? `₦${Number(order.amountNgn).toLocaleString()}` : order.amountUsdc ? `${order.amountUsdc} USDC` : 'Amount unavailable'}</strong><span>{order.amountUsdc && order.amountNgn ? `${order.amountUsdc} USDC` : order.network || 'Starknet'}</span></div>}
    <div className="historyStatus"><span className={`statePill ${final ? 'safe' : blocked ? 'blocked' : 'neutral'}`}>{payoutStatusLabels[order.displayStatus]}</span><small>{detail}</small></div>
    {!compact && <div className="historyMeta"><strong>{time ? new Date(time).toLocaleDateString() : '—'}</strong><span>{shortAddress(order.id)}</span>{order.transactionHash && onReconcile && <button className="rowAction" onClick={() => onReconcile(order.id)} disabled={Boolean(busy)}>Check status</button>}{onExport && <button className="rowAction" onClick={() => onExport(order.id)} disabled={Boolean(busy)}>Export evidence</button>}</div>}
  </article>
}

function PayRunRow({ run, compact = false, onVerify, onResolveUnknown, verifying = false }: { run: SavedPayRun; compact?: boolean; onVerify?: (payRunId: string) => void; onResolveUnknown?: (payRunId: string) => void; verifying?: boolean }) {
  const safe = run.status === 'finalized'
  const blocked = ['reverted', 'unknown', 'failed'].includes(run.status)
  const detail = run.finalityMessage || (run.status === 'draft' ? 'Saved · nothing sent' : run.status === 'prepared' ? 'Wallet simulation passed' : run.status === 'submitting' ? 'Waiting for Ready; do not retry' : run.status === 'submitted' ? 'Hash recorded · verify finality' : 'Payroll status')
  return <article className={`historyRow ${compact ? 'compact' : ''}`}>
    <div className="historyIdentity"><span className="historyMark"><AppIcon name="people" /></span><div><strong>{run.teamName}</strong>{run.transactionHash ? <a href={`https://starkscan.co/tx/${run.transactionHash}`} target="_blank" rel="noreferrer">{shortAddress(run.transactionHash)}</a> : <span>{run.items.length} {run.items.length === 1 ? 'worker' : 'workers'} · saved snapshot</span>}</div></div>
    {!compact && <div className="historyAmount"><strong>{run.totalUsdc} USDC</strong><span>Private payroll</span></div>}
    <div className="historyStatus"><span className={`statePill ${safe ? 'safe' : blocked ? 'blocked' : 'neutral'}`}>{run.status}</span><small>{detail}</small></div>
    {!compact && <div className="historyMeta"><strong>{new Date(run.createdAt).toLocaleDateString()}</strong>{run.transactionHash && !safe && run.status !== 'reverted' && onVerify ? <button className="plainButton" onClick={() => onVerify(run.id)} disabled={verifying}>{verifying ? 'Checking…' : 'Verify onchain'}</button> : run.status === 'unknown' && !run.transactionHash && onResolveUnknown ? <button className="plainButton" onClick={() => onResolveUnknown(run.id)} disabled={verifying}>{verifying ? 'Checking…' : 'Review before retry'}</button> : <span>{run.acceptedBlockNumber === null ? shortAddress(run.id) : `Block ${run.acceptedBlockNumber}`}</span>}</div>}
  </article>
}

function shortAddress(value: string) {
  if (!value) return 'Wallet connected'
  return value.length > 14 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'KR'
}
