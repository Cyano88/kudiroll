import { useRef, useState } from 'react'
import { parseWorkerCsv, WORKER_CSV_TEMPLATE } from './worker-csv'
import { validateWorkerRows, type WorkerInput } from './worker-import'

export function WorkerCsvImport({ teamName, existing, disabled, onSave }: { teamName: string; existing: { walletAddress: string }[]; disabled: boolean; onSave: (rows: WorkerInput[]) => Promise<void> }) {
  const [rows, setRows] = useState<WorkerInput[]>([])
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [reading, setReading] = useState(false)
  const readId = useRef(0)
  const errors = validateWorkerRows(rows, existing)
  const invalid = errors.some(row => row.length)
  function reset() { readId.current++; setRows([]); setMessage(''); setReading(false) }
  async function load(file?: File) {
    reset()
    if (!file) return
    if (file.size > 24000) return setMessage('Choose a CSV file smaller than 24 KB.')
    const id = readId.current
    setReading(true)
    try { const text = await file.text(); if (id === readId.current) setRows(parseWorkerCsv(text)) }
    catch (error) { if (id === readId.current) setMessage(error instanceof Error ? error.message : 'Could not read this CSV.') }
    finally { if (id === readId.current) setReading(false) }
  }
  async function save() {
    if (saving || disabled || reading || !rows.length || invalid) return
    setSaving(true); setMessage('')
    try { await onSave(rows); setMessage(`${rows.length} workers saved to ${teamName}.`); setRows([]) }
    catch (error) { setMessage(`${error instanceof Error ? error.message : 'Could not confirm this import.'} Refresh the team before retrying if the response was interrupted.`) }
    finally { setSaving(false) }
  }
  return <section className="workerImport" aria-label="Import workers from CSV">
    <h4>Import workers from CSV</h4>
    <p>Upload up to 100 workers for {teamName}. Review and edit every row before saving. This adds team records; it does not send payments or enable private transfers.</p>
    <a href={'data:text/csv;charset=utf-8,' + encodeURIComponent(WORKER_CSV_TEMPLATE)} download="kudiroll-workers-template.csv">Download CSV template</a>
    <label>Choose CSV<input type="file" accept=".csv,text/csv" disabled={disabled || saving} onChange={event => { void load(event.target.files?.[0]); event.target.value = '' }} /></label>
    {reading && <p role="status">Reading CSV...</p>}
    {rows.length > 0 && <><p>{rows.length} workers to add / {errors.filter(row => row.length).length} {errors.filter(row => row.length).length === 1 ? 'row needs' : 'rows need'} attention</p>
      <div className="importRows">{rows.map((row, index) => <fieldset key={index} disabled={disabled || saving} className="importRow"><legend>Worker {index + 1}</legend>
        {(['name', 'walletAddress', 'defaultAmountUsdc'] as const).map(key => <label key={key}>{key === 'name' ? 'Name' : key === 'walletAddress' ? 'Wallet address' : 'Default USDC'}<input value={row[key]} onChange={event => { const value = event.target.value; setRows(current => current.map((item, i) => i === index ? { ...item, [key]: value } : item)) }} /></label>)}
        <button type="button" className="plainButton" onClick={() => setRows(current => current.filter((_, i) => i !== index))}>Remove row {index + 1}</button>
        {errors[index].length > 0 && <p className="inlineError" role="status">{errors[index].join(' ')}</p>}
      </fieldset>)}</div>
      <div className="balanceActions"><button onClick={save} disabled={disabled || saving || reading || invalid}>{saving ? 'Saving workers...' : `Save ${rows.length} workers`}</button><button className="plainButton" onClick={reset} disabled={disabled || saving}>Cancel import</button></div>
    </>}
    {message && <p role="status">{message}</p>}
  </section>
}
