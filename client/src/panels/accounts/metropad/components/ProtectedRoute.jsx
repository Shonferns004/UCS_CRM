import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth.js'
import LoadingSpinner from './LoadingSpinner.jsx'

function ProtectedRoute({ children }) {
  const { user, tokenReady } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (tokenReady && !user) {
      navigate('/login', { replace: true })
    }
  }, [tokenReady, user, navigate])

  if (!tokenReady) {
    return <LoadingSpinner fullPage message="Loading..." />
  }

  if (!user) {
    return <LoadingSpinner fullPage message="Redirecting..." />
  }

  return children
}

export default ProtectedRoute
