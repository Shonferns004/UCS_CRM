import { useState, useCallback } from 'react'

export default function usePagination(initialPage = 1, initialLimit = 20) {
  const [page, setPage] = useState(initialPage)
  const [limit, setLimit] = useState(initialLimit)
  const reset = useCallback(() => setPage(1), [])
  return { page, setPage, limit, setLimit, reset }
}
