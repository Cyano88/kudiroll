import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppFeedbackProvider } from './AppFeedback'
import { App } from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppFeedbackProvider><App /></AppFeedbackProvider>
  </React.StrictMode>,
)
