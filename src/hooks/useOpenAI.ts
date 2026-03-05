import { useCallback, useRef, useState } from 'react'
import OpenAI from 'openai'

export interface UseOpenAIResult {
  generate: (prompt: string, apiKey: string) => Promise<Blob | null>
  isGenerating: boolean
  error: string | null
  cancel: () => void
}

export function useOpenAI(): UseOpenAIResult {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setIsGenerating(false)
  }, [])

  const generate = useCallback(async (prompt: string, apiKey: string): Promise<Blob | null> => {
    setError(null)
    setIsGenerating(true)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })

      const response = await client.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'url',
      })

      if (abort.signal.aborted) return null

      const url = response.data?.[0]?.url
      if (!url) throw new Error('No image URL returned')

      // Fetch the image as a blob
      const imgResponse = await fetch(url, { signal: abort.signal })
      if (!imgResponse.ok) throw new Error('Failed to fetch generated image')
      const blob = await imgResponse.blob()

      return blob
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return null
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      return null
    } finally {
      setIsGenerating(false)
    }
  }, [])

  return { generate, isGenerating, error, cancel }
}
