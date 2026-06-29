import type { ReactNode } from 'react'
import { RefreshCw, Wifi } from 'lucide-react'
import type { OnlineDeviceListItem } from '../types'
import { EmptyState } from './EmptyState'
import { SkeletonRows } from './SkeletonRows'

type NearbyDevicesPanelProps = {
  devices: OnlineDeviceListItem[]
  discoveryHint: string
  isScanning: boolean
  renderDeviceCard: (device: OnlineDeviceListItem) => ReactNode
  onRescan: () => void
}

export function NearbyDevicesPanel({
  devices,
  discoveryHint,
  isScanning,
  renderDeviceCard,
  onRescan,
}: NearbyDevicesPanelProps) {
  return (
    <section className="dd-snaplink__nearby dd-snaplink__workbench-page is-nearby" aria-label="附近设备">
      <div className="dd-snaplink__section-head">
        <span>
          <strong>附近设备</strong>
          <small>{discoveryHint}</small>
        </span>
        <button
          type="button"
          className={isScanning ? 'is-loading' : ''}
          aria-busy={isScanning}
          onClick={onRescan}
        >
          <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
          {isScanning ? '扫描中' : '重新扫描'}
        </button>
      </div>
      {devices.length > 0 ? (
        <div className={`dd-snaplink__workbench-device-list${isScanning ? ' is-scanning' : ''}`}>
          {devices.map(renderDeviceCard)}
        </div>
      ) : isScanning ? (
        <SkeletonRows label="正在扫描附近设备" />
      ) : (
        <EmptyState
          className="dd-snaplink__nearby-empty"
          icon={(
            <span className="dd-snaplink__radar" aria-hidden="true">
              <Wifi size={26} strokeWidth={1.8} />
            </span>
          )}
          title="暂无附近设备"
          description={<p>请确认设备连接到同一 Wi-Fi / 局域网，并在对方设备上打开 DD直连。</p>}
        />
      )}
    </section>
  )
}
