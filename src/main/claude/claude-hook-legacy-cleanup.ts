import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  getManagedScriptFileName,
  getStatusLineScriptFileName,
  removeManagedHooks,
  removeManagedStatusLine,
  type ClaudeCompatibleHookSettings
} from './hook-settings'
import { readHooksJson, writeHooksJson } from '../agent-hooks/installer-utils'

export function cleanupLegacyClaudeConfig(
  configPath: string,
  settings: ClaudeCompatibleHookSettings
): void {
  if (settings.configDirName !== '.claude') {
    return
  }
  const legacyPath = join(homedir(), '.claude', 'settings.json')
  if (sameResolvedPath(configPath, legacyPath) || !existsSync(legacyPath)) {
    return
  }
  // Why: tidying a file Claude no longer reads must never block the real install.
  try {
    const legacyConfig = readHooksJson(legacyPath)
    if (!legacyConfig) {
      return
    }
    const { config: hooksRemoved, changed: hooksChanged } = removeManagedHooks(
      legacyConfig,
      getManagedScriptFileName(settings)
    )
    const { config: nextConfig, changed: statusLineChanged } = removeManagedStatusLine(
      hooksRemoved,
      getStatusLineScriptFileName(settings)
    )
    if (hooksChanged || statusLineChanged) {
      writeHooksJson(legacyPath, nextConfig)
    }
  } catch (error) {
    console.warn(
      '[claude-hooks] could not remove legacy hooks from ~/.claude/settings.json:',
      error
    )
  }
}

function sameResolvedPath(left: string, right: string): boolean {
  const resolveRealPath = (path: string): string => {
    try {
      return realpathSync.native(path)
    } catch {
      return resolve(path)
    }
  }
  return resolveRealPath(left) === resolveRealPath(right)
}
