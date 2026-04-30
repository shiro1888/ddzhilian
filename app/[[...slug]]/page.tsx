import { ClientRoot } from '../client-root'

export function generateStaticParams() {
  return [
    { slug: [] },
    { slug: ['connect'] },
    { slug: ['send'] },
    { slug: ['receive'] },
    { slug: ['text'] },
    { slug: ['image'] },
    { slug: ['sessions'] },
    { slug: ['admin'] },
  ]
}

export default function Page() {
  return <ClientRoot />
}
