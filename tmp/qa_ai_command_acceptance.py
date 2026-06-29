from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

BASE_URL = 'http://localhost:3000'


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def text_contains(page, text):
    return page.locator(f'text={text}').count() > 0


def click_ai_transfer_action(page):
    action_scope = page.locator('.dd-snaplink__tool-side-actions, .dd-snaplink__tool-mobile-actions')
    target = action_scope.get_by_role('button', name='分析最近传输')
    if target.count() == 0:
        target = action_scope.get_by_role('button', name='辅助生成传输说明')
    if target.count() == 0:
        target = action_scope.locator('button').filter(has_text='生成传输说明')
    assert_true(target.count() > 0, 'AI 工具页缺少“辅助生成传输说明/分析最近传输”快捷操作')
    target.first.click(timeout=5000)
    page.wait_for_timeout(400)


def run_command_and_wait(page):
    run_button = page.locator('.dd-web-command__head-actions').get_by_role('button', name='运行')
    assert_true(run_button.count() == 1, '命令行缺少头部“运行”按钮')
    run_button.click(timeout=5000)
    try:
        page.locator('text=answer = 42').first.wait_for(timeout=12000)
    except PlaywrightTimeoutError:
        page.locator('text=hello from python').first.wait_for(timeout=12000)
    page.wait_for_timeout(500)


def ensure_no_horizontal_overflow(page, label):
    metrics = page.evaluate("""() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        innerWidth: window.innerWidth,
    })""")
    assert_true(
        metrics['scrollWidth'] <= metrics['innerWidth'] + 2 and metrics['bodyScrollWidth'] <= metrics['innerWidth'] + 2,
        f'{label} 存在横向溢出: {metrics}',
    )


def qa_chat_desktop(browser):
    page = browser.new_page(viewport={'width': 1366, 'height': 900})
    page.goto(BASE_URL + '/chat', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-snaplink__tool-workbench.is-ai-chat', timeout=30000)
    page.wait_for_timeout(1200)

    assert_true(page.locator('.dd-snaplink__tool-workbench.is-ai-chat').count() == 1, '/chat 未进入 DD AI 工具工作台')
    assert_true(page.locator('.dd-snaplink__rail').count() >= 1, '/chat 桌面端缺少左侧导航')
    assert_true(page.locator('.dd-snaplink__tool-content .dd-ai-chat').count() == 1, '/chat 工具内容未渲染 AI 面板')
    assert_true(page.locator('.dd-snaplink__tool-status').count() == 1, '/chat 缺少顶部工具状态条')
    assert_true(page.locator('.dd-snaplink__tool-side').count() == 1, '/chat 缺少右侧工具上下文/传输面板')
    assert_true(text_contains(page, 'AI 辅助'), '/chat 缺少 AI 辅助标题')
    assert_true(text_contains(page, '本地优先'), '/chat 缺少本地优先文案')
    assert_true(text_contains(page, '上下文不外传'), '/chat 缺少“上下文不外传”心智')
    assert_true(text_contains(page, 'DD助手'), '/chat 缺少 DD助手品牌文案')
    assert_true(text_contains(page, '内容不经过服务器保存'), '/chat 缺少“内容不经过服务器保存”文案')
    assert_true(text_contains(page, '当前上下文'), '/chat 缺少当前上下文')
    assert_true(text_contains(page, '文件不经过服务器'), '/chat 缺少文件不经过服务器心智')
    assert_true(page.get_by_label('选择 AI 模型').count() >= 1, '/chat 缺少模型选择')
    assert_true(page.locator('.dd-ai-chat__search-pill').count() >= 1, '/chat 缺少联网搜索开关')
    assert_true(page.locator('textarea[placeholder*="给 DD助手发消息"]').count() == 1, '/chat 输入框没有使用 DD助手占位文案')

    click_ai_transfer_action(page)
    textarea = page.locator('.dd-ai-chat__composer textarea')
    draft = textarea.input_value(timeout=5000)
    assert_true('DD直连' in draft, 'AI 传输说明草稿缺少 DD直连')
    assert_true(('发送前检查' in draft) or ('文件概览' in draft) or ('传输说明' in draft), 'AI 草稿缺少传输说明结构')

    page.get_by_role('button', name='文本').first.click(timeout=5000)
    page.wait_for_selector('.dd-snaplink__workbench', timeout=10000)
    assert_true(page.url.endswith('/text'), 'AI 工具页左侧“文本”没有回到 /text')
    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-ai-command-acceptance-chat-desktop.png', full_page=True)
    page.close()


def qa_chat_mobile(browser):
    page = browser.new_page(viewport={'width': 375, 'height': 812}, is_mobile=True)
    page.goto(BASE_URL + '/chat', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-snaplink__tool-workbench.is-ai-chat', timeout=30000)
    page.wait_for_timeout(1400)

    assert_true(page.locator('.dd-snaplink__tool-mobile-nav').count() == 1, '/chat 移动端缺少顶部导航')
    assert_true(page.locator('.dd-snaplink__tool-mobile-actions').count() == 1, '/chat 移动端缺少快捷操作')
    assert_true(page.locator('.dd-snaplink__tool-mobile-queue').count() == 1, '/chat 移动端缺少传输队列抽屉')
    assert_true(page.locator('.dd-ai-chat__mobile-context').count() == 1, '/chat 移动端缺少 AI 状态上下文')
    assert_true(text_contains(page, '上下文不外传'), '/chat 移动端缺少“上下文不外传”文案')
    assert_true(page.locator('textarea[placeholder*="给 DD助手发消息"]').count() == 1, '/chat 移动端输入框没有 DD助手占位文案')
    ensure_no_horizontal_overflow(page, '/chat 移动端初始状态')

    click_ai_transfer_action(page)
    draft = page.locator('.dd-ai-chat__composer textarea').input_value(timeout=5000)
    assert_true('DD直连' in draft, '/chat 移动端快捷操作没有填入 DD直连草稿')
    assert_true(('发送前检查' in draft) or ('文件概览' in draft) or ('传输说明' in draft), '/chat 移动端草稿缺少结构')
    ensure_no_horizontal_overflow(page, '/chat 移动端快捷操作后')
    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-ai-command-acceptance-chat-mobile.png', full_page=True)
    page.close()


def qa_command_desktop(browser):
    page = browser.new_page(viewport={'width': 1366, 'height': 900})
    page.goto(BASE_URL + '/web-command', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-snaplink__tool-workbench.is-command', timeout=30000)
    page.wait_for_timeout(1200)

    assert_true(page.locator('.dd-snaplink__tool-workbench.is-command').count() == 1, '/web-command 未进入 DD 命令行工作台')
    assert_true(page.locator('.dd-snaplink__tool-content .dd-web-command').count() == 1, '/web-command 工具内容未渲染命令行')
    assert_true(page.locator('.dd-snaplink__tool-side').count() == 1, '/web-command 缺少右侧上下文/传输面板')
    assert_true(text_contains(page, '浏览器 / Docker 沙箱'), '/web-command 缺少沙箱文案')
    assert_true(text_contains(page, '运行环境'), '/web-command 缺少运行环境说明')
    assert_true(text_contains(page, '传输联动'), '/web-command 缺少传输联动说明')

    side_button_before = page.locator('.dd-snaplink__tool-side-actions').get_by_role('button', name='运行后发送结果')
    assert_true(side_button_before.count() == 1 and side_button_before.is_disabled(), '未运行前“运行后发送结果”应禁用')

    run_command_and_wait(page)
    output_text = '\n'.join(page.locator('.dd-web-command__result-area, .dd-web-command__terminal').all_inner_texts())
    assert_true(('answer = 42' in output_text) or ('hello from python' in output_text), '命令输出缺少默认 Python 结果')
    side_button_after = page.locator('.dd-snaplink__tool-side-actions').get_by_role('button', name='发送运行结果')
    assert_true(side_button_after.count() == 1 and not side_button_after.is_disabled(), '运行后“发送运行结果”没有启用')
    side_button_after.click(timeout=5000)
    page.wait_for_selector('.dd-snaplink__text-send-input textarea', timeout=10000)
    draft = page.locator('.dd-snaplink__text-send-input textarea').input_value(timeout=5000)
    assert_true('命令运行结果' in draft, '发送运行结果未填入文本发送页标题')
    assert_true(('answer = 42' in draft) or ('hello from python' in draft), '发送运行结果未带上命令输出')
    assert_true(page.url.endswith('/text'), '命令行发送结果后没有回到 /text')
    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-ai-command-acceptance-command-desktop.png', full_page=True)
    page.close()


def qa_command_mobile(browser):
    page = browser.new_page(viewport={'width': 375, 'height': 812}, is_mobile=True)
    page.goto(BASE_URL + '/web-command', wait_until='domcontentloaded')
    page.wait_for_selector('.dd-snaplink__tool-workbench.is-command', timeout=30000)
    page.wait_for_timeout(1400)

    assert_true(page.locator('.dd-snaplink__tool-mobile-nav').count() == 1, '/web-command 移动端缺少工作台导航')
    assert_true(page.locator('.dd-snaplink__tool-mobile-actions').count() == 1, '/web-command 移动端缺少快捷操作')
    assert_true(page.locator('.dd-snaplink__tool-mobile-queue').count() == 1, '/web-command 移动端缺少传输队列抽屉')
    assert_true(page.locator('.dd-web-command__mobile-tabs').count() == 1, '/web-command 移动端缺少代码/终端/输出切换')
    ensure_no_horizontal_overflow(page, '/web-command 移动端初始状态')

    run_command_and_wait(page)
    assert_true(page.locator('.dd-web-command.is-mobile-terminal').count() == 1, '移动端运行后没有切到终端面板')
    output_tab = page.locator('.dd-web-command__mobile-tabs').get_by_role('button', name='输出')
    output_tab.click(timeout=5000)
    page.wait_for_timeout(500)
    assert_true(text_contains(page, 'answer = 42') or text_contains(page, 'hello from python'), '移动端输出面板缺少命令结果')
    ensure_no_horizontal_overflow(page, '/web-command 移动端运行后')

    share_button = page.locator('.dd-snaplink__tool-mobile-actions').get_by_role('button', name='发送运行结果')
    assert_true(share_button.count() == 1 and not share_button.is_disabled(), '移动端运行后“发送运行结果”没有启用')
    share_button.click(timeout=5000)
    page.wait_for_selector('.dd-snaplink__text-send-input textarea', timeout=10000)
    draft = page.locator('.dd-snaplink__text-send-input textarea').input_value(timeout=5000)
    assert_true('命令运行结果' in draft, '移动端发送运行结果未填入文本页')
    assert_true(('answer = 42' in draft) or ('hello from python' in draft), '移动端发送运行结果缺少输出内容')
    ensure_no_horizontal_overflow(page, '/web-command 移动端分享后')
    page.screenshot(path='C:/Project/ddzhilian/output/chrome-qa/dd-ai-command-acceptance-command-mobile.png', full_page=True)
    page.close()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        qa_chat_desktop(browser)
        qa_chat_mobile(browser)
        qa_command_desktop(browser)
        qa_command_mobile(browser)
        browser.close()
    print({'ok': True, 'checked': ['chat-desktop', 'chat-mobile', 'command-desktop', 'command-mobile']})


if __name__ == '__main__':
    main()


