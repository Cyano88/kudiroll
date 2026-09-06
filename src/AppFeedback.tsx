import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
type Request = { owner: symbol; message: string; title: string; kind: 'confirm' | 'prompt'; initial: string; action: string; resolve: (value: string | null) => void }
type Feedback = { ask: (request: Omit<Request, 'resolve'>) => Promise<string | null>; notify: (message: string) => void; cancel: (owner: symbol) => void }
const Context = createContext<Feedback | null>(null)
export function AppFeedbackProvider({ children }: { children: ReactNode }) {
 const [requests, setRequests] = useState<Request[]>([])
 const pending = useRef<Request[]>([])
 const [notice, setNotice] = useState('')
 const ask = useCallback((request: Omit<Request, 'resolve'>) => new Promise<string | null>(resolve => {
  pending.current = [...pending.current, { ...request, resolve }]; setRequests(pending.current)
 }), [])
 const cancel = useCallback((owner: symbol) => {
  pending.current.filter(item => item.owner === owner).forEach(item => item.resolve(null))
  pending.current = pending.current.filter(item => item.owner !== owner); setRequests(pending.current)
 }, [])
 function finish(value: string | null) {
  const first = pending.current[0]
  pending.current = pending.current.slice(1); setRequests(pending.current); first?.resolve(value)
 }
 return <Context.Provider value={{ ask, notify: setNotice, cancel }}>{children}
  {notice && <aside className="appNotice" role="status"><p>{notice}</p><button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">Dismiss</button></aside>}
  {requests[0] && <FeedbackDialog key={requests[0].message} request={requests[0]} finish={finish} />}
 </Context.Provider>
}
function FeedbackDialog({ request, finish }: { request: Request; finish: (value: string | null) => void }) {
 const ref = useRef<HTMLDialogElement>(null)
 const [value, setValue] = useState(request.initial)
 useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close() }, [])
 return <dialog ref={ref} className="appDialog" aria-labelledby="feedback-title" aria-describedby="feedback-description" onCancel={event => { event.preventDefault(); finish(null) }}>
  <form onSubmit={event => { event.preventDefault(); finish(request.kind === 'prompt' ? value : 'confirmed') }}>
   <h2 id="feedback-title">{request.title}</h2><p id="feedback-description">{request.message}</p>
   {request.kind === 'prompt' && <label>{request.message.toLowerCase().includes('type ') ? 'Confirmation phrase' : 'Transaction hash'}<input autoFocus value={value} onChange={event => setValue(event.target.value)} autoComplete="off" /></label>}
   <div className="balanceActions"><button type="button" autoFocus={request.kind === 'confirm'} className="plainButton" onClick={() => finish(null)}>Cancel</button><button type="submit">{request.action}</button></div>
  </form>
 </dialog>
}
export function useAppFeedback() {
 const feedback = useContext(Context)!
 const owner = useRef(Symbol('feedback')).current
 const cancel = feedback.cancel
 useEffect(() => () => cancel(owner), [cancel, owner])
 return {
  notify: feedback.notify,
  confirm: async (message: string, title = 'Confirm change', action = 'Confirm') => (await feedback.ask({ owner, message, title, action, kind: 'confirm', initial: '' })) !== null,
  prompt: (message: string, initial = '') => feedback.ask({ owner, message, title: 'Recover payment', action: 'Continue', kind: 'prompt', initial }),
 }
}
