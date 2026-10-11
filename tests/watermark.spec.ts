import { describe, expect, it } from 'vitest'
import { resolveProvider } from '../src/config.js'
import { compatEditExtraBody, compatEditFormat, compatGenerationExtraBody, compatWatermarkField } from '../src/watermark.js'
import { studioProfile } from '../src/studio.js'
import { studioWatermarkCapability } from '../src/shared.js'

const qwen = { provider: 'openai-compat' as const, openaiCompatBaseURL: 'https://workspace-123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', openaiCompatModel: 'qwen-image-3.0' }
const sense = { provider: 'openai-compat' as const, openaiCompatBaseURL: 'https://token.sensenova.cn/v1', openaiCompatModel: 'sensenova-u1.5-lite' }

describe('operation-specific watermark contracts', () => {
  it('exposes native Seedream and Qwen controls without extra-field configuration', () => {
    for (const provider of ['seedream', 'dashscope'] as const) {
      const profile = studioProfile({}, provider, false)
      expect(studioWatermarkCapability(profile, 'generate').status).toBe('supported')
      expect(studioWatermarkCapability(profile, 'edit').status).toBe('supported')
    }
    expect(studioWatermarkCapability(studioProfile({}, 'zhipu', true), 'generate')).toEqual({ status: 'unknown', reason: 'account-unconfirmed' })
    expect(studioWatermarkCapability(studioProfile({}, 'google', true), 'generate').status).toBe('unavailable')
  })
  it('recognizes official Qwen workspace endpoints in each documented region', () => {
    for (const region of ['cn-beijing', 'ap-southeast-1', 'us-east-1', 'eu-central-1', 'ap-northeast-1', 'cn-hongkong']) {
      const config = { ...qwen, openaiCompatBaseURL: `https://workspace-123.${region}.maas.aliyuncs.com/compatible-mode/v1/` }
      expect(compatWatermarkField(config)).toBe('watermark')
      expect(compatWatermarkField(config, 'edit')).toBe('watermark')
      expect(resolveProvider(config)).toMatchObject({ editFormat: 'qwenJson' })
    }
  })
  it('does not classify a proxy, wrong path, model, query, or port as an official Qwen contract', () => {
    for (const openaiCompatBaseURL of ['https://relay.example/compatible-mode/v1', `${qwen.openaiCompatBaseURL}?proxy=1`, 'https://workspace-123.cn-beijing.maas.aliyuncs.com.evil.example/compatible-mode/v1', 'https://workspace-123.cn-beijing.maas.aliyuncs.com:8443/compatible-mode/v1', 'https://workspace-123.cn-beijing.maas.aliyuncs.com/api/v1']) {
      expect(compatWatermarkField({ ...qwen, openaiCompatBaseURL })).toBeUndefined()
    }
    expect(compatWatermarkField({ ...qwen, openaiCompatModel: 'custom-image' })).toBeUndefined()
    expect(compatWatermarkField({ ...qwen, openaiCompatExtraBody: { model: 'custom-image' } })).toBeUndefined()
    expect(compatWatermarkField({ ...qwen, openaiCompatEditExtra: { model: 'custom-image' } }, 'edit')).toBeUndefined()
  })
  it('automatically chooses SenseNova JSON editing independently of generation extras', () => {
    expect(resolveProvider(sense)).toMatchObject({ editFormat: 'jsonImageUrlArray' })
    expect(compatWatermarkField(sense, 'edit')).toBe('watermark')
    expect(compatEditExtraBody({ ...sense, openaiCompatExtraBody: { watermark: true, prompt_extend: false } }, 'off')).toEqual({ watermark: false })
    expect(compatEditExtraBody(sense, 'default')).toBeUndefined()
  })
  it('requires a separate JSON edit binding for unknown relays and preserves its siblings', () => {
    const config = { openaiCompatEditFormat: 'jsonImageUrlArray' as const, openaiCompatExtraBody: { watermark: true, genOnly: 123 }, openaiCompatEditExtra: { parameters: { watermark: false, seed: 0 }, prompt_extend: false } }
    expect(compatWatermarkField(config)).toBe('watermark')
    expect(compatWatermarkField(config, 'edit')).toBe('parameters.watermark')
    expect(compatEditExtraBody(config, 'on')).toEqual({ parameters: { watermark: true, seed: 0 }, prompt_extend: false })
    expect(config.openaiCompatEditExtra.parameters).toEqual({ watermark: false, seed: 0 })
    expect(compatGenerationExtraBody(config, 'off')).toEqual({ watermark: false, genOnly: 123 })
    expect(compatWatermarkField({ ...config, openaiCompatEditFormat: 'multipart' }, 'edit')).toBeUndefined()
    expect(compatEditFormat({ ...config, openaiCompatEditFormat: 'multipart' })).toBe('multipart')
    expect(compatWatermarkField({ openaiCompatExtraBody: { watermark: false } }, 'edit')).toBeUndefined()
  })
})
