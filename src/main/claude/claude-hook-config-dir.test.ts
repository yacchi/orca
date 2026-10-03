import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/userData'
  }
}))

import { ClaudeHookService } from './hook-service'
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

  it('installs in CLAUDE_CONFIG_DIR and cleans only managed entries from legacy settings', () => {
    const configDir = join(home, 'profiles', 'orca')
    const targetPath = join(configDir, 'settings.json')
    const legacyPath = join(home, '.claude', 'settings.json')
    vi.stubEnv('CLAUDE_CONFIG_DIR', configDir)
    mkdirSync(configDir, { recursive: true })
    mkdirSync(join(home, '.claude'), { recursive: true })
    const userHook = { hooks: [{ type: 'command', command: '/usr/local/bin/user-hook' }] }
    writeFileSync(
      legacyPath,
      JSON.stringify({
        unrelated: true,
        hooks: {
          Stop: [
            { hooks: [{ type: 'command', command: '/home/me/.orca/agent-hooks/claude-hook.sh' }] },
            userHook
          ]
        },
        statusLine: { type: 'command', command: '/home/me/.orca/agent-hooks/claude-statusline.sh' }
      })
    )
    writeFileSync(targetPath, '{}')

    expect(new ClaudeHookService().install({ claudeVersion: '1.0.63' }).configPath).toBe(targetPath)
    const target = JSON.parse(readFileSync(targetPath, 'utf8'))
    const legacy = JSON.parse(readFileSync(legacyPath, 'utf8'))
    expect(target.hooks).toBeDefined()
    expect(legacy.unrelated).toBe(true)
    expect(legacy.hooks.Stop).toEqual([userHook])
    expect(legacy.statusLine).toBeUndefined()
    expect(existsSync(join(home, '.claude', 'settings.json.bak'))).toBe(true)
  })

  it('preserves a user statusLine and skips cleanup when the legacy file is absent or unparsable', () => {
    const configDir = join(home, 'profiles', 'orca')
    vi.stubEnv('CLAUDE_CONFIG_DIR', configDir)
    mkdirSync(configDir, { recursive: true })
    writeFileSync(join(configDir, 'settings.json'), '{}')

    expect(new ClaudeHookService().install({ claudeVersion: '1.0.63' }).state).toBe('installed')
    expect(existsSync(join(home, '.claude', 'settings.json'))).toBe(false)

    const legacyPath = join(home, '.claude', 'settings.json')
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(legacyPath, '{not-json')
    new ClaudeHookService().install({ claudeVersion: '1.0.63' })
    expect(readFileSync(legacyPath, 'utf8')).toBe('{not-json')

    writeFileSync(
      legacyPath,
      JSON.stringify({ statusLine: { type: 'command', command: 'user-status' } })
    )
    new ClaudeHookService().install({ claudeVersion: '1.0.63' })
    expect(JSON.parse(readFileSync(legacyPath, 'utf8')).statusLine.command).toBe('user-status')
    expect(existsSync(`${legacyPath}.bak`)).toBe(false)
  })

  it.skipIf(process.platform === 'win32')(
    'still installs into CLAUDE_CONFIG_DIR when the legacy cleanup cannot write',
    () => {
      const configDir = join(home, 'profiles', 'orca')
      const targetPath = join(configDir, 'settings.json')
      const legacyDir = join(home, '.claude')
      const legacyPath = join(legacyDir, 'settings.json')
      vi.stubEnv('CLAUDE_CONFIG_DIR', configDir)
      mkdirSync(configDir, { recursive: true })
      mkdirSync(legacyDir, { recursive: true })
      writeFileSync(targetPath, '{}')
      const legacyBefore = JSON.stringify({
        hooks: {
          Stop: [
            { hooks: [{ type: 'command', command: '/home/me/.orca/agent-hooks/claude-hook.sh' }] }
          ]
        }
      })
      writeFileSync(legacyPath, legacyBefore)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      chmodSync(legacyDir, 0o500)
      try {
        expect(new ClaudeHookService().install({ claudeVersion: '1.0.63' }).state).toBe('installed')
      } finally {
        chmodSync(legacyDir, 0o700)
        warn.mockRestore()
      }
      expect(JSON.parse(readFileSync(targetPath, 'utf8')).hooks).toBeDefined()
      expect(readFileSync(legacyPath, 'utf8')).toBe(legacyBefore)
    }
  )

  it('does not clean the legacy path when it is the same file as the target', () => {
    const configDir = join(home, '.claude')
    vi.stubEnv('CLAUDE_CONFIG_DIR', configDir)
    mkdirSync(configDir, { recursive: true })
    const settingsPath = join(configDir, 'settings.json')
    writeFileSync(settingsPath, '{}')

    expect(new ClaudeHookService().install({ claudeVersion: '1.0.63' }).configPath).toBe(
      settingsPath
    )
    expect(JSON.parse(readFileSync(settingsPath, 'utf8')).hooks).toBeDefined()
  })
})
