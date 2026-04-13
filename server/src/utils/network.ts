import os from 'node:os';

export interface NetworkContext {
  remoteAddress: string;
  lanKey?: string;
  lanMode: 'private-subnet' | 'public-ip' | 'unknown';
}

function normalizeIp(address: string | undefined) {
  if (!address) {
    return 'unknown';
  }

  if (address.startsWith('::ffff:')) {
    return address.slice(7);
  }

  if (address === '::1') {
    return '127.0.0.1';
  }

  return address;
}

function isPrivateIpv4(ip: string) {
  return (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip === '127.0.0.1'
  );
}

function derivePrivateLanKey(ip: string) {
  const octets = ip.split('.');

  if (octets.length !== 4) {
    return undefined;
  }

  return `${octets[0]}.${octets[1]}.${octets[2]}`;
}

export function buildNetworkContext(address: string | undefined): NetworkContext {
  const remoteAddress = normalizeIp(address);

  if (/^\d+\.\d+\.\d+\.\d+$/.test(remoteAddress)) {
    if (isPrivateIpv4(remoteAddress)) {
      return {
        remoteAddress,
        lanKey: derivePrivateLanKey(remoteAddress),
        lanMode: 'private-subnet',
      };
    }

    return {
      remoteAddress,
      lanKey: `public:${remoteAddress}`,
      lanMode: 'public-ip',
    };
  }

  return {
    remoteAddress,
    lanMode: 'unknown',
  };
}

export function getLocalIpv4Addresses() {
  const interfaces = os.networkInterfaces();
  const addresses = new Set<string>();

  for (const group of Object.values(interfaces)) {
    for (const item of group ?? []) {
      if (item.family === 'IPv4' && !item.internal) {
        addresses.add(item.address);
      }
    }
  }

  return [...addresses];
}
