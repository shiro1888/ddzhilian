import {
  ChevronRight,
  Cpu,
  Palette,
  ScanText,
  Sparkles,
  Terminal,
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
    <section className="dd-snaplink__workbench-page is-workshop" aria-label="实用工具">
      <header className="dd-snaplink__workshop-hero">
        <div className="dd-snaplink__workshop-hero-title">
          <span className="dd-snaplink__workshop-hero-icon">
            <Sparkles size={20} strokeWidth={2.2} />
          </span>
          <h1>实用工具</h1>
        </div>
      </header>

      <div className="dd-snaplink__workshop-grid">
        {/* 1. 命令行 */}
        <button
          type="button"
          className="dd-snaplink__workshop-card is-sandbox"
          onClick={onOpenCommand}
          aria-label="打开命令行"
        >
          <span className="dd-snaplink__workshop-card-icon is-sandbox">
            <Terminal size={24} strokeWidth={2} />
          </span>
          <div className="dd-snaplink__workshop-card-meta">
            <strong>命令行</strong>
            <p>代码沙箱与终端运行</p>
          </div>
          <span className="dd-snaplink__workshop-arrow" aria-hidden="true">
            <ChevronRight size={18} strokeWidth={2.2} />
          </span>
        </button>

        {/* 2. DD助手 */}
        <button
          type="button"
          className="dd-snaplink__workshop-card is-ai"
          onClick={onOpenAiChat}
          aria-label="打开 DD助手"
        >
          <span className="dd-snaplink__workshop-card-icon is-ai">
            <Cpu size={24} strokeWidth={2} />
          </span>
          <div className="dd-snaplink__workshop-card-meta">
            <strong>DD助手</strong>
            <p>多模型对话与深度推理</p>
          </div>
          <span className="dd-snaplink__workshop-arrow" aria-hidden="true">
            <ChevronRight size={18} strokeWidth={2.2} />
          </span>
        </button>

        {/* 3. AI 生图 */}
        <button
          type="button"
          className="dd-snaplink__workshop-card is-image"
          onClick={onOpenImage}
          aria-label="打开 AI生图"
        >
          <span className="dd-snaplink__workshop-card-icon is-image">
            <Palette size={24} strokeWidth={2} />
          </span>
          <div className="dd-snaplink__workshop-card-meta">
            <strong>AI 生图</strong>
            <p>AI 图像生成与创作画廊</p>
          </div>
          <span className="dd-snaplink__workshop-arrow" aria-hidden="true">
            <ChevronRight size={18} strokeWidth={2.2} />
          </span>
        </button>

        {/* 4. 图片文字识别 (OCR) */}
        <button
          type="button"
          className={`dd-snaplink__workshop-card is-ocr${isOcrPanelOpen ? ' is-active' : ''}`}
          onClick={onOpenOcr}
          aria-label="打开图片文字识别"
        >
          <span className="dd-snaplink__workshop-card-icon is-ocr">
            <ScanText size={24} strokeWidth={2} />
          </span>
          <div className="dd-snaplink__workshop-card-meta">
            <strong>文字识别 (OCR)</strong>
            <p>本地提取图片文本与表格</p>
          </div>
          <span className="dd-snaplink__workshop-arrow" aria-hidden="true">
            <ChevronRight size={18} strokeWidth={2.2} />
          </span>
        </button>
      </div>
    </section>
  )
}
