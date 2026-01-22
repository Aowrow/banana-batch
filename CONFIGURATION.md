# ⚙️ 配置指南

本文档说明 Banana Batch 的各项配置选项。

## 📋 目录

- [提供商配置](#提供商配置)
- [性能配置](#性能配置)
- [UI 配置](#ui-配置)
- [开发配置](#开发配置)

## 提供商配置

### Google Gemini

#### 获取 API Key

1. 访问 [Google AI Studio](https://ai.google.dev/)
2. 登录 Google 账号
3. 点击 "Get API Key"
4. 创建新的 API Key

#### 配置步骤

1. 点击右上角 **🔑 设置**图标
2. 选择提供商：**Gemini**
3. 输入 API Key
4. 选择模型：
   - **gemini-3-pro-image-preview** (推荐) - 高质量图片生成
   - **gemini-2.5-flash-image** - 快速生成
   - **自定义模型** - 输入其他 Gemini 模型名称
5. 点击 **保存**

#### 模型对比

| 模型 | 速度 | 质量 | 适用场景 |
|------|------|------|----------|
| gemini-3-pro-image-preview | 较慢 | 高 | 高质量创作、细节丰富的图片 |
| gemini-2.5-flash-image | 快 | 中 | 快速迭代、草图生成 |

### OpenAI Compatible

#### 支持的服务

- OpenAI 官方 API
- Google AI OpenAI endpoint
- Azure OpenAI
- 任何 OpenAI 兼容接口

#### 配置步骤

1. 点击右上角 **🔑 设置**图标
2. 选择提供商：**OpenAI Compatible**
3. 配置 Base URL（可选）：
   - **默认**: `https://api.openai.com/v1`
   - **Google AI**: `https://generativelanguage.googleapis.com/v1beta/openai/`
   - **自定义服务**: 输入你的服务地址
4. 输入 API Key
5. 选择模型：
   - **gemini-3-pro-image-preview** (适用于 Google AI endpoint)
   - **gpt-4o** (OpenAI)
   - **自定义模型** - 输入其他模型名称
6. 点击 **保存**

#### Base URL 配置示例

```
# OpenAI 官方
https://api.openai.com/v1

# Google AI OpenAI endpoint
https://generativelanguage.googleapis.com/v1beta/openai/

# Azure OpenAI
https://YOUR_RESOURCE_NAME.openai.azure.com/

# 自定义代理
https://your-proxy-server.com/v1
```

## 性能配置

### 并发设置

当前代码中的并发配置：

```typescript
// services/geminiService.ts 和 openaiService.ts
const MAX_CONCURRENT_REQUESTS = 10;  // 最大并发请求数
const MAX_RETRIES = 3;                // 最大重试次数
```

#### 调整并发数

**位置**: `services/geminiService.ts` 和 `services/openaiService.ts`

```typescript
// 默认值
const MAX_CONCURRENT_REQUESTS = 10;

// 提高并发（如果 API 支持）
const MAX_CONCURRENT_REQUESTS = 20;

// 降低并发（避免触发限流）
const MAX_CONCURRENT_REQUESTS = 5;
```

**建议**:
- **Gemini**: 10-15 并发
- **OpenAI**: 5-10 并发（根据你的 rate limit）
- **自定义服务**: 根据服务器能力调整

### 批次大小

**位置**: 应用内设置面板

- **推荐范围**: 2-10 张
- **最大值**: 20 张
- **说明**: 批次越大，总耗时越长，但单次操作生成更多图片

### 重试策略

**当前配置**:
```typescript
const MAX_RETRIES = 3;  // 失败后重试 3 次
```

**重试间隔**: 指数退避
- 第 1 次重试: 等待 1 秒
- 第 2 次重试: 等待 2 秒
- 第 3 次重试: 等待 4 秒

**调整建议**:
```typescript
// 提高容错性
const MAX_RETRIES = 5;

// 快速失败
const MAX_RETRIES = 1;
```

## UI 配置

### 主题设置

**位置**: 右上角主题切换按钮

- **浅色主题**: 适合白天使用
- **深色主题**: 适合夜间使用

**持久化**: 主题设置保存在 localStorage 中

### 图片比例和分辨率

**位置**: 应用内设置面板

#### 支持的比例

- **Auto** (自动)
- **1:1** (正方形)
- **16:9** (横屏)
- **9:16** (竖屏)
- **4:3** (传统)
- **3:4** (竖版)

#### 支持的分辨率

- **1K**: 快速生成，文件较小
- **2K**: 平衡质量和速度
- **4K**: 高质量，文件较大

**建议组合**:
```
快速草图: Auto + 1K
标准创作: 16:9 + 2K
高质量输出: 1:1 + 4K
```

### 界面自定义

#### 修改配色

**位置**: `App.tsx` 和组件样式

```typescript
// 主色调 (Indigo)
className="bg-indigo-600"

// 可替换为其他颜色
className="bg-blue-600"
className="bg-purple-600"
className="bg-pink-600"
```

## 开发配置

### Vite 配置

**文件**: `vite.config.ts`

#### 开发服务器

```typescript
server: {
  port: 3000,              // 端口号
  host: '0.0.0.0',         // 监听所有网络接口
  allowedHosts: [          // 允许的域名
    'localhost',
    'your-domain.com'
  ]
}
```

#### 生产构建

```typescript
build: {
  outDir: 'dist',          // 输出目录
  sourcemap: false,        // 是否生成 sourcemap
  minify: 'terser',        // 压缩方式
  rollupOptions: {
    output: {
      manualChunks: {      // 代码分割
        vendor: ['react', 'react-dom'],
        icons: ['lucide-react']
      }
    }
  }
}
```

### 环境变量

**文件**: `.env.local` (不提交到 Git)

```bash
# 可选配置
VITE_DEFAULT_THEME=dark
VITE_DEFAULT_BATCH_SIZE=4
```

**读取方式**:
```typescript
const theme = import.meta.env.VITE_DEFAULT_THEME || 'light';
```

### TypeScript 配置

**文件**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "strict": true,
    "skipLibCheck": true
  }
}
```

## 数据存储

### localStorage 结构

所有配置保存在浏览器的 localStorage 中：

```javascript
// 提供商
localStorage.getItem('app_provider')           // 'gemini' | 'openai'

// API Keys
localStorage.getItem('user_gemini_api_key')    // Gemini API Key
localStorage.getItem('user_openai_api_key')    // OpenAI API Key

// 配置
localStorage.getItem('user_openai_base_url')   // Base URL
localStorage.getItem('user_gemini_model')      // Gemini 模型
localStorage.getItem('user_openai_model')      // OpenAI 模型

// UI 设置
localStorage.getItem('user_theme')             // 主题
localStorage.getItem('user_batch_size')        // 批次大小
localStorage.getItem('user_aspect_ratio')      // 比例
localStorage.getItem('user_resolution')        // 分辨率
```

### 清除配置

**方法 1**: 浏览器控制台
```javascript
localStorage.clear();
```

**方法 2**: 浏览器开发者工具
1. F12 打开开发者工具
2. Application > Storage > Local Storage
3. 右键 > Clear

## 性能优化建议

### 1. 调整并发数

根据你的 API 限制调整并发：

```typescript
// services/geminiService.ts
const MAX_CONCURRENT_REQUESTS = 15;  // 从 10 提高到 15
```

### 2. 减少重试次数

如果 API 很稳定，可以减少重试：

```typescript
const MAX_RETRIES = 2;  // 从 3 降低到 2
```

### 3. 优化批次大小

- **小批次** (2-4 张): 快速反馈
- **中批次** (5-8 张): 平衡
- **大批次** (10-20 张): 一次生成更多

### 4. 选择合适的模型

- **快速迭代**: 使用 gemini-2.5-flash-image
- **最终输出**: 使用 gemini-3-pro-image-preview

## 安全建议

### API Key 安全

1. **永远不要**将 API Key 提交到 Git
2. **永远不要**在代码中硬编码 API Key
3. **使用** localStorage 存储（仅限客户端）
4. **定期轮换** API Key

### 限流保护

设置合理的并发数避免触发 API 限流：

```typescript
// 保守设置
const MAX_CONCURRENT_REQUESTS = 5;

// 激进设置（需要高额度）
const MAX_CONCURRENT_REQUESTS = 20;
```

## 常见配置问题

### 1. API Key 无效

**症状**: 提示 "API Key 无效或未配置"

**解决**:
1. 检查 API Key 格式是否正确
2. 确认 API Key 有效且未过期
3. 检查是否选择了正确的提供商

### 2. 503 服务不可用

**症状**: 显示 "服务暂时不可用"

**解决**:
1. 检查 API 服务状态
2. 降低并发数
3. 减少批次大小
4. 稍后重试

### 3. 图片生成很慢

**原因**:
- 网络延迟
- API 服务器负载高
- 批次大小太大

**解决**:
1. 提高并发数（如果限额允许）
2. 使用更快的模型（flash 版本）
3. 减小批次大小，多次生成
4. 检查网络连接

### 4. Base URL 配置错误

**症状**: OpenAI 接口调用失败

**解决**:
1. 确认 URL 格式正确
2. 必须以 `/v1` 或类似路径结尾
3. 使用 HTTPS
4. 测试端点可访问性

## 高级配置

### 自定义重试逻辑

**位置**: `services/geminiService.ts` 和 `services/openaiService.ts`

```typescript
// 当前: 指数退避
const waitTime = 1000 * Math.pow(2, attempt - 1);

// 修改为线性退避
const waitTime = 1000 * attempt;

// 修改为固定延迟
const waitTime = 2000;
```

### 添加请求超时

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 秒超时

try {
  const response = await fetch(url, {
    signal: controller.signal
  });
} finally {
  clearTimeout(timeoutId);
}
```

### 自定义错误消息

**位置**: `types/errors.ts`

```typescript
export class ServerError extends AppError {
  constructor(message: string = 'Server error', statusCode?: number) {
    let userMessage = '你的自定义错误消息';
    // ...
  }
}
```

## 监控和调试

### 启用详细日志

**位置**: `utils/errorHandler.ts`

```typescript
// 当前: 仅在开发模式记录
if (import.meta.env.DEV) {
  console.error(...)
}

// 修改为始终记录
console.error(...)
```

### 性能监控

在浏览器控制台查看性能：

```javascript
// 查看 localStorage 使用情况
console.log(localStorage);

// 监控网络请求
// 在 Network 标签中查看 API 调用
```

---

如有其他配置问题，请参考：
- [README.md](./README.md) - 项目概览
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 部署指南
- [GitHub Issues](https://github.com/hezi-ywt/banana-batch/issues) - 问题反馈
