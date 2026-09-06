export function payrollBalanceIssue(total: number, balance: number | null, reserve: number): string | null {
 const display = (value: number) => value.toFixed(6).replace(/\.?0+$/, '') || '0'
 if (balance === null || !Number.isFinite(balance)) return 'Check your private balance before preparing payment.'
 if (total > balance) return `Insufficient balance. This pay run needs ${display(total)} USDC; you have ${display(balance)} USDC available.`
 if (reserve > 0 && total > Math.max(0, balance - reserve)) return `This pay run needs ${display(total)} USDC. After your ${display(reserve)} USDC protected reserve, ${display(Math.max(0, balance - reserve))} USDC is available.`
 return null
}
