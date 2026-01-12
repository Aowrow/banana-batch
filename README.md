<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 🍌 Banana Batch - AI 图片生成工具

一个强大的基于 Google Gemini AI 的图片生成工具，支持文字生成图片、图片参考生成、批量生成等功能。

## ✨ 主要特性

- 🎨 **文字生成图片** - 输入描述，AI 帮你画出来
- 🖼️ **图片参考生成** - 上传参考图，基于图片创作
- 📦 **批量生成** - 一次生成多张图片（最多 20 张）
- 💬 **对话式创作** - 多轮对话，逐步完善作品
- 🎯 **图片选择** - 选择喜欢的图片保留在上下文中
- 🔄 **重试功能** - 一键重新生成
- 🗑️ **删除消息** - 清理对话历史
- 🌓 **主题切换** - 支持浅色/深色主题

## 🚀 快速开始

### 前置要求

- **Node.js** 18+ 版本
- **npm** 或 **yarn** 或 **pnpm**
- **Gemini API Key**（从 [Google AI Studio](https://ai.google.dev/) 获取）

### 安装步骤

1. **安装依赖**
   ```bash
   npm install
   ```

2. **配置 API Key**
   
   创建 `.env.local` 文件（在项目根目录）：
   ```bash
   # 注意：不要在 .env 中设置 GEMINI_API_KEY
   # API Key 应该在应用内通过设置面板手动输入，避免暴露在前端代码中
   ```
   
   **推荐方式**：在应用内通过设置面板（右上角钥匙图标）手动输入 API Key。
   
   **安全说明**：
   - API Key 只存储在浏览器的 localStorage 中
   - 不会出现在构建后的源代码中
   - 避免 API Key 泄露的安全风险

3. **启动开发服务器**
   ```bash
   npm run dev
   ```

4. **访问应用**
   
   打开浏览器访问：`http://localhost:3000`

## 📚 文档

- **[用户指南](./USER_GUIDE.md)** - 详细的使用说明和技巧（推荐新手阅读）
- **[使用教程](./USAGE.md)** - 完整的技术文档和高级配置

## 🎯 快速使用

1. **配置 API Key**：点击右上角 🔑 图标，输入你的 Gemini API Key
2. **输入提示词**：在输入框中描述你想要生成的图片
3. **点击发送**：等待图片生成完成
4. **选择图片**：点击喜欢的图片标记为选中，保留在上下文中

## 💡 使用示例

### 文字生成
```
一只可爱的小猫坐在窗台上，阳光透过窗户洒在它身上
```

### 图片参考生成
1. 拖拽上传图片到输入框
2. 输入："将这张照片转换为卡通风格"

### 多图片组合
1. 上传 2 张图片
2. 输入："将图二中的角色替换成图一中的形象"

## 🔗 相关链接

- [Google AI Studio](https://ai.google.dev/) - 获取 API Key
- [Gemini API 文档](https://ai.google.dev/gemini-api/docs/image-generation) - API 参考文档

## 📝 许可证

本项目基于 MIT 许可证开源。
