import { ClientRoot } from '../client-root'

export function generateStaticParams() {
  return [
    { slug: [] },
    { slug: ['connect'] },
    { slug: ['send'] },
    { slug: ['receive'] },
    { slug: ['text'] },
    { slug: ['chat'] },
    { slug: ['image'] },
    { slug: ['sessions'] },
  ]
}

export default function Page() {
  return <ClientRoot />
}
