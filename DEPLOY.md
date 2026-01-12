# 部署指南

## 生产环境部署（推荐）

对于生产环境，应该构建静态文件并使用 Web 服务器（如 Nginx）来服务。

### 1. 构建项目

```bash
cd /home/ywt/banana-batch
npm run build
```

构建产物将输出到 `dist/` 目录。

### 2. 使用 Nginx 部署（推荐）

创建 Nginx 配置文件 `/etc/nginx/sites-available/banana-batch`：

```nginx
server {
    listen 80;
    server_name www.vince123.xyz vince123.xyz;

    root /home/ywt/banana-batch/dist;
    index index.html;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/banana-batch /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. 使用 Vite Preview（临时方案）

如果不想配置 Nginx，可以使用 Vite 的预览模式：

```bash
npm run build
npm run preview
```

预览模式会在 `http://0.0.0.0:3000` 启动一个静态文件服务器。

## 开发环境部署

如果需要在公网访问开发服务器（不推荐用于生产）：

```bash
npm run dev
```

**注意**：开发服务器可能会出现 `ERR_CONTENT_LENGTH_MISMATCH` 错误，这是正常的。如果遇到此错误：

1. 刷新页面（Ctrl+F5 强制刷新）
2. 清除浏览器缓存
3. 使用生产构建（推荐）

## 环境变量配置

**重要安全提示**：此应用是客户端应用，API Key 需要用户在应用内手动输入。

**不要**在 `.env` 文件中设置 `GEMINI_API_KEY`，因为：
1. 环境变量会被注入到构建后的前端代码中
2. 任何人都可以通过查看浏览器源代码看到 API Key
3. 这会带来严重的安全风险

**正确的做法**：
- 用户在应用内通过设置面板手动输入 API Key
- API Key 只存储在浏览器的 localStorage 中，不会出现在源代码中
- 或者使用后端代理，API Key 只存在于服务器端

## 自动部署脚本

创建 `deploy.sh`：

```bash
#!/bin/bash
cd /home/ywt/banana-batch
npm run build
sudo systemctl reload nginx
echo "部署完成！"
```

使脚本可执行：

```bash
chmod +x deploy.sh
```

## 故障排除

### ERR_CONTENT_LENGTH_MISMATCH

这个错误通常出现在开发服务器中。解决方案：

1. **使用生产构建**（推荐）：
   ```bash
   npm run build
   npm run preview
   ```

2. **清除浏览器缓存**：按 Ctrl+Shift+Delete 清除缓存

3. **强制刷新**：按 Ctrl+F5

### 端口被占用

如果 3000 端口被占用：

```bash
# 查找占用端口的进程
lsof -i :3000

# 或者修改 vite.config.ts 中的端口号
```

### API Key 未设置

确保：
1. 在应用设置中配置了 API Key，或
2. 设置了环境变量 `GEMINI_API_KEY`

