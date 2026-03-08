import { useCallback, useRef, useState } from 'react'
import OpenAI from 'openai'

export interface UseOpenAIResult {
  generate: (prompt: string, apiKey: string, size?: '1024x1024' | '1024x1536' | '1536x1024') => Promise<Blob | null>
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

  const generate = useCallback(async (prompt: string, apiKey: string, size: '1024x1024' | '1024x1536' | '1536x1024' = '1024x1536'): Promise<Blob | null> => {
    setError(null)
    setIsGenerating(true)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })

      const STYLE_SUFFIX = ' Photorealistic, sharp focus, natural colors. Crisp edges and clear boundaries between distinct color areas. No painterly brushwork, no soft blending or gradients, no watercolor or impressionist texture.'
      const response = await client.images.generate({
        model: 'gpt-image-1',
        prompt: prompt + STYLE_SUFFIX,
        n: 1,
        size,
        quality: 'medium',
      })

      if (abort.signal.aborted) return null

      const item = response.data?.[0]
      if (!item) throw new Error('No image returned')

      // gpt-image-1 returns base64; fall back to URL for other models
      if (item.b64_json) {
        const binary = atob(item.b64_json)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        return new Blob([bytes], { type: 'image/png' })
      }

      const url = item.url
      if (!url) throw new Error('No image data returned')
      const imgResponse = await fetch(url, { signal: abort.signal })
      if (!imgResponse.ok) throw new Error('Failed to fetch generated image')
      return imgResponse.blob()
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
