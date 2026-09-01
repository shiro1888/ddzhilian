import { Laptop, Smartphone, Tablet } from 'lucide-react'
import type { OnlineDeviceListItem } from '../types'
import { resolveSnapLinkDeviceKind } from '../../lib/device-display'

export function WorkbenchDeviceIcon({ device }: { device: OnlineDeviceListItem }) {
  const kind = resolveSnapLinkDeviceKind(device.platform)

  if (kind === 'phone') {
    return <Smartphone size={24} strokeWidth={1.8} aria-hidden="true" />
  }

  if (kind === 'tablet') {
    return <Tablet size={24} strokeWidth={1.8} aria-hidden="true" />
  }

  return <Laptop size={26} strokeWidth={1.7} aria-hidden="true" />
}
