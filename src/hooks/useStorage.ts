import { useCallback } from 'react'
import {
  loadGameState,
  saveGameState,
  clearGameState,
  saveImage,
  loadImage,
  deleteImage,
  saveIndexMap,
  loadIndexMap,
} from '../game/storage'
import type { GameState } from '../types'

export function useStorage() {
  const persistState = useCallback((state: GameState) => {
    saveGameState(state)
  }, [])

  const restoreState = useCallback((): GameState | null => {
    return loadGameState()
  }, [])

  const wipeState = useCallback(async (sessionId?: string | null) => {
    clearGameState()
    if (sessionId) {
      await deleteImage(sessionId).catch(() => undefined)
    }
  }, [])

  const storeImage = useCallback(async (sessionId: string, blob: Blob) => {
    await saveImage(sessionId, blob)
  }, [])

  const retrieveImage = useCallback(async (sessionId: string): Promise<Blob | null> => {
    return loadImage(sessionId)
  }, [])

  const storeIndexMap = useCallback(async (sessionId: string, indexMap: Uint8Array) => {
    await saveIndexMap(sessionId, indexMap)
  }, [])

  const retrieveIndexMap = useCallback(async (sessionId: string): Promise<Uint8Array | null> => {
    return loadIndexMap(sessionId)
  }, [])

  return { persistState, restoreState, wipeState, storeImage, retrieveImage, storeIndexMap, retrieveIndexMap }
}
