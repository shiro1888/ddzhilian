# DD直连 SEO 与 Google 广告上线清单

这份清单用于在代码部署后完成搜索收录、AdSense/Google Ads 基础校验和广告落地页检查。

## 关键公开 URL

- 首页落地页：https://dd.shiro1888.com/
- 核心工具页：https://dd.shiro1888.com/text
- AI 助手页：https://dd.shiro1888.com/chat
- 隐私政策：https://dd.shiro1888.com/privacy
- 服务条款：https://dd.shiro1888.com/terms
- 广告与 Cookie 说明：https://dd.shiro1888.com/advertising
- 联系我们：https://dd.shiro1888.com/contact
- robots.txt：https://dd.shiro1888.com/robots.txt
- sitemap.xml：https://dd.shiro1888.com/sitemap.xml
- ads.txt：https://dd.shiro1888.com/ads.txt
- security.txt：https://dd.shiro1888.com/.well-known/security.txt

## 部署后必须确认

- 所有关键公开 URL 返回 200。
- `/privacy`、`/terms`、`/advertising`、`/contact` 可以从首页和工具页找到。
- `/ads.txt` 包含 `google.com, pub-6789129259270412, DIRECT, f08c47fec0942fa0`。
- `/robots.txt` 没有屏蔽公开页，并且指向 sitemap。
- `/admin` 和 `/admin-v2` 不作为广告落地页，并保持 `noindex`。
- Cookie/广告提示可以选择“仅必要”和“同意广告/Cookie”。
- 在 `/advertising` 可以重新管理 Cookie 选择。
- `support@dd.shiro1888.com` 是真实可收信邮箱。

## Google Search Console

- 添加并验证 `https://dd.shiro1888.com` 域名或网址前缀资源。
- 提交 sitemap：https://dd.shiro1888.com/sitemap.xml
- 使用网址检查工具检查 `/`、`/text`、`/privacy`、`/terms`、`/advertising`、`/contact`。
- 等待 Google 抓取后检查是否有移动端可用性、索引、结构化数据问题。

## Google AdSense

- 在 AdSense 后台添加站点 `dd.shiro1888.com`。
- 确认发布商 ID 是 `ca-pub-6789129259270412`。
- 确认页面含 `google-adsense-account` meta。
- 确认 `/ads.txt` 可以公开访问。
- 确认隐私政策说明广告、Cookie、本地存储和用户选择权。
- 如果面向欧盟、英国或瑞士用户投放个性化广告，需要接入正式 CMP/同意管理方案。

## Google Ads

- 优先使用首页 `/` 或核心工具页 `/text` 作为广告落地页。
- 广告文案必须和落地页内容一致，避免承诺页面没有说明的能力。
- 落地页必须可访问、加载稳定、移动端可用。
- 不要把 `/admin`、登录后台、空白页或需要权限才能看到内容的页面作为广告落地页。
- 广告投放前确认页面没有误导性下载按钮、强制跳转、无法关闭的弹窗或遮挡主要内容的广告。

## 后续优化建议

- 接入 Google Analytics 或其他统计工具，跟踪落地页访问和转化。
- 为首页增加真实产品截图、使用步骤和常见问题，提高广告质量分。
- 如果需要投放欧美地区，补正式英文版隐私政策、条款和 Cookie 同意管理。
- 在 Google Search Console 中持续观察查询词、索引覆盖和 Core Web Vitals。
