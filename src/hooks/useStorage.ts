import { useCallback } from 'react'
import {
  loadGameState,
  saveGameState,
  clearGameState,
  saveImage,
  loadImage,
  deleteImage,
  saveRegionMap,
  loadRegionMap,
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

  const storeRegionMap = useCallback(async (sessionId: string, regionMap: Int32Array) => {
    await saveRegionMap(sessionId, regionMap)
  }, [])

  const retrieveRegionMap = useCallback(async (sessionId: string): Promise<Int32Array | null> => {
    return loadRegionMap(sessionId)
  }, [])

  return { persistState, restoreState, wipeState, storeImage, retrieveImage, storeRegionMap, retrieveRegionMap }
}
