# Git Push TLS 错误解决方案

## 错误信息
```
fatal: unable to access 'https://github.com/hezi-ywt/banana-batch/': gnutls_handshake() failed: The TLS connection was non-properly terminated.
```

## 解决方案

### 方案 1：增加 Git 缓冲区大小（推荐）

```bash
cd /home/ywt/banana-batch
git config http.postBuffer 524288000
git config http.lowSpeedLimit 0
git config http.lowSpeedTime 999999
git push
```

### 方案 2：使用 SSH 代替 HTTPS

**步骤：**

1. **检查是否已有 SSH 密钥**
   ```bash
   ls -la ~/.ssh/id_rsa.pub
   ```

2. **如果没有，生成 SSH 密钥**
   ```bash
   ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
   # 按 Enter 使用默认路径，可以设置密码或留空
   ```

3. **复制公钥**
   ```bash
   cat ~/.ssh/id_rsa.pub
   ```

4. **添加到 GitHub**
   - 访问：https://github.com/settings/keys
   - 点击 "New SSH key"
   - 粘贴公钥内容
   - 保存

5. **更改远程仓库地址为 SSH**
   ```bash
   cd /home/ywt/banana-batch
   git remote set-url origin git@github.com:hezi-ywt/banana-batch.git
   git push
   ```

### 方案 3：配置 Git 使用更宽松的 SSL 验证（临时方案）

⚠️ **注意：这会降低安全性，仅用于临时解决网络问题**

```bash
cd /home/ywt/banana-batch
git config http.sslVerify false
git push
# 完成后建议恢复
git config http.sslVerify true
```

### 方案 4：使用代理（如果在中国大陆）

如果你在中国大陆，可能需要配置代理：

```bash
# 设置 HTTP 代理（根据你的代理地址修改）
git config --global http.proxy http://proxy.example.com:8080
git config --global https.proxy https://proxy.example.com:8080

# 或者使用 SOCKS5 代理
git config --global http.proxy socks5://127.0.0.1:1080
git config --global https.proxy socks5://127.0.0.1:1080

# 取消代理
git config --global --unset http.proxy
git config --global --unset https.proxy
```

### 方案 5：重试多次（网络不稳定时）

```bash
cd /home/ywt/banana-batch
# 重试多次，网络不稳定时可能成功
for i in {1..5}; do
    echo "尝试第 $i 次..."
    git push && break || sleep 5
done
```

### 方案 6：检查网络连接

```bash
# 测试 GitHub 连接
ping github.com
curl -I https://github.com

# 如果无法连接，检查 DNS
nslookup github.com
```

## 推荐方案

**最佳实践：使用 SSH 方式（方案 2）**
- ✅ 更安全
- ✅ 更稳定
- ✅ 不需要每次输入密码（如果配置了 SSH 密钥）

## 快速修复命令

如果只是想快速推送，可以尝试：

```bash
cd /home/ywt/banana-batch
git config http.postBuffer 524288000
git config http.version HTTP/1.1
git push
```

