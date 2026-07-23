import { useEffect, useState } from 'react'

export function useVisibilityRefetch(defaultInterval = 30_000): number | false {
  const [interval, setInterval] = useState<number | false>(defaultInterval)
  useEffect(() => {
    function handleVisibility() {
      setInterval(document.visibilityState === 'visible' ? defaultInterval : false)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [defaultInterval])
  return interval
}