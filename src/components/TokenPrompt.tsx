import { useState, type FormEvent } from 'react'

interface Props {
  message?: string | null
  onSubmit: (token: string) => Promise<void>
  onCancel?: () => void
}

export default function TokenPrompt({ message, onSubmit, onCancel }: Props) {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = token.trim()
    if (!trimmed) return
    setChecking(true)
    setError(null)
    try {
      await onSubmit(trimmed)
    } catch {
      setError('TMDB did not accept that token. Check it and try again.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <form onSubmit={submit} className="card token-prompt">
      <h2>Connect to TMDB</h2>
      <p>
        Paste your TMDB Read Access Token. It is checked, then kept only in
        this browser.
      </p>
      {message && <p role="alert">{message}</p>}
      <label>
        TMDB Read Access Token
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
        />
      </label>
      <div className="actions">
        <button type="submit" className="primary" disabled={checking}>
          Save
        </button>
        {onCancel && (
          <button type="button" className="quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
