import type { CSSProperties, ReactNode } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CookiePreferenceButton } from '../cookie-preference-button'
import { ClientRoot } from '../client-root'

type RouteKey = '' | 'about' | 'privacy' | 'terms' | 'advertising' | 'contact'
type PageParams = { slug?: string[] }
type PageProps = {
  params: PageParams | Promise<PageParams>
}

const siteOrigin = 'https://dd.shiro1888.com'
const toAbsoluteUrl = (path: string) => new URL(path, siteOrigin).toString()

const appRouteParams = [
  { slug: ['connect'] },
  { slug: ['send'] },
  { slug: ['receive'] },
  { slug: ['text'] },
  { slug: ['chat'] },
  { slug: ['image'] },
  { slug: ['web-command'] },
  { slug: ['sessions'] },
]

const marketingRoutes: Record<RouteKey, {
  title: string
  description: string
  canonical: string
}> = {
  '': {
    title: 'DD直连 - 局域网文件与文本互传工具',
    description:
      'DD直连支持浏览器之间的局域网文件传输、文本同步、房间对话、图片工具和 AI 助手，适合个人、团队和临时协作场景。',
    canonical: '/',
  },
  about: {
    title: '关于 DD直连',
    description: '了解 DD直连的产品定位、核心能力和适用场景。',
    canonical: '/about',
  },
  privacy: {
    title: '隐私政策',
    description: '了解 DD直连如何处理设备信息、传输内容、AI 助手内容、Cookie 与广告相关数据。',
    canonical: '/privacy',
  },
  terms: {
    title: '服务条款',
    description: '阅读 DD直连的使用规则、免责声明和用户责任。',
    canonical: '/terms',
  },
  advertising: {
    title: '广告与 Cookie 说明',
    description: '了解 DD直连如何使用广告脚本、Cookie、本地存储以及用户可管理的广告偏好。',
    canonical: '/advertising',
  },
  contact: {
    title: '联系我们',
    description: '联系 DD直连团队，反馈产品问题、广告合作或隐私相关请求。',
    canonical: '/contact',
  },
}

const appRoutes: Record<string, {
  title: string
  description: string
  canonical: string
}> = {
  connect: {
    title: '连接设备',
    description: '使用 DD直连在同一网络中连接手机、电脑和平板，快速建立文件互传和文本同步通道。',
    canonical: '/text',
  },
  send: {
    title: '发送文件',
    description: '通过 DD直连在浏览器中发送文件、图片和文本，适合局域网设备之间快速互传。',
    canonical: '/text',
  },
  receive: {
    title: '接收文件',
    description: '使用 DD直连接收来自附近设备或房间成员分享的文件、文本和图片。',
    canonical: '/text',
  },
  text: {
    title: '文件与文本互传',
    description: '打开 DD直连的核心工具页，创建房间、同步文本、发送文件并管理传输记录。',
    canonical: '/text',
  },
  chat: {
    title: 'AI 助手对话',
    description: '使用 DD直连 AI 助手总结内容、回答问题、整理文本，并与文件传输工作流结合。',
    canonical: '/chat',
  },
  image: {
    title: '图片工具',
    description: '使用 DD直连图片工具处理图片生成、历史记录和账号相关能力。',
    canonical: '/image',
  },
  'web-command': {
    title: '命令分享',
    description: '使用 DD直连命令行工具分享命令结果，把终端输出快速带入协作对话。',
    canonical: '/web-command',
  },
  sessions: {
    title: '传输会话',
    description: '查看 DD直连的设备连接和传输会话，管理浏览器端协作状态。',
    canonical: '/text',
  },
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at top left, rgba(7, 193, 96, 0.14), transparent 34%), linear-gradient(180deg, #f7fbf8 0%, #ffffff 44%, #f3f4f6 100%)',
  color: '#111827',
  fontFamily:
    '"LXGW WenKai", "Noto Serif SC", "Microsoft YaHei", "PingFang SC", sans-serif',
}

const shellStyle: CSSProperties = {
  width: 'min(1120px, calc(100% - 32px))',
  margin: '0 auto',
  padding: '28px 0 56px',
}

const navStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 38,
}

const brandStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  color: '#07111f',
  fontSize: 18,
  fontWeight: 900,
  textDecoration: 'none',
}

const navLinksStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: 12,
  color: '#4b5563',
  fontSize: 14,
  fontWeight: 700,
}

const navLinkStyle: CSSProperties = {
  color: 'inherit',
  textDecoration: 'none',
}

const cardStyle: CSSProperties = {
  border: '1px solid rgba(17, 24, 39, 0.08)',
  borderRadius: 28,
  background: 'rgba(255, 255, 255, 0.86)',
  boxShadow: '0 24px 70px rgba(15, 23, 42, 0.10)',
}

const heroStyle: CSSProperties = {
  ...cardStyle,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
  gap: 28,
  padding: '42px clamp(22px, 4vw, 54px)',
}

const eyebrowStyle: CSSProperties = {
  display: 'inline-flex',
  width: 'fit-content',
  alignItems: 'center',
  gap: 8,
  marginBottom: 18,
  padding: '7px 12px',
  border: '1px solid rgba(7, 193, 96, 0.22)',
  borderRadius: 999,
  background: '#eefcf4',
  color: '#047a3b',
  fontSize: 13,
  fontWeight: 900,
}

const ctaRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  marginTop: 28,
}

const primaryButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 46,
  padding: '0 18px',
  borderRadius: 999,
  background: '#07c160',
  color: '#ffffff',
  fontSize: 15,
  fontWeight: 900,
  textDecoration: 'none',
  boxShadow: '0 16px 30px rgba(7, 193, 96, 0.24)',
}

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: '#ffffff',
  color: '#111827',
  border: '1px solid rgba(17, 24, 39, 0.12)',
  boxShadow: 'none',
}

const sectionGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))',
  gap: 16,
  marginTop: 18,
}

const infoCardStyle: CSSProperties = {
  ...cardStyle,
  padding: 22,
}

const legalArticleStyle: CSSProperties = {
  ...cardStyle,
  maxWidth: 880,
  margin: '0 auto',
  padding: '34px clamp(20px, 4vw, 48px)',
  lineHeight: 1.85,
}

function routeKeyFromSlug(slug: string[] = []): RouteKey | null {
  const key = (slug ?? []).join('/')

  return key in marketingRoutes ? (key as RouteKey) : null
}

async function resolveRouteKey(params: PageProps['params']) {
  const resolved = await params

  return routeKeyFromSlug(resolved.slug ?? [])
}

export function generateStaticParams() {
  return [
    { slug: [] },
    { slug: ['about'] },
    { slug: ['privacy'] },
    { slug: ['terms'] },
    { slug: ['advertising'] },
    { slug: ['contact'] },
    ...appRouteParams,
  ]
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const routeKey = await resolveRouteKey(params)

  if (routeKey === null) {
    const resolved = await params
    const appRoute = appRoutes[(resolved.slug ?? []).join('/')]

    if (!appRoute) {
      return {
        title: '页面不存在',
        robots: {
          index: false,
          follow: false,
        },
      }
    }

    return {
      title: appRoute.title,
      description: appRoute.description,
      alternates: {
        canonical: toAbsoluteUrl(appRoute.canonical),
      },
      openGraph: {
        title: appRoute.title,
        description: appRoute.description,
        url: toAbsoluteUrl(appRoute.canonical),
        type: 'website',
      },
      twitter: {
        card: 'summary',
        title: appRoute.title,
        description: appRoute.description,
      },
    }
  }

  const route = marketingRoutes[routeKey]

  return {
    title: route.title,
    description: route.description,
    alternates: {
      canonical: toAbsoluteUrl(route.canonical),
    },
    openGraph: {
      title: route.title,
      description: route.description,
      url: toAbsoluteUrl(route.canonical),
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: route.title,
      description: route.description,
    },
  }
}

function Header() {
  return (
    <nav style={navStyle} aria-label="主导航">
      <Link href="/" style={brandStyle}>
        <img src="/logo-dd-link.png" width={34} height={34} alt="" />
        <span>DD直连</span>
      </Link>
      <div style={navLinksStyle}>
        <Link href="/text" style={navLinkStyle}>开始使用</Link>
        <Link href="/about" style={navLinkStyle}>关于</Link>
        <Link href="/privacy" style={navLinkStyle}>隐私</Link>
        <Link href="/terms" style={navLinkStyle}>条款</Link>
        <Link href="/advertising" style={navLinkStyle}>广告说明</Link>
        <Link href="/contact" style={navLinkStyle}>联系</Link>
      </div>
    </nav>
  )
}

function Footer() {
  return (
    <footer
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        marginTop: 34,
        padding: '18px 4px 0',
        borderTop: '1px solid rgba(17, 24, 39, 0.08)',
        color: '#6b7280',
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      <span>© 2026 DD直连</span>
      <nav
        aria-label="页脚导航"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Link href="/text" style={navLinkStyle}>开始使用</Link>
        <Link href="/privacy" style={navLinkStyle}>隐私政策</Link>
        <Link href="/terms" style={navLinkStyle}>服务条款</Link>
        <Link href="/advertising" style={navLinkStyle}>广告说明</Link>
        <Link href="/contact" style={navLinkStyle}>联系我们</Link>
      </nav>
    </footer>
  )
}

function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <Header />
        {children}
        <Footer />
      </div>
    </main>
  )
}

function HomePage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'DD直连需要安装客户端吗？',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '不需要。DD直连可以直接在浏览器中使用，适合临时文件互传、文本同步和房间对话。',
        },
      },
      {
        '@type': 'Question',
        name: 'DD直连适合 Google Ads 落地页吗？',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'DD直连提供清晰的产品说明、隐私政策、服务条款和联系入口，便于广告审核了解网站用途和用户体验。',
        },
      },
    ],
  }

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <section style={heroStyle}>
        <div>
          <span style={eyebrowStyle}>浏览器即开即用 · 局域网优先 · 支持 AI 助手</span>
          <h1 style={{ margin: 0, fontSize: 'clamp(36px, 7vw, 72px)', lineHeight: 1.02, letterSpacing: '-0.05em' }}>
            文件、文本和想法，在同一网络里直接流动。
          </h1>
          <p style={{ maxWidth: 620, margin: '20px 0 0', color: '#4b5563', fontSize: 18, lineHeight: 1.8 }}>
            DD直连面向个人、团队和临时协作场景，提供局域网文件互传、文本同步、世界对话、
            图片工具、AI 助手和命令分享。打开浏览器即可使用，不需要复杂配置。
          </p>
          <div style={ctaRowStyle}>
            <Link href="/text" style={primaryButtonStyle}>立即开始传输</Link>
            <Link href="/chat" style={secondaryButtonStyle}>打开 AI 对话</Link>
          </div>
        </div>
        <aside style={{ ...infoCardStyle, display: 'grid', alignContent: 'center', gap: 18 }}>
          <strong style={{ color: '#07a152', fontSize: 14 }}>核心能力</strong>
          <ul style={{ display: 'grid', gap: 12, margin: 0, paddingLeft: 20, color: '#374151', lineHeight: 1.7 }}>
            <li>局域网设备发现、房间对话和短码加入。</li>
            <li>文件、图片、文本、链接和历史记录统一管理。</li>
            <li>AI 助手可用于总结内容、回答问题和辅助整理。</li>
            <li>移动端和桌面端都能直接从浏览器访问。</li>
          </ul>
        </aside>
      </section>

      <section style={{ marginTop: 26 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 28 }}>为什么适合日常协作</h2>
        <div style={sectionGridStyle}>
          {[
            ['不用注册也能快速开始', '适合临时传文件、会议中同步文本、手机电脑之间互传资料。'],
            ['对话和传输在一个界面', '消息、文件、AI 回复和共享记录集中展示，减少来回切换。'],
            ['广告落地页信息透明', '提供关于、隐私、条款、联系入口，便于用户和广告审核理解产品。'],
          ].map(([title, text]) => (
            <article key={title} style={infoCardStyle}>
              <h3 style={{ margin: '0 0 10px', fontSize: 18 }}>{title}</h3>
              <p style={{ margin: 0, color: '#4b5563', lineHeight: 1.75 }}>{text}</p>
            </article>
          ))}
        </div>
      </section>
    </MarketingShell>
  )
}

function BreadcrumbJsonLd({ routeKey }: { routeKey: RouteKey }) {
  const route = marketingRoutes[routeKey]
  const itemListElement = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'DD直连',
      item: siteOrigin,
    },
  ]

  if (routeKey !== '') {
    itemListElement.push({
      '@type': 'ListItem',
      position: 2,
      name: route.title,
      item: `${siteOrigin}${route.canonical}`,
    })
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement,
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, '\\u003c'),
      }}
    />
  )
}

function AboutPage() {
  return (
    <MarketingShell>
      <article style={legalArticleStyle}>
        <h1>关于 DD直连</h1>
        <p>
          DD直连是一款浏览器端协作工具，核心目标是让同一网络中的设备更容易传输文件、
          同步文本、创建临时对话，并在需要时借助 AI 助手整理内容。
        </p>
        <p>
          产品适合个人设备互传、团队会议临时协作、手机与电脑之间交换资料、以及需要快速分享文本、
          图片和文件的轻量办公场景。
        </p>
        <p>
          DD直连重视用户体验和可访问性，网站提供明确的功能说明、隐私政策、服务条款和联系入口，
          方便用户在使用前了解产品边界。
        </p>
        <Link href="/text" style={primaryButtonStyle}>打开 DD直连工具</Link>
      </article>
    </MarketingShell>
  )
}

function PrivacyPage() {
  return (
    <MarketingShell>
      <article style={legalArticleStyle}>
        <h1>隐私政策</h1>
        <p>更新日期：2026 年 7 月 8 日</p>
        <h2>我们处理的信息</h2>
        <p>
          为了提供文件互传、文本同步和房间对话功能，DD直连可能会处理设备名称、设备标识、
          房间短码、连接状态、传输记录、用户主动输入的文本和用户主动选择的文件。
        </p>
        <h2>本地传输与服务端能力</h2>
        <p>
          DD直连优先用于浏览器之间的连接和局域网协作。部分功能可能需要服务端协助完成房间同步、
          历史记录、AI 助手、图片工具或健康检查。用户不应上传或发送无权处理的敏感内容。
        </p>
        <h2>AI 助手与第三方服务</h2>
        <p>
          当你主动使用 AI 助手、图片生成、OCR 或类似能力时，相关提示词、图片或文件内容可能会发送到
          服务端或模型供应商用于生成结果。请不要提交法律、财务、医疗、账户密码等高敏感信息。
        </p>
        <h2>Cookie、广告和统计</h2>
        <p>
          本站可能使用 Cookie、本地存储、服务工作线程和 Google 广告相关脚本来维持基础体验、
          展示广告、减少重复请求或改进服务。Google 及其合作方可能根据其政策使用 Cookie 或类似技术。
        </p>
        <p>
          你可以通过浏览器设置管理 Cookie，也可以访问 Google 的广告设置页面了解个性化广告选择。
          若所在地区要求额外同意管理，我们会根据实际投放范围补充对应的同意提示。
        </p>
        <p>
          你也可以阅读 <Link href="/advertising">广告与 Cookie 说明</Link>，了解本站广告脚本和用户选择权的更多细节。
        </p>
        <h2>你的选择</h2>
        <p>
          你可以清理浏览器缓存、本地存储、Cookie 或不使用需要上传内容的功能。若你希望反馈隐私问题，
          请通过联系页面提交说明。
        </p>
      </article>
    </MarketingShell>
  )
}

function TermsPage() {
  return (
    <MarketingShell>
      <article style={legalArticleStyle}>
        <h1>服务条款</h1>
        <p>更新日期：2026 年 7 月 8 日</p>
        <h2>使用规则</h2>
        <p>
          使用 DD直连时，你应确保自己拥有上传、传输、分享或处理相关内容的合法权利，
          不得利用本服务传播违法、有害、侵权、恶意软件、欺诈或垃圾信息。
        </p>
        <h2>服务可用性</h2>
        <p>
          DD直连会尽力保持稳定可用，但浏览器权限、网络环境、设备限制、第三方模型服务、
          云服务或系统维护都可能影响功能表现。
        </p>
        <h2>免责声明</h2>
        <p>
          本服务按现状提供。用户应自行备份重要文件，并对自己发送、接收、保存和处理的内容负责。
          AI 生成结果可能存在错误，仅供参考，不构成专业建议。
        </p>
        <h2>条款更新</h2>
        <p>
          我们可能根据产品变化更新本条款。继续使用网站即表示你理解并接受更新后的规则。
        </p>
      </article>
    </MarketingShell>
  )
}

function AdvertisingPage() {
  return (
    <MarketingShell>
      <article style={legalArticleStyle}>
        <h1>广告与 Cookie 说明</h1>
        <p>更新日期：2026 年 7 月 8 日</p>
        <p>
          DD直连可能使用 Google AdSense 或类似广告服务来支持网站持续维护。广告脚本可能使用 Cookie、
          本地存储、设备信息、浏览器信息、页面访问数据或类似技术来展示、衡量和改进广告体验。
        </p>
        <h2>广告展示</h2>
        <p>
          广告内容由广告平台根据其政策和可用信号提供。DD直连不会要求你点击广告，也不会把广告点击作为使用功能的条件。
        </p>
        <h2>用户选择</h2>
        <p>
          你可以通过浏览器设置清理或限制 Cookie，也可以访问 Google 广告设置页面管理个性化广告偏好。
          如果你所在地区要求额外同意，我们会根据实际投放范围加入适当的同意管理提示。
        </p>
        <CookiePreferenceButton />
        <h2>基础功能与广告的关系</h2>
        <p>
          文件互传、文本同步、房间对话和 AI 助手功能不以点击广告为前提。广告脚本异常时，核心工具仍应尽量保持可访问。
        </p>
        <h2>相关页面</h2>
        <p>
          更多数据处理说明请阅读 <Link href="/privacy">隐私政策</Link>；网站使用规则请阅读 <Link href="/terms">服务条款</Link>。
        </p>
      </article>
    </MarketingShell>
  )
}

function ContactPage() {
  return (
    <MarketingShell>
      <article style={legalArticleStyle}>
        <h1>联系我们</h1>
        <p>
          如果你遇到传输异常、移动端兼容、隐私请求、广告合作或产品建议，可以通过以下方式联系维护者。
        </p>
        <div style={{ ...infoCardStyle, margin: '20px 0' }}>
          <p style={{ margin: '0 0 8px' }}>
            联系邮箱：<a href="mailto:support@dd.shiro1888.com">support@dd.shiro1888.com</a>
          </p>
          <p style={{ margin: 0, color: '#6b7280' }}>
            我们会优先处理产品故障、隐私请求、广告合作和安全相关反馈。
          </p>
        </div>
        <p>
          反馈问题时建议附上访问路径、浏览器版本、设备类型、截图和复现步骤，这样更容易定位问题。
        </p>
        <Link href="/text" style={primaryButtonStyle}>返回工具</Link>
      </article>
    </MarketingShell>
  )
}

function MarketingPage({ routeKey }: { routeKey: RouteKey }) {
  if (routeKey === '') {
    return (
      <>
        <BreadcrumbJsonLd routeKey={routeKey} />
        <HomePage />
      </>
    )
  }

  if (routeKey === 'about') {
    return (
      <>
        <BreadcrumbJsonLd routeKey={routeKey} />
        <AboutPage />
      </>
    )
  }

  if (routeKey === 'privacy') {
    return (
      <>
        <BreadcrumbJsonLd routeKey={routeKey} />
        <PrivacyPage />
      </>
    )
  }

  if (routeKey === 'terms') {
    return (
      <>
        <BreadcrumbJsonLd routeKey={routeKey} />
        <TermsPage />
      </>
    )
  }

  if (routeKey === 'advertising') {
    return (
      <>
        <BreadcrumbJsonLd routeKey={routeKey} />
        <AdvertisingPage />
      </>
    )
  }

  return (
    <>
      <BreadcrumbJsonLd routeKey={routeKey} />
      <ContactPage />
    </>
  )
}

export default async function Page({ params }: PageProps) {
  const routeKey = await resolveRouteKey(params)

  // The product is the landing page: `/` opens the workbench directly rather
  // than an interstitial marketing page. Its SEO metadata still comes from
  // marketingRoutes[''] via generateMetadata; only the body changes.
  if (routeKey === '') {
    return <ClientRoot />
  }

  if (routeKey !== null) {
    return <MarketingPage routeKey={routeKey} />
  }

  const resolved = await params
  const appRoute = appRoutes[(resolved.slug ?? []).join('/')]

  if (!appRoute) {
    notFound()
  }

  return <ClientRoot />
}
