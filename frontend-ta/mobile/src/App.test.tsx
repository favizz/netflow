import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App Migration Component', () => {
    it('renders the login screen by default', () => {
        render(<App />)

        // Check if the Google Login button is there
        const button = screen.getByRole('button', { name: /masuk dengan google/i })
        expect(button).toBeInTheDocument()

        // Check main title
        expect(screen.getByText('Penghuni')).toBeInTheDocument()
    })
})
