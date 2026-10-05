import { useState, type FormEvent } from 'react'

interface Props {
  message?: string | null
  onSubmit: (token: string) => Promise<void>
}

export default function TokenPrompt({ message, onSubmit }: Props) {
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
    <form onSubmit={submit}>
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
      <button type="submit" disabled={checking}>
        Save
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
