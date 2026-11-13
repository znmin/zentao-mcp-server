# @znmin/zentao-mcp-server

你自己维护的禅道 MCP Server，支持 `npx` 启动、账号密码自动换取 Token，以及完整 Bug 工作流。
基于 `@aipper/zentao-mcp-server@0.1.26` 的 MIT 代码维护，兼容原有工具和环境变量，现提供 14 个工具，便于迁移。

## 快速接入

需要 Node.js 20 或以上。MCP 客户端配置：

```json
{
  "mcpServers": {
    "zentao": {
      "command": "npx",
      "args": ["-y", "@znmin/zentao-mcp-server@1.1.0"],
      "env": {
        "ZENTAO_BASE_URL": "https://zentao.example.com",
        "ZENTAO_ACCOUNT": "your-account",
        "ZENTAO_PASSWORD": "your-password"
      }
    }
  }
}
```

如果使用内网 HTTP，另外设置 `ZENTAO_ALLOW_INSECURE_HTTP=true`。
Windows 客户端无法直接找到 `npx` 时，使用 `command: "cmd"`，
`args: ["/d", "/c", "npx", "-y", "@znmin/zentao-mcp-server@1.1.0"]`。

从上游迁移：只需将启动包名从 `@aipper/zentao-mcp-server` 改为本包，保留现有 `ZENTAO_*` 配置。
服务端和 CLI 不需要安装到禅道服务器上；MCP 运行在 Agent Runtime 所在电脑，附件路径也是该电脑上的路径。
本包使用 stdio，不是远程 HTTP MCP 服务。

## 附件修复与支持范围

Bug 查询和处理使用 REST v1（禅道 16.5+）。**附件上传采用禅道 22.0+ REST v2 官方接口**：

```text
POST /api.php/v2/files
multipart/form-data:
  file       = 文件
  objectType = bug
  objectID   = Bug ID
```

这避免了上游 `${baseUrl}index.php` 缺少斜杠的问题，也不再依赖网页上传和额外的 `/bugs/{id}/files` 关联接口。
支持根目录和子目录部署，例如 `https://example.com/zentao`；保留部署路径前缀。

上传前先读取 Bug 确认访问权限，上传后再回读 Bug 的 `files` 确认文件 ID 已关联。
结果包含 `fileId`、`uploaded`、`linked` 和 `verified`；只有回读确认后才返回 `verified: true`。
如果上传已成功但关联未确认，会返回 MCP `isError: true`，同时保留文件 ID 和 `doNotRetryUpload: true`。
请人工检查附件列表，不要盲目重传。超时也不自动重试，避免重复附件。

对于低于 22.0 的禅道版本，本包不自动尝试未经验证的网页上传方式。
如企业版或定制版调整了上传入口，可设置 `ZENTAO_UPLOAD_PATH`，但该接口必须接受相同的 REST v2 字段并直接关联对象。

## 工具

| 工具 | 用途 |
| --- | --- |
| `get_token` | 获取或刷新认证 Token，返回脱敏摘要 |
| `list_my_projects` | 项目列表 |
| `get_my_bugs` | 指派给当前账号的 Bug，支持状态、关键字和范围筛选 |
| `get_bug_detail` | Bug 详情、激活摘要、图片及附件 ID/名称/大小 |
| `get_bug_actions` | Bug 动作历史和激活说明 |
| `resolve_bug` | 解决一个 Bug |
| `batch_resolve_my_bugs` | 批量解决当前账号的 Bug |
| `close_bug` | 关闭 Bug |
| `verify_bug` | 验证通过关闭，失败激活 |
| `comment_bug` | 普通文本/HTML 或结构化备注 |
| `add_bug_comment` | 新增普通备注，无需四段模板 |
| `edit_bug_comment` | 编辑本 Bug 的既有备注动作 |
| `upload_attachment` | 上传文件并验证 Bug 附件关联 |
| `download_attachment` | 通过文件 ID 下载到 Runtime 本地路径 |

`upload_attachment` 参数：`bugId`（正整数）、`filePath`（运行电脑上的绝对路径），可选 `fileName`。
`get_bug_detail` / `get_bug_actions` 参数：`id`。
`download_attachment` 参数：`fileId`、`savePath`。

解决和备注沿用上游的结构化说明：`solutionModules` 包含 `rootCause`（根因）、`fixApproach`（修复思路）、
`logicChange`（改动逻辑）、`impact`（影响范围）。`resolve_bug` 默认解决版本为 `trunk`，可通过参数或环境变量覆盖。
解决 Bug 是写操作；请只在用户授权完成对应工作时执行。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ZENTAO_BASE_URL` | 必填 | 禅道部署地址，包含子目录时保留子目录，不包含 API 路径 |
| `ZENTAO_ACCOUNT` | 必填 | 账号 |
| `ZENTAO_PASSWORD` | 必填 | 密码 |
| `ZENTAO_ALLOW_INSECURE_HTTP` | `false` | 显式允许内网 HTTP |
| `ZENTAO_API_PREFIX` | `/api.php/v1` | Bug API 路径，相对部署地址 |
| `ZENTAO_TOKEN_PATH` | `${API_PREFIX}/tokens` | 认证路径，相对部署地址 |
| `ZENTAO_UPLOAD_PATH` | `/api.php/v2/files` | 接受 REST v2 multipart 字段的上传路径 |
| `ZENTAO_MAX_UPLOAD_BYTES` | `52428800` | 单个附件最大字节数，默认 50 MiB |
| `ZENTAO_HTTP_TIMEOUT_MS` | `30000` | 单请求超时，1–300000 毫秒 |
| `ZENTAO_TOKEN_TTL_MS` | `3000000` | Token 缓存时长，毫秒 |
| `ZENTAO_READ_ONLY` | `false` | `true` 隐藏并拒绝 Bug 写操作和附件上传；允许读取和本地下载 |
| `ZENTAO_PRODUCT_ID` | 无 | 默认产品范围 |
| `ZENTAO_PROJECT_ID` | 无 | 默认项目范围 |
| `ZENTAO_PROJECT_SET_ID` | 无 | 默认项目集范围 |
| `ZENTAO_DEFAULT_ASSIGNED_TO` | 无 | 解决 Bug 的默认接收账号；未配置时转回创建人，工具 assignedTo 参数优先 |
| `ZENTAO_DEFAULT_RESOLVED_BUILD` | `trunk` | 默认解决版本 |
| `ZENTAO_MY_BUGS_PATH` | 自动 | 自定义“我的 Bug”路径 |
| `ZENTAO_BUGS_FALLBACK_PATHS` | 自动 | 逗号分隔的候选列表路径 |
| `ZENTAO_PROJECT_SET_BUGS_PATHS` | 自动 | 项目集路径模板，支持 `{projectSetId}` |
| `ZENTAO_DEBUG` | `false` | 向 stderr 输出诊断信息 |

程序读取 MCP 客户端传入的环境变量，不自动加载 `.env`。密码、Token 不要提交到仓库。
读写能力还取决于禅道账号本身的产品、项目及操作权限；只读开关不会提升账号权限。

## 开发与发布

```bash
npm ci --ignore-scripts
npm run lint
npm test
npm pack --dry-run
```

测试覆盖真实 MCP stdio 工具调用、权限过滤、Token 缓存、根目录/子目录、
multipart 字段和文件名、文件大小、HTTP/JSON 错误、超时、拒绝重定向、上传后关联回读、下载和结构化解决说明。
所有自动测试使用本地模拟服务，不接触真实禅道，也不需要凭证。
GitHub CI 在 Windows / Ubuntu 和 Node.js 20 / 24 上运行。

发布新版本：修改版本和 CHANGELOG，测试通过后执行 `npm publish --access public`，再推送同版本 Git 标签。
发布包只包含运行代码、文档和许可证；测试文件、配置和登录凭证不会随包分发。

## 来源与许可证

MIT。上游版权保留于 [LICENSE](LICENSE)，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
官方接口：[附件上传说明](https://www.zentao.net/book/api/post-files-2325.html)。

## 1.1.0 转交人员与备注

`resolve_bug` 和 `batch_resolve_my_bugs` 支持 `assignedTo`（禅道账号，不是中文显示名）。
优先级：工具参数 > `ZENTAO_DEFAULT_ASSIGNED_TO` > 该 Bug 的创建人 `openedBy`。
无法确定有效接收人时拒绝提交解决操作；解决后回读指派人，未确认时返回明确警告，不自动重复解决。
批量操作未指定统一账号时，每条 Bug 分别回到自己的创建人。
禅道是否能 @到该人还取决于其手机号、通知绑定和 Webhook 设置，本 MCP 不直接发送企业微信消息。
禅道 22.0 API 通知链接丢域名的问题仍需要在禅道服务端修复，本次不会修改服务端。

普通备注：`add_bug_comment({"id":7,"comment":"这里填写普通备注或富文本"})`。
原 `comment_bug` 也支持普通 comment；若提供非空 solutionModules 则优先格式化它。
备注编辑：`edit_bug_comment({"id":7,"actionId":101,"comment":"修改后的备注"})`。
actionId 来自 `get_bug_actions` 或新增备注的返回值；只能编辑属于该 Bug 的 commented 动作，不能编辑解决、指派等系统动作。

备注操作使用同一账号的独立页面登录会话：先访问 `index.php?m=api&f=getSessionID&t=json`，
再 POST 用户登录，随后调用 action.comment / action.editComment。密码仅放在 POST 请求体，
会话仅通过 Cookie 发送，不把凭证放在 URL 中。所有请求限定在配置的部署地址，拒绝重定向。
服务端权限、登录策略或验证码可能使页面接口不可用；此时返回错误，不会改用 Bug 字段编辑来冒充备注。
页面接口有时返回 reload 脚本，本 MCP 不执行该脚本，仅通过 Bug 动作历史确认写入结果。
提交后回读失败时保留不确定状态并提示先检查历史，不自动重试写入，避免重复备注。
解决 Bug 不再自动追加一条重复备注，四段说明保存在解决动作中。