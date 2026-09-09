/**
 * Canvas node renderers: image (attachment or base64), text prompt, and the
 * generation config form. Data mutations flow through the canvas bridge
 * context, never through node data props.
 */
import { useEffect, useRef, useState, type FC } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { fetchAttachmentBlob } from '../image-cache.js'
import { useCanvasBridge } from './canvas-bridge.js'
import type { ConfigNodeData, ImageNodeData, TextNodeData } from './canvas-model.js'

type ImageNodeType = Node<ImageNodeData, 'image'>
type TextNodeType = Node<TextNodeData, 'text'>
type ConfigNodeType = Node<ConfigNodeData, 'config'>

const CANVAS_NODE_DICT = {
  zh: {
    imageDownload: '下载原图',
    imageBroken: '图片加载失败',
    textPlaceholder: '输入提示词片段…（连接到配置节点作为提示词）',
    configPrompt: '提示词',
    configProvider: 'Provider',
    configModel: '模型',
    configRatio: '比例',
    configQuality: '清晰度',
    configCount: '张数',
    generate: '生成',
    generating: '生成中…',
    notConfigured: '该 Provider 未配置 Key',
    noPrompt: '请先输入提示词',
    deleteNode: '删除节点',
  },
  en: {
    imageDownload: 'Download original',
    imageBroken: 'Failed to load image',
    textPlaceholder: 'Prompt fragment… (connect to a config node)',
    configPrompt: 'Prompt',
    configProvider: 'Provider',
    configModel: 'Model',
    configRatio: 'Ratio',
    configQuality: 'Quality',
    configCount: 'Count',
    generate: 'Generate',
    generating: 'Generating…',
    notConfigured: 'Provider key not configured',
    noPrompt: 'Enter a prompt first',
    deleteNode: 'Delete node',
  },
} as const

/** Attachment-backed or base64 image node; source handle feeds config nodes. */
export const CanvasImageNode: FC<NodeProps<ImageNodeType>> = ({ data, id }) => {
  const bridge = useCanvasBridge()
  const dict = CANVAS_NODE_DICT[bridge?.lang ?? 'zh']
  const [url, setUrl] = useState<string>()
  const [failed, setFailed] = useState(false)
  const urlRef = useRef<string>()
  const attachment = data.attachment
  const encoded = data.encoded

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    if (attachment !== undefined) {
      fetchAttachmentBlob(attachment)
        .then(blob => {
          if (cancelled) return
          if (urlRef.current) URL.revokeObjectURL(urlRef.current)
          const next = URL.createObjectURL(blob)
          urlRef.current = next
          setUrl(next)
        })
        .catch(() => { if (!cancelled) setFailed(true) })
    } else if (encoded !== undefined) {
      setUrl(`data:${encoded.mediaType};base64,${encoded.data}`)
    } else {
      setUrl(undefined)
    }
    return () => {
      cancelled = true
    }
  }, [attachment?.attachmentId, encoded?.data])

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  const download = () => {
    if (attachment === undefined || url === undefined) return
    const a = document.createElement('a')
    a.href = url
    a.download = `dsh-image-gen-${id}.png`
    a.click()
  }

  return (
    <div className={`dcv-node dcv-node-image${attachment === undefined && encoded === undefined ? ' dcv-node-image-empty' : ''}`}>
      <Handle type="source" position={Position.Right} className="dcv-handle" />
      <button type="button" className="dcv-node-delete" title={dict.deleteNode} onClick={() => bridge?.deleteNode(id)}>×</button>
      {data.pending === true
        ? <div className="dcv-image dcv-image-pending" title={data.prompt ?? ''}><span className="dcv-spinner" /></div>
        : data.error !== undefined
          ? <div className="dcv-image dcv-image-error">{data.error}</div>
          : failed
            ? <div className="dcv-image dcv-image-error">{dict.imageBroken}</div>
            : url !== undefined
              ? (
                <div className="dcv-image-wrap">
                  <img className="dcv-image" src={url} alt={data.prompt ?? 'canvas image'} title={data.prompt ?? ''} draggable={false} />
                  {attachment !== undefined
                    ? (
                      <button type="button" className="dcv-image-dl" title={dict.imageDownload} onClick={download}>
                        ⤓
                      </button>
                    )
                    : null}
                </div>
              )
              : <div className="dcv-image dcv-image-loading" />}
      {data.prompt !== undefined && data.prompt.length > 0
        ? <div className="dcv-node-caption" title={data.prompt}>{data.prompt}</div>
        : null}
    </div>
  )
}

/** Free-form prompt fragment node. */
export const CanvasTextNode: FC<NodeProps<TextNodeType>> = ({ data, id }) => {
  const bridge = useCanvasBridge()
  const dict = CANVAS_NODE_DICT[bridge?.lang ?? 'zh']
  return (
    <div className="dcv-node dcv-node-text">
      <Handle type="source" position={Position.Right} className="dcv-handle" />
      <button type="button" className="dcv-node-delete" title={dict.deleteNode} onClick={() => bridge?.deleteNode(id)}>×</button>
      <textarea
        className="dcv-textarea"
        placeholder={dict.textPlaceholder}
        value={data.text}
        spellCheck={false}
        onChange={event => bridge?.updateNodeData(id, { text: event.target.value })}
      />
    </div>
  )
}

/** Generation config form; incoming edges contribute prompt text and reference images. */
export const CanvasConfigNode: FC<NodeProps<ConfigNodeType>> = ({ data, id }) => {
  const bridge = useCanvasBridge()
  const dict = CANVAS_NODE_DICT[bridge?.lang ?? 'zh']
  const profiles = bridge?.profiles ?? []
  const profile = profiles.find(candidate => candidate.provider === data.provider)
  const disabled = data.generating === true
  const update = (patch: Record<string, unknown>) => bridge?.updateNodeData(id, patch)
  return (
    <div className="dcv-node dcv-node-config">
      <Handle type="target" position={Position.Left} className="dcv-handle" />
      <button type="button" className="dcv-node-delete" title={dict.deleteNode} onClick={() => bridge?.deleteNode(id)}>×</button>
      <div className="dcv-config-grid">
        <label className="dcv-config-cell">
          <span>{dict.configProvider}</span>
          <select
            value={data.provider}
            disabled={disabled}
            onChange={event => {
              const next = profiles.find(candidate => candidate.provider === event.target.value)
              update({
                provider: event.target.value,
                model: next?.model ?? '',
                ratio: next?.defaultRatio ?? '1:1',
                quality: next?.defaultQuality ?? '1K',
              })
            }}
          >
            {profiles.length === 0 ? <option value={data.provider}>{data.provider}</option> : null}
            {profiles.map(candidate => (
              <option key={candidate.provider} value={candidate.provider}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>
        <label className="dcv-config-cell">
          <span>{dict.configRatio}</span>
          <select value={data.ratio} disabled={disabled} onChange={event => update({ ratio: event.target.value })}>
            {(profile?.ratioOptions ?? []).map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
            {(profile?.ratioOptions ?? []).length === 0 ? <option value={data.ratio}>{data.ratio}</option> : null}
          </select>
        </label>
        <label className="dcv-config-cell">
          <span>{dict.configQuality}</span>
          <select value={data.quality} disabled={disabled} onChange={event => update({ quality: event.target.value })}>
            {(profile?.qualityOptions ?? []).map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
            {(profile?.qualityOptions ?? []).length === 0 ? <option value={data.quality}>{data.quality}</option> : null}
          </select>
        </label>
        <label className="dcv-config-cell">
          <span>{dict.configCount}</span>
          <select
            value={String(data.count)}
            disabled={disabled}
            onChange={event => update({ count: Number(event.target.value) || 1 })}
          >
            {[1, 2, 3, 4].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <textarea
        className="dcv-textarea dcv-config-prompt"
        placeholder={dict.configPrompt}
        value={data.prompt}
        spellCheck={false}
        disabled={disabled}
        onChange={event => update({ prompt: event.target.value })}
      />
      <div className="dcv-config-foot">
        <button
          type="button"
          className="dcv-generate"
          disabled={disabled || profile?.configured === false}
          title={profile?.configured === false ? dict.notConfigured : undefined}
          onClick={() => bridge?.requestGenerate(id)}
        >
          {disabled ? dict.generating : dict.generate}
        </button>
        {data.error !== undefined && data.error.length > 0
          ? <span className="dcv-config-error" title={data.error}>{data.error}</span>
          : null}
      </div>
    </div>
  )
}

export const canvasNodeTypes = {
  image: CanvasImageNode,
  text: CanvasTextNode,
  config: CanvasConfigNode,
} as const
