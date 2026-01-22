# 🚀 部署指南

本文档详细说明如何将 Banana Batch 部署到 GitHub Pages 以及其他平台。

## 📋 目录

- [GitHub Pages 部署](#github-pages-部署)
- [其他部署平台](#其他部署平台)
- [环境变量配置](#环境变量配置)
- [常见问题](#常见问题)

## GitHub Pages 部署

### 自动部署（推荐）

项目已配置 GitHub Actions 自动部署，无需手动操作。

#### 1. 启用 GitHub Pages

1. 进入你的 GitHub 仓库
2. 点击 **Settings** (设置)
3. 在左侧菜单中找到 **Pages**
4. 在 **Source** 下选择 **GitHub Actions**

#### 2. 推送代码触发部署

```bash
# 添加所有更改
git add .

# 提交更改
git commit -m "feat: Setup GitHub Pages deployment"

# 推送到 GitHub
git push origin main
```

#### 3. 监控部署状态

1. 前往仓库的 **Actions** 标签
2. 查看 "Deploy to GitHub Pages" workflow 的运行状态
3. 等待部署完成（通常 1-2 分钟）

#### 4. 访问部署的应用

部署成功后，访问：
```
https://hezi-ywt.github.io/banana-batch/
```

### 手动触发部署

如果需要手动触发部署：

1. 进入仓库的 **Actions** 标签
2. 选择 "Deploy to GitHub Pages" workflow
3. 点击 **Run workflow** 按钮
4. 选择分支 (通常是 `main`)
5. 点击 **Run workflow** 确认

### 部署配置文件

#### `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          NODE_ENV: production

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

#### `vite.config.ts` 配置

```typescript
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: mode === 'production' ? '/banana-batch/' : '/',
    // ... 其他配置
  };
});
```

**重要说明**:
- `base` 路径必须与你的仓库名称匹配
- 如果仓库名是 `my-app`，则 `base` 应该是 `/my-app/`
- 开发环境使用 `/` 避免路径问题

## 其他部署平台

### Vercel

1. 导入 GitHub 仓库到 Vercel
2. Vercel 会自动检测 Vite 项目
3. 设置环境变量（如果需要）
4. 点击部署

**配置要求**:
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

### Netlify

1. 连接 GitHub 仓库到 Netlify
2. 配置构建设置：
   ```
   Build command: npm run build
   Publish directory: dist
   ```
3. 部署

**netlify.toml** (可选):
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Cloudflare Pages

1. 连接 GitHub 仓库
2. 配置构建：
   - Build command: `npm run build`
   - Build output directory: `dist`
3. 部署

## 环境变量配置

### 本地开发

创建 `.env.local` 文件（**不要提交到 Git**）:

```bash
# 开发环境可选配置
VITE_DEFAULT_THEME=dark
```

### 生产环境

**重要**: 不要在环境变量中设置 API Key！

API Key 应该由用户在应用内通过设置面板输入，原因：
1. **安全性**: 前端代码中的环境变量会被打包到构建文件中
2. **灵活性**: 用户可以使用自己的 API Key
3. **最佳实践**: API Key 只存储在浏览器 localStorage 中

## 本地构建测试

在部署前，建议本地测试构建结果：

```bash
# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

访问 `http://localhost:3000` 测试构建版本。

## 常见问题

### 1. 部署后页面空白

**原因**: `vite.config.ts` 中的 `base` 路径配置不正确

**解决方法**:
```typescript
// 确保 base 路径与仓库名匹配
base: mode === 'production' ? '/your-repo-name/' : '/',
```

### 2. 静态资源 404

**原因**: 资源路径配置问题

**解决方法**:
1. 检查 `base` 配置
2. 确保使用相对路径引用资源
3. 清除缓存重新构建：`rm -rf dist && npm run build`

### 3. GitHub Actions 部署失败

**常见原因**:
- 没有启用 GitHub Pages (Source 设置为 GitHub Actions)
- 权限不足
- 构建错误

**解决方法**:
1. 检查 Actions 日志查看具体错误
2. 确认 GitHub Pages 已启用
3. 检查 `package.json` 中的构建脚本

### 4. API Key 配置问题

**问题**: 部署后无法使用

**原因**: API Key 需要用户手动输入

**解决方法**:
1. 点击右上角设置图标 (🔑)
2. 选择提供商 (Gemini 或 OpenAI)
3. 输入你的 API Key
4. 点击保存

API Key 会保存在浏览器的 localStorage 中。

### 5. CORS 错误

**问题**: 跨域请求被阻止

**原因**: API 提供商的 CORS 策略

**解决方法**:
- Google Gemini: 支持浏览器直接调用
- OpenAI: 可能需要代理服务器
- 使用支持 CORS 的兼容接口

## 性能优化建议

### 构建优化

1. **启用代码分割**
   ```typescript
   // vite.config.ts
   build: {
     rollupOptions: {
       output: {
         manualChunks: {
           vendor: ['react', 'react-dom'],
           icons: ['lucide-react'],
         }
       }
     }
   }
   ```

2. **压缩资源**
   - 已自动启用 terser 压缩
   - 图片使用 WebP 格式
   - 启用 gzip/brotli 压缩

3. **CDN 加速**
   - 使用 Cloudflare 等 CDN
   - 配置缓存策略

### 运行时优化

- 图片懒加载
- 虚拟滚动 (如需要)
- Service Worker 缓存 (可选)

## 监控和分析

### 添加分析工具

1. **Google Analytics**
   ```html
   <!-- 在 index.html 中添加 -->
   <script async src="https://www.googletagmanager.com/gtag/js?id=GA_ID"></script>
   ```

2. **Vercel Analytics** (如果使用 Vercel)
   ```bash
   npm install @vercel/analytics
   ```

## 更新部署

### 自动更新

推送到 `main` 分支会自动触发部署：

```bash
git add .
git commit -m "feat: Add new feature"
git push origin main
```

### 回滚

如果新版本有问题：

1. 在 GitHub Actions 中找到之前成功的部署
2. 重新运行该 workflow
3. 或者使用 git revert:
   ```bash
   git revert HEAD
   git push origin main
   ```

## 安全建议

1. **不要提交敏感信息**
   - API Keys
   - 密码
   - 私钥

2. **使用环境变量**
   - 开发: `.env.local` (不提交)
   - 生产: 平台环境变量

3. **定期更新依赖**
   ```bash
   npm audit
   npm update
   ```

4. **启用 Dependabot**
   - 自动检测依赖漏洞
   - 自动创建更新 PR

## 支持

如果遇到部署问题：

1. 查看 [Issues](https://github.com/hezi-ywt/banana-batch/issues)
2. 创建新 Issue 描述问题
3. 提供错误日志和环境信息

---

**祝部署顺利！** 🚀
