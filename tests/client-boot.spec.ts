import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/client/index.js'

describe('DSH 0.1.7 client boot', () => {
  it('registers every contribution against the host slot contracts', () => {
    const slots = new SlotCore()
    slots.register({
      name: 'root',
      children: {
        'settings.section': { kind: 'list', scope: 'root' },
        'tool.call.toolview': { kind: 'keyed', scope: 'session' },
        'conversation.chat.turnTail': { kind: 'list', scope: 'session' },
      },
    }, () => null)

    const ctx = {
      configForms: { get: () => ({}) },
      get: () => undefined,
      effect: () => undefined,
      inject: () => undefined,
      slots: {
        register: slots.register.bind(slots),
        inject: (_name: string, register: () => void) => register(),
      },
    } as unknown as Parameters<typeof apply>[0]

    expect(() => apply(ctx)).not.toThrow()
    expect(slots.entries('settings.section')).toHaveLength(1)
    expect(slots.entries('conversation.chat.turnTail')).toHaveLength(1)
  })
})
