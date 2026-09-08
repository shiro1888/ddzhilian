import { useState } from 'react'
import {
  ArrowRight,
  Check,
  Copy,
  FileUp,
  KeyRound,
  MessageSquare,
  Monitor,
  Radio,
  RotateCw,
  Search,
  ShieldCheck,
  Upload,
  Wifi,
} from 'lucide-react'
import type { OnlineDeviceListItem } from '../types'
import {
  isSnapLinkDeviceTrusted,
  resolveSnapLinkDeviceKind,
  resolveSnapLinkTransportMode,
  resolveSnapLinkTrustLabel,
} from '../../lib/device-display'
import { DeviceRadar } from './DeviceRadar'
import { WorkbenchDeviceIcon } from './WorkbenchDeviceIcon'

type WorkbenchDevicesPageProps = {
  devices: OnlineDeviceListItem[]
  selectedDevice: OnlineDeviceListItem | null
  onlineCount: number
  searchQuery: string
  isScanning: boolean
  trustedDeviceIds: Set<string>
  onSearchChange: (value: string) => void
  onRescan: () => void
  onSelectDevice: (deviceId: string) => void
  onSendText: (deviceId: string) => void
  onSendFile: (deviceId: string) => void
  onTrustDevice: (deviceId: string) => void
  onPairByCode?: (shortCode: string) => void
  myDeviceName?: string
  myShortCode?: string
}

export function WorkbenchDevicesPage({
  devices,
  selectedDevice,
  onlineCount,
  searchQuery,
  isScanning,
  trustedDeviceIds,
  onSearchChange,
  onRescan,
  onSelectDevice,
  onSendText,
  onSendFile,
  onTrustDevice,
  onPairByCode,
  myDeviceName,
  myShortCode,
}: WorkbenchDevicesPageProps) {
  const [manualCodeDraft, setManualCodeDraft] = useState('')
  const [manualCodeError, setManualCodeError] = useState<string | null>(null)
  const [copiedMyCode, setCopiedMyCode] = useState(false)
  const [copiedTargetCode, setCopiedTargetCode] = useState(false)
  const [mobileTab, setMobileTab] = useState<'radar' | 'list'>('radar')

  const activeDevice = selectedDevice
  const isDeviceTrusted = activeDevice ? isSnapLinkDeviceTrusted(activeDevice, trustedDeviceIds) : false

  const normalizedDeviceQuery = searchQuery.trim().toLowerCase()
  const filteredDeviceItems = devices.filter((device) => {
    if (!normalizedDeviceQuery) {
      return true
    }

    return [
      device.deviceName,
      device.platform,
      device.scopeLabel,
      device.shortCode,
    ].filter(Boolean).join(' ').toLowerCase().includes(normalizedDeviceQuery)
  })

  const handleManualCodeSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = manualCodeDraft.trim().toUpperCase()
    if (!trimmed) {
      setManualCodeError('请输入 6 位短码')
      return
    }
    if (trimmed.length < 4) {
      setManualCodeError('短码格式不正确')
      return
    }
    setManualCodeError(null)
    onPairByCode?.(trimmed)
  }

  const handleCopyMyCode = () => {
    if (!myShortCode) return
    void navigator.clipboard.writeText(myShortCode).then(() => {
      setCopiedMyCode(true)
      setTimeout(() => setCopiedMyCode(false), 2000)
    })
  }

  const handleCopyTargetCode = (code: string) => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopiedTargetCode(true)
      setTimeout(() => setCopiedTargetCode(false), 2000)
    })
  }

  return (
    <section className="dd-snaplink__devices-shell" aria-label="设备工作台">
      {/* 移动端顶部 Tab 切换 */}
      <div className="dd-snaplink__devices-mobile-nav" role="tablist" aria-label="移动端视图切换">
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'radar'}
          className={`dd-snaplink__devices-mobile-tab${mobileTab === 'radar' ? ' is-active' : ''}`}
          onClick={() => setMobileTab('radar')}
        >
          <Radio size={15} strokeWidth={2.2} />
          <span>设备雷达</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'list'}
          className={`dd-snaplink__devices-mobile-tab${mobileTab === 'list' ? ' is-active' : ''}`}
          onClick={() => setMobileTab('list')}
        >
          <Monitor size={15} strokeWidth={2} />
          <span>在线列表 ({devices.length})</span>
        </button>
      </div>

      {/* 左侧设备列表列 */}
      <aside
        className={`dd-snaplink__conversation-side${mobileTab === 'radar' ? ' is-hidden-on-mobile' : ''}`}
        aria-label="设备列表"
      >
        <div className="dd-snaplink__conversation-side-head">
          <span>
            <strong>附近设备</strong>
            <small>{onlineCount.toString()} 台设备在线 · 可互传</small>
          </span>
          <button
            type="button"
            className="dd-snaplink__devices-refresh-btn"
            onClick={onRescan}
            disabled={isScanning}
            title="重新扫描周围设备"
          >
            <RotateCw size={13} className={isScanning ? 'is-spinning' : ''} />
            <span>查找</span>
          </button>
        </div>
        <label className="dd-snaplink__conversation-side-search">
          <span className="sr-only">搜索设备</span>
          <Search size={15} strokeWidth={1.9} aria-hidden="true" />
          <input
            value={searchQuery}
            placeholder="搜索设备名称 / 短码"
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {searchQuery ? (
            <button
              type="button"
              aria-label="清空设备搜索"
              onClick={() => onSearchChange('')}
            >
              ×
            </button>
          ) : null}
        </label>
        <div className={`dd-snaplink__conversation-side-list${isScanning ? ' is-scanning' : ''}`}>
          {filteredDeviceItems.map((device) => {
            const isActive = activeDevice?.deviceId === device.deviceId

            return (
              <button
                key={device.deviceId}
                type="button"
                className={[
                  'dd-snaplink__conversation-row',
                  'is-device',
                  isActive ? 'is-active' : '',
                ].filter(Boolean).join(' ')}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  onSelectDevice(device.deviceId)
                  // 在手机端选定后切回雷达/详情视图
                  if (typeof window !== 'undefined' && window.innerWidth <= 768) {
                    setMobileTab('radar')
                  }
                }}
                onDoubleClick={() => onSendText(device.deviceId)}
                title={`打开 ${device.deviceName}（双击进入会话）`}
              >
                <span className="dd-snaplink__conversation-avatar is-device" aria-hidden="true">
                  {Array.from(device.deviceName.trim() || '设')[0].toUpperCase()}
                  <i className="is-online" />
                </span>
                <span className="dd-snaplink__conversation-main">
                  <span className="dd-snaplink__conversation-title">
                    <strong>{device.deviceName}</strong>
                    <em>{device.platform || '设备'}</em>
                  </span>
                  <small>{device.scopeLabel || '附近设备'} · {device.lastSeenLabel || '在线'}</small>
                </span>
                <span className="dd-snaplink__conversation-side-meta">
                  <small>在线</small>
                  <em>{device.shortCode || '直连'}</em>
                </span>
              </button>
            )
          })}
          {devices.length === 0 ? (
            <div className="dd-snaplink__conversation-empty dd-snaplink__devices-empty-placeholder">
              <Radio size={22} strokeWidth={1.8} className="dd-snaplink__devices-empty-icon" />
              <strong>暂无附近设备</strong>
              <small>正在持续扫描局域网广播...</small>
            </div>
          ) : filteredDeviceItems.length === 0 ? (
            <div className="dd-snaplink__conversation-empty">
              没有找到相关设备
            </div>
          ) : null}
        </div>

        {/* 侧栏底部：我的短码卡片 */}
        {myShortCode ? (
          <div className="dd-snaplink__devices-side-footer">
            <span>本机直连短码</span>
            <button
              type="button"
              className="dd-snaplink__devices-side-code-pill"
              onClick={handleCopyMyCode}
              title="点击复制本机短码"
            >
              <strong>{myShortCode}</strong>
              {copiedMyCode ? <Check size={12} className="is-success" /> : <Copy size={12} />}
            </button>
          </div>
        ) : null}
      </aside>

      {/* 右侧主舞台 */}
      <div
        className={`dd-snaplink__devices-detail${mobileTab === 'list' ? ' is-hidden-on-mobile' : ''}`}
        aria-label="设备详情与雷达"
      >
        {/* 舞台顶栏 */}
        <div className="dd-snaplink__devices-stage-head">
          <div className="dd-snaplink__devices-stage-head-title">
            <strong>局域网设备雷达</strong>
            <span className="dd-snaplink__devices-stage-tag">
              <Wifi size={12} strokeWidth={2.4} aria-hidden="true" />
              同一局域网 · 0 流量极速直连
            </span>
          </div>
          <div className="dd-snaplink__devices-stage-head-meta">
            <div className="dd-snaplink__devices-scan-badge">
              <span className={`dd-snaplink__pulse-dot${isScanning ? ' is-active' : ''}`} />
              <span>{isScanning ? '正在扫描设备...' : '雷达持续监听中'}</span>
            </div>
            {myShortCode ? (
              <button
                type="button"
                className="dd-snaplink__devices-code-chip"
                onClick={handleCopyMyCode}
                title="点击复制本机直连短码"
              >
                <span>本机短码</span>
                <strong>{myShortCode}</strong>
                {copiedMyCode ? <Check size={13} className="is-success" /> : <Copy size={13} />}
              </button>
            ) : null}
            <button
              type="button"
              className="dd-snaplink__devices-stage-rescan-btn"
              onClick={onRescan}
              disabled={isScanning}
            >
              <RotateCw size={13} className={isScanning ? 'is-spinning' : ''} />
              <span>重新扫描</span>
            </button>
          </div>
        </div>

        {/* 舞台主体：雷达 + 设备详情/中枢面板 */}
        <div className="dd-snaplink__devices-stage-body">
          {/* 雷达卡片容器 */}
          <div className="dd-snaplink__devices-radar-wrapper">
            <DeviceRadar
              devices={devices}
              selectedDeviceId={activeDevice?.deviceId ?? null}
              renderIcon={(device) => <WorkbenchDeviceIcon device={device} />}
              onSelect={onSelectDevice}
              onOpenConversation={onSendText}
              myDeviceName={myDeviceName}
            />
          </div>

          {/* 右侧：选中设备卡片 OR 待配对中枢 */}
          {activeDevice ? (
            <section className="dd-snaplink__device-detail-card" aria-label="设备详细信息">
              {/* 设备头部 */}
              <div className="dd-snaplink__device-detail-hero">
                <span
                  className={`dd-snaplink__device-detail-icon is-${resolveSnapLinkDeviceKind(activeDevice.platform)}`}
                  aria-hidden="true"
                >
                  <WorkbenchDeviceIcon device={activeDevice} />
                </span>
                <div className="dd-snaplink__device-detail-hero-info">
                  <div className="dd-snaplink__device-detail-title-row">
                    <strong>{activeDevice.deviceName}</strong>
                    <span className="dd-snaplink__device-online-pill">
                      <i className="is-online" /> 在线
                    </span>
                  </div>
                  <small>{activeDevice.scopeLabel || '附近设备'} · {activeDevice.lastSeenLabel || '刚刚活跃'}</small>
                </div>
              </div>

              {/* 规格四宫格 */}
              <dl className="dd-snaplink__device-detail-meta">
                <div>
                  <dt>设备平台</dt>
                  <dd>{activeDevice.platform || '通用系统'}</dd>
                </div>
                <div>
                  <dt>直连短码</dt>
                  <dd className="dd-snaplink__device-shortcode-dd">
                    <span>{activeDevice.shortCode || '未公开'}</span>
                    {activeDevice.shortCode ? (
                      <button
                        type="button"
                        className="dd-snaplink__copy-inline-btn"
                        onClick={() => handleCopyTargetCode(activeDevice.shortCode!)}
                        title="复制对端短码"
                      >
                        {copiedTargetCode ? <Check size={12} className="is-success" /> : <Copy size={12} />}
                      </button>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>连接通道</dt>
                  <dd>{resolveSnapLinkTransportMode(activeDevice).label}</dd>
                </div>
                <div>
                  <dt>安全信任</dt>
                  <dd className={isDeviceTrusted ? 'is-trusted' : 'is-unverified'}>
                    {resolveSnapLinkTrustLabel(activeDevice, isDeviceTrusted)}
                  </dd>
                </div>
              </dl>

              {/* 操作按钮组 */}
              <div className="dd-snaplink__device-detail-actions">
                <button
                  type="button"
                  className="is-primary"
                  onClick={() => onSendFile(activeDevice.deviceId)}
                >
                  <FileUp size={15} strokeWidth={2.2} />
                  <span>发文件</span>
                </button>
                <button
                  type="button"
                  className="is-secondary"
                  onClick={() => onSendText(activeDevice.deviceId)}
                >
                  <MessageSquare size={15} strokeWidth={2} />
                  <span>发消息</span>
                </button>
                <button
                  type="button"
                  className="is-tertiary"
                  onClick={() => onTrustDevice(activeDevice.deviceId)}
                >
                  <ShieldCheck size={15} strokeWidth={2} />
                  <span>{isDeviceTrusted ? '重新校验' : '校验设备'}</span>
                </button>
              </div>

              {/* 快速拖拽/点击发送文件交互区 */}
              <div
                className="dd-snaplink__device-quick-drop"
                onClick={() => onSendFile(activeDevice.deviceId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSendFile(activeDevice.deviceId)
                  }
                }}
                title={`向 ${activeDevice.deviceName} 发送文件`}
              >
                <Upload size={18} strokeWidth={2} />
                <span>点击选择文件 或 拖拽至此直接发送</span>
                <small>局域网免流量高速直传 · 支持多文件与任意格式</small>
              </div>
            </section>
          ) : (
            <div className="dd-snaplink__devices-station-stack">
              {/* 1. 等待雷达发现 */}
              <section className="dd-snaplink__device-detail-card is-empty-hub">
                <div className="dd-snaplink__device-empty-icon-box">
                  <Radio size={28} strokeWidth={2} className={isScanning ? 'is-pulse' : ''} />
                </div>
                <div className="dd-snaplink__device-detail-copy">
                  <strong>等待附近设备</strong>
                  <small>
                    局域网雷达持续监听中，自动探测周围同网设备。请确保对端设备保持连接在同一 Wi-Fi 或局域网，并已打开 DD直连。
                  </small>
                </div>
                <div className="dd-snaplink__device-detail-actions">
                  <button type="button" className="is-primary" onClick={onRescan} disabled={isScanning}>
                    <RotateCw size={13} className={isScanning ? 'is-spinning' : ''} />
                    <span>重新查找设备</span>
                  </button>
                </div>
              </section>

              {/* 2. 跨网段短码直连 */}
              <section className="dd-snaplink__device-detail-card is-code-card">
                <div className="dd-snaplink__device-code-head">
                  <span className="dd-snaplink__device-code-icon" aria-hidden="true">
                    <KeyRound size={18} strokeWidth={2} />
                  </span>
                  <div>
                    <strong>跨网段短码直连</strong>
                    <small>若处于不同 Wi-Fi、跨路由或手机热点，输入对端 6 位短码即可点对点极速连接</small>
                  </div>
                </div>
                <form className="dd-snaplink__device-code-form" onSubmit={handleManualCodeSubmit}>
                  <input
                    value={manualCodeDraft}
                    placeholder="输入对端 6 位短码 (如 LZ2QD8)"
                    maxLength={12}
                    onChange={(e) => {
                      setManualCodeDraft(e.target.value.toUpperCase())
                      setManualCodeError(null)
                    }}
                  />
                  <button type="submit" disabled={!manualCodeDraft.trim()}>
                    <span>直连</span>
                    <ArrowRight size={14} strokeWidth={2.4} />
                  </button>
                </form>
                {manualCodeError ? (
                  <p className="dd-snaplink__device-code-error">{manualCodeError}</p>
                ) : null}
              </section>

              {/* 3. 局域网协议与安全保障 */}
              <div className="dd-snaplink__device-station-badges">
                <span>
                  <Wifi size={13} strokeWidth={2} />
                  局域网零流量秒传
                </span>
                <span>
                  <ShieldCheck size={13} strokeWidth={2} />
                  DTLS-SRTP 物理加密
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

