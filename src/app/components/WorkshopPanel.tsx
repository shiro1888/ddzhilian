import {
  ChevronRight,
  Code2,
  Cpu,
  Image as ImageIcon,
  ScanText,
  Sparkles,
  Zap,
} from 'lucide-react'

type WorkshopPanelProps = {
  onOpenAiChat: () => void
  onOpenImage: () => void
  onOpenCommand: () => void
  onOpenOcr: () => void
  isOcrPanelOpen?: boolean
}

export function WorkshopPanel({
  onOpenAiChat,
  onOpenImage,
  onOpenCommand,
  onOpenOcr,
  isOcrPanelOpen = false,
}: WorkshopPanelProps) {
  return (
    <section className="dd-snaplink__workbench-page is-workshop" aria-label="工具工坊">
      <header className="dd-snaplink__workshop-hero">
        <div className="dd-snaplink__workshop-hero-title">
          <span className="dd-snaplink__workshop-hero-icon">
            <Sparkles size={22} strokeWidth={2.2} />
          </span>
          <div>
            <h1>工具与扩展工坊</h1>
            <p>集成代码沙箱、AI 智能助手、多模态绘图与本地 OCR 文字提取</p>
          </div>
        </div>
        <span className="dd-snaplink__workshop-badge">
          <Zap size={13} strokeWidth={2.2} />
          4 款生产力扩展
        </span>
      </header>

      <div className="dd-snaplink__workshop-grid">
        {/* 1. 命令行沙箱 */}
        <button
          type="button"
          className="dd-snaplink__workshop-card is-sandbox"
          onClick={onOpenCommand}
          aria-label="打开命令行沙箱"
        >
          <div className="dd-snaplink__workshop-card-top">
            <span className="dd-snaplink__workshop-card-icon is-sandbox">
              <Code2 size={24} strokeWidth={2} />
            </span>
            <div className="dd-snaplink__workshop-card-meta">
              <div className="dd-snaplink__workshop-card-header">
                <strong>命令行沙箱</strong>
                <span className="dd-snaplink__workshop-tag is-green">沙箱隔离</span>
              </div>
              <p>Python / Java / PlantUML 终端代码运行与架构图渲染</p>
            </div>
            <span className="dd-snaplink__workshop-arrow" aria-hidden="true">
              <ChevronRight size={18} strokeWidth={2.2} />
            </span>
          </div>
          <div className="dd-snaplink__workshop-chips">
            <span>Python 3</span>
            <span>Java 21</span>
            <span>PlantUML</span>
            <span>Web 终端</span>
          </div>
        </button>

        {/* 2. AI 智能助手 */}
        <button
          type="button"
          className="dd-snaplink__workshop-card is-ai"
          onClick={onOpenAiChat}
          aria-label="打开 AI 智能助手"
        >
          <div className="dd-snaplink__workshop-card-top">
            <span className="dd-snaplink__workshop-card-icon is-ai">
              <Cpu size={24} strokeWidth={2} />
            </span>
            <div className="dd-snaplink__workshop-card-meta">
              <div className="dd-snaplink__workshop-card-header">
                <strong>AI 智能助手</strong>
                <span className="dd-snaplink__workshop-tag is-purple">多模型驱动</span>
              </div>
              <p>多模型会话、深度思考推理、上下文感知与智能问答</p>
            </div>
            <span className="dd-snaplink__workshop-arrow" aria-hidden="true">
              <ChevronRight size={18} strokeWidth={2.2} />
            </span>
          </div>
          <div className="dd-snaplink__workshop-chips">
            <span>DeepSeek R1</span>
            <span>Claude 3.5</span>
            <span>GPT-4o</span>
            <span>联网搜索</span>
          </div>
        </button>

        {/* 3. 图片工坊 */}
        <button
          type="button"
          className="dd-snaplink__workshop-card is-image"
          onClick={onOpenImage}
          aria-label="打开图片工坊"
        >
          <div className="dd-snaplink__workshop-card-top">
            <span className="dd-snaplink__workshop-card-icon is-image">
              <ImageIcon size={24} strokeWidth={2} />
            </span>
            <div className="dd-snaplink__workshop-card-meta">
              <div className="dd-snaplink__workshop-card-header">
                <strong>图片工坊</strong>
                <span className="dd-snaplink__workshop-tag is-pink">AI 绘图</span>
              </div>
              <p>文生图、图生图、提示词润色与作品参考图画廊</p>
            </div>
            <span className="dd-snaplink__workshop-arrow" aria-hidden="true">
              <ChevronRight size={18} strokeWidth={2.2} />
            </span>
          </div>
          <div className="dd-snaplink__workshop-chips">
            <span>Flux Schnell</span>
            <span>SDXL</span>
            <span>画廊存档</span>
            <span>直连分享</span>
          </div>
        </button>

        {/* 4. 图片文字识别 (OCR) */}
        <button
          type="button"
          className={`dd-snaplink__workshop-card is-ocr${isOcrPanelOpen ? ' is-active' : ''}`}
          onClick={onOpenOcr}
          aria-label="打开图片文字识别"
        >
          <div className="dd-snaplink__workshop-card-top">
            <span className="dd-snaplink__workshop-card-icon is-ocr">
              <ScanText size={24} strokeWidth={2} />
            </span>
            <div className="dd-snaplink__workshop-card-meta">
              <div className="dd-snaplink__workshop-card-header">
                <strong>图片文字识别 (OCR)</strong>
                <span className="dd-snaplink__workshop-tag is-amber">本地高精</span>
              </div>
              <p>拖拽、截图或从相册选择图片，毫秒级提取中英文与表格数据</p>
            </div>
            <span className="dd-snaplink__workshop-arrow" aria-hidden="true">
              <ChevronRight size={18} strokeWidth={2.2} />
            </span>
          </div>
          <div className="dd-snaplink__workshop-chips">
            <span>高精提取</span>
            <span>表格识别</span>
            <span>一键复制</span>
            <span>即时发送</span>
          </div>
        </button>
      </div>

      <footer className="dd-snaplink__workshop-footer">
        <div className="dd-snaplink__workshop-tip">
          <span className="dd-snaplink__workshop-tip-dot" />
          <span>所有扩展工具产生的数据与文件均可直接发送至当前聊天会话或附近设备。</span>
        </div>
      </footer>
    </section>
  )
}
