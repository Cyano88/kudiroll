import { MAX_IMPORT_WORKERS, type WorkerInput } from './worker-import'
export const WORKER_CSV_TEMPLATE = 'name,walletAddress,defaultAmountUsdc\r\n'
export function parseWorkerCsv(input: string): WorkerInput[] {
  if (new TextEncoder().encode(input).length > 24000) throw new Error('Choose a CSV file smaller than 24 KB.')
  const text = input.replace(/^\uFEFF/, '')
  const records: string[][] = []
  let record: string[] = [], field = '', quoted = false, closed = false
  const finishField = () => { record.push(field); field = ''; closed = false }
  const finishRow = () => { finishField(); if (record.some(cell => cell.trim())) records.push(record); record = [] }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else { quoted = false; closed = true } }
      else field += char
    } else if (char === ',') finishField()
    else if (char === '\r' || char === '\n') { finishRow(); if (char === '\r' && text[i + 1] === '\n') i++ }
    else if (closed) throw new Error('Unexpected text after a quoted CSV field.')
    else if (char === '"') { if (field) throw new Error('Quotes must start at the beginning of a CSV field.'); quoted = true }
    else field += char
  }
  if (quoted) throw new Error('A quoted CSV field is missing its closing quote.')
  if (field || record.length || closed) finishRow()
  const headers = records.shift()?.map(cell => cell.trim())
  const required = ['name', 'walletAddress', 'defaultAmountUsdc']
  if (!headers || headers.length !== 3 || required.some(key => !headers.includes(key))) throw new Error('Use the template columns: name, walletAddress, defaultAmountUsdc.')
  if (!records.length || records.length > MAX_IMPORT_WORKERS) throw new Error('Import between 1 and 100 workers.')
  return records.map((cells, index) => {
    if (cells.length !== 3) throw new Error(`CSV row ${index + 2} must contain exactly three columns.`)
    return Object.fromEntries(required.map(key => [key, cells[headers.indexOf(key)].trim()])) as WorkerInput
  })
}
