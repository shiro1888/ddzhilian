import { describe, expect, it } from 'vitest'
import {
  linkifyPlainTextUrls,
  sanitizeBotReplyHtml,
  sanitizeRichTextHtml,
} from '@/app/utils'

// These two functions render peer-supplied and model-supplied markup straight
// into chat bubbles, so a regression here is user-facing XSS.

describe('sanitizeRichTextHtml', () => {
  it('never emits an executable script tag', () => {
    const output = sanitizeRichTextHtml('<p>hi</p><script>alert(1)</script>')

    // The payload may survive as inert text inside a code block; what matters
    // is that no <script> element reaches the DOM.
    expect(output).not.toMatch(/<script\b/i)
    expect(output).toContain('hi')
  })

  it('drops embedding and object tags', () => {
    for (const payload of [
      '<iframe src="https://evil.example.com"></iframe>',
      '<object data="evil.swf"></object>',
      '<embed src="evil.swf">',
    ]) {
      const output = sanitizeRichTextHtml(`<p>text</p>${payload}`)

      expect(output).not.toMatch(/<(iframe|object|embed)\b/i)
      expect(output).not.toContain('evil')
    }
  })

  it('strips inline event handlers', () => {
    const output = sanitizeRichTextHtml('<p onclick="steal()">click me</p>')

    expect(output).not.toContain('onclick')
    expect(output).not.toContain('steal()')
    expect(output).toContain('click me')
  })

  it('rejects javascript: and vbscript: hrefs', () => {
    for (const scheme of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'vbscript:msgbox']) {
      const output = sanitizeRichTextHtml(`<a href="${scheme}">link</a>`)

      expect(output.toLowerCase()).not.toContain('javascript:')
      expect(output.toLowerCase()).not.toContain('vbscript:')
    }
  })

  it('keeps safe links and formatting', () => {
    const output = sanitizeRichTextHtml(
      '<p><strong>bold</strong> <em>italic</em> <a href="https://example.com">link</a></p>',
    )

    expect(output).toContain('bold')
    expect(output).toContain('italic')
    expect(output).toContain('https://example.com')
  })

  it('escapes markup when the input has no tags at all', () => {
    expect(sanitizeRichTextHtml('plain text')).toContain('plain text')
    expect(sanitizeRichTextHtml('')).toBe('')
  })

  it('does not emit an unescaped closing script tag from text content', () => {
    const output = sanitizeRichTextHtml('</script><img src=x onerror=alert(1)>')

    expect(output).not.toContain('onerror')
  })
})

describe('sanitizeBotReplyHtml', () => {
  it('drops script tags and event handlers from model output', () => {
    const output = sanitizeBotReplyHtml('<p onmouseover="x()">reply</p><script>bad()</script>')

    expect(output).not.toMatch(/<script\b/i)
    expect(output).not.toContain('onmouseover')
    expect(output).toContain('reply')
  })

  it('rejects javascript: hrefs in model output', () => {
    const output = sanitizeBotReplyHtml('<a href="javascript:alert(1)">click</a>')

    expect(output.toLowerCase()).not.toContain('javascript:')
  })

  it('renders fenced code as a code block rather than live markup', () => {
    const output = sanitizeBotReplyHtml('```html\n<script>alert(1)</script>\n```')

    expect(output).not.toMatch(/<script\b/i)
    expect(output).toContain('&lt;script')
    expect(output).toContain('dd-code-block')
  })
})

describe('linkifyPlainTextUrls', () => {
  it('links plain http and https urls', () => {
    const output = linkifyPlainTextUrls('see https://example.com for details')

    expect(output).toMatch(/href="https:\/\/example\.com\/?"/)
    expect(output).toContain('rel="noreferrer noopener"')
  })

  it('does not linkify a javascript: scheme', () => {
    const output = linkifyPlainTextUrls('javascript:alert(1)')

    expect(output).not.toContain('href="javascript:')
  })

  it('escapes surrounding text', () => {
    const output = linkifyPlainTextUrls('<b>not bold</b>')

    expect(output).not.toContain('<b>')
    expect(output).toContain('&lt;b&gt;')
  })
})
