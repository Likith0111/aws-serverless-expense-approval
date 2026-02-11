import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import LoginPage from '../LoginPage'
import { AuthProvider } from '../../context/AuthContext'

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        {component}
      </AuthProvider>
    </BrowserRouter>
  )
}

describe('LoginPage', () => {
  it('renders login form', () => {
    renderWithRouter(<LoginPage />)
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows validation error for empty form submission', async () => {
    renderWithRouter(<LoginPage />)
    const submitButton = screen.getByRole('button', { name: /sign in/i })
    submitButton.click()
    
    await waitFor(() => {
      expect(screen.getByLabelText(/email address/i)).toBeRequired()
      expect(screen.getByLabelText(/password/i)).toBeRequired()
    })
  })
})
