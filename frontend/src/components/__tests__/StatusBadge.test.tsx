import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from '../StatusBadge'

describe('StatusBadge', () => {
  it('renders APPROVED status', () => {
    render(<StatusBadge status="APPROVED" />)
    expect(screen.getByText('APPROVED')).toBeInTheDocument()
  })

  it('renders REJECTED status', () => {
    render(<StatusBadge status="REJECTED" />)
    expect(screen.getByText('REJECTED')).toBeInTheDocument()
  })

  it('renders NEEDS_MANUAL_REVIEW as "Needs Review"', () => {
    render(<StatusBadge status="NEEDS_MANUAL_REVIEW" />)
    expect(screen.getByText('Needs Review')).toBeInTheDocument()
  })

  it('renders PENDING_REVIEW as "Pending Review"', () => {
    render(<StatusBadge status="PENDING_REVIEW" />)
    expect(screen.getByText('Pending Review')).toBeInTheDocument()
  })

  it('renders FAILED_PROCESSING as "Failed"', () => {
    render(<StatusBadge status="FAILED_PROCESSING" />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })
})
