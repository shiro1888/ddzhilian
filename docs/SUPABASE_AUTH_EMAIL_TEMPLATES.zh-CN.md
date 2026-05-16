# Supabase 邮件确认模板

本文档提供 ddzhilian 可直接粘贴到 Supabase Dashboard 的账号邮件模板，以及配套的站内落地页配置方式。

## 当前项目状态

当前后端注册逻辑位于 `server/src/registry/account-registry.ts`，注册时调用 Supabase `auth.signUp` 发送确认邮件，不再自动创建站内登录 Cookie。用户需要完成邮箱确认后，再通过 `/api/auth/login` 登录。

## Supabase URL 配置

在 Supabase Dashboard 中进入 `Authentication` -> `URL Configuration`：

- `Site URL`：生产环境填 `https://ddzhilian.com`
- `Redirect URLs`：至少加入 `https://ddzhilian.com/auth/confirm`
- 本地调试可额外加入 `http://localhost:3000/auth/confirm`
- 后端环境变量 `SUPABASE_ANON_KEY`：建议填写 Supabase anon/publishable key，用于用户态注册、登录和邮件确认发送
- 后端环境变量 `SUPABASE_AUTH_EMAIL_REDIRECT_URL`：生产环境建议填 `https://ddzhilian.com/auth/confirm`

后端会把 `SUPABASE_AUTH_EMAIL_REDIRECT_URL` 作为 `emailRedirectTo` 传给 Supabase。邮件模板中的按钮应使用 `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=...` 打开站内落地页，再由站内落地页调用后端 `/api/auth/confirm` 完成确认。

## Resend 发信配置

如果注册确认邮件继续使用 Supabase Auth，Resend 应配置到 Supabase 的自定义 SMTP 中，而不是在注册接口里直接调用 Resend API。这样 Supabase 才能继续生成、校验和消费确认链接。

项目里已提供一个后端 Resend API 连通性测试脚本：

```bash
cd server
npm run email:resend-test
```

运行前在 `server/.env` 中把 `RESEND_API_KEY=re_xxxxxxxxx` 替换成你的真实 Resend API key，并按需设置 `RESEND_TEST_FROM`、`RESEND_TEST_TO`、`RESEND_TEST_SUBJECT` 和 `RESEND_TEST_ACTION_URL`。脚本会读取 `server/email-templates/resend-email-confirmation.html` 并替换模板占位符。这个脚本只用于测试 Resend API 能否发信，不替代 Supabase Auth 的邮箱确认流程。

## Resend HTML 模板

已新增 `server/email-templates/resend-email-confirmation.html`，可作为 Resend API 的 HTML 邮件模板。模板支持这些占位符：

- `{{brandName}}`
- `{{recipientEmail}}`
- `{{actionUrl}}`
- `{{supportEmail}}`
- `{{currentYear}}`

当前测试脚本会从 `server/.env` 读取对应的 `RESEND_TEST_*` 配置并渲染这些占位符。

## Confirm signup 模板

Dashboard 位置：`Authentication` -> `Email Templates` -> `Confirm signup`

Subject:

```text
确认你的 ddzhilian 账号
```

HTML:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>确认你的 ddzhilian 账号</title>
  </head>
  <body style="margin:0;background:#f5f5f5;color:#111111;font-family:Microsoft YaHei,PingFang SC,Hiragino Sans GB,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      点击按钮完成邮箱确认，启用你的 ddzhilian 账号。
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e5;border-radius:8px;">
            <tr>
              <td style="padding:28px 28px 8px;">
                <div style="font-size:14px;font-weight:700;color:#07c160;">ddzhilian</div>
                <h1 style="margin:18px 0 10px;font-size:24px;line-height:1.3;color:#111111;">确认你的邮箱</h1>
                <p style="margin:0;font-size:15px;line-height:1.8;color:#666666;">
                  你好，{{ .Email }}。请确认这是你的邮箱地址。确认后即可使用 ddzhilian 的账号功能。
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 8px;">
                <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/image" style="display:inline-block;background:#07c160;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;line-height:1;padding:14px 20px;border-radius:8px;">
                  确认邮箱
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 28px;">
                <p style="margin:0;font-size:13px;line-height:1.7;color:#999999;">
                  如果不是你发起的注册，可以忽略这封邮件。为了避免邮箱安全扫描提前消耗确认链接，按钮会先打开 ddzhilian 的确认落地页。
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Magic Link 登录模板

Dashboard 位置：`Authentication` -> `Email Templates` -> `Magic Link`

Subject:

```text
登录 ddzhilian
```

HTML:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>登录 ddzhilian</title>
  </head>
  <body style="margin:0;background:#f5f5f5;color:#111111;font-family:Microsoft YaHei,PingFang SC,Hiragino Sans GB,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      点击按钮确认本次 ddzhilian 登录。
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e5;border-radius:8px;">
            <tr>
              <td style="padding:28px 28px 8px;">
                <div style="font-size:14px;font-weight:700;color:#07c160;">ddzhilian</div>
                <h1 style="margin:18px 0 10px;font-size:24px;line-height:1.3;color:#111111;">确认本次登录</h1>
                <p style="margin:0;font-size:15px;line-height:1.8;color:#666666;">
                  你好，{{ .Email }}。请点击下方按钮完成登录确认。
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 8px;">
                <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/image" style="display:inline-block;background:#07c160;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;line-height:1;padding:14px 20px;border-radius:8px;">
                  确认登录
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 28px;">
                <p style="margin:0;font-size:13px;line-height:1.7;color:#999999;">
                  如果不是你本人请求登录，请忽略这封邮件。链接仅在短时间内有效。
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## 落地页行为

已新增 `/auth/confirm` 页面，支持三种状态：

- `?confirmation_url=...`：兼容旧模板，把嵌套的 Supabase token 转交给后端 `/api/auth/confirm`。
- `?token_hash=...&type=...`：自动访问后端 `/api/auth/confirm`，后端调用 Supabase `verifyOtp`，写入本站 HttpOnly Cookie，然后跳转到 `/image`。
- `#access_token=...`、`#error_description=...` 或 `?code=...`：兼容旧链接的 Supabase 回跳状态，清理地址栏中的敏感参数，确认成功后跳转到 `/image`。
- 无参数访问：显示等待确认状态。

为避免开放跳转风险，页面只接受 `https://.../auth/v1/verify` 形态的 Supabase 确认链接。

注意：新模板使用 `TokenHash` 走后端确认链路，确认成功后会直接写入 ddzhilian 的账号 Cookie。旧模板如果继续使用 `{{ .ConfirmationURL }}`，页面仍会尽量兼容，但可能只能完成 Supabase 邮箱确认，无法自动写入本站 Cookie。
