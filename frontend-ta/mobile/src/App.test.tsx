import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import App from './App'

vi.mock('@react-oauth/google', () => ({
  GoogleLogin: () => <button type="button">Masuk dengan Google</button>,
}))

describe('App Migration Component', () => {
  it('renders the login screen by default', () => {
    render(<App />)

    const button = screen.getByRole('button', { name: /masuk/i })
    expect(button).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'NETFLOW' })).toBeInTheDocument()
  })
})
