import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/userData'
  }
}))

import { CLAUDE_HOOK_SETTINGS, getConfigPath, OPENCLAUDE_HOOK_SETTINGS } from './hook-settings'

describe('Claude hook config directory', () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'orca-claude-hook-config-dir-'))
    vi.stubEnv('HOME', home)
    vi.stubEnv('USERPROFILE', home)
    vi.stubEnv('CLAUDE_CONFIG_DIR', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(home, { recursive: true, force: true })
  })

  it.each([
    [undefined, join('HOME', '.claude', 'settings.json')],
    ['/x/profiles/orca', join('/x/profiles/orca', 'settings.json')],
    ['  ', join('HOME', '.claude', 'settings.json')]
  ])('resolves Claude settings for CLAUDE_CONFIG_DIR=%s', (configDir, expectedSuffix) => {
    vi.stubEnv('CLAUDE_CONFIG_DIR', configDir)
    const expected = expectedSuffix.replace('HOME', home)

    expect(getConfigPath()).toBe(expected)
  })

  it('keeps compatible settings and remote paths unchanged', () => {
    vi.stubEnv('CLAUDE_CONFIG_DIR', '/x/profiles/orca')

    expect(getConfigPath(OPENCLAUDE_HOOK_SETTINGS)).toBe(join(home, '.openclaude', 'settings.json'))
    expect(getConfigPath(CLAUDE_HOOK_SETTINGS)).toBe('/x/profiles/orca/settings.json')
  })
})
