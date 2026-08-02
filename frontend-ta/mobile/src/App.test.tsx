import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App Migration Component', () => {
  it('renders the login screen by default', () => {
    render(<App />)

    const button = screen.getByRole('button', { name: /continue with google/i })
    expect(button).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'NETFLOW' })).toBeInTheDocument()
  })
})
