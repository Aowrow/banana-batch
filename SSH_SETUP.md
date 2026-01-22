# SSH 密钥配置指南

## ✅ SSH 密钥已生成

你的 SSH 公钥是：
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC/tGdRrU5wvz/ktQ+Uw4cBN1CjO0cSLk62LApIcS3M9 github-key
```

## 📝 添加到 GitHub 的步骤

### 方法一：通过网页添加（推荐）

1. **复制上面的公钥**（整行，包括 `ssh-ed25519` 开头）

2. **访问 GitHub SSH 设置页面**
   - 打开：https://github.com/settings/keys
   - 或：GitHub → Settings → SSH and GPG keys → New SSH key

3. **添加密钥**
   - 点击 "New SSH key" 按钮
   - Title：填写一个描述（如 "VM-16-14-ubuntu"）
   - Key：粘贴上面复制的公钥
   - 点击 "Add SSH key"

4. **测试连接**
   ```bash
   ssh -T git@github.com
   ```
   如果看到 "Hi hezi-ywt! You've successfully authenticated..." 就成功了！

5. **推送代码**
   ```bash
   cd /home/ywt/banana-batch
   git push
   ```

### 方法二：使用命令行添加（需要 GitHub CLI）

```bash
# 安装 GitHub CLI（如果未安装）
# Ubuntu/Debian:
sudo apt install gh

# 登录并添加密钥
gh auth login
gh ssh-key add ~/.ssh/id_ed25519.pub --title "VM-16-14-ubuntu"
```

## 🔄 或者：回退到 HTTPS 方式

如果不想配置 SSH，可以改回 HTTPS：

```bash
cd /home/ywt/banana-batch
git remote set-url origin https://github.com/hezi-ywt/banana-batch.git

# 配置 Git 使用更大的缓冲区（解决 TLS 问题）
git config http.postBuffer 524288000
git config http.version HTTP/1.1

# 然后推送（会提示输入用户名和密码/Token）
git push
```

**注意**：如果使用 HTTPS，GitHub 现在要求使用 Personal Access Token 而不是密码。

## 🚀 快速命令

**查看公钥：**
```bash
cat ~/.ssh/id_ed25519.pub
```

**测试 SSH 连接：**
```bash
ssh -T git@github.com
```

**如果测试成功，推送代码：**
```bash
cd /home/ywt/banana-batch
git push
```

