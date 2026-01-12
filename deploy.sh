#!/bin/bash

# Banana Batch 部署脚本
# 用途：构建项目并部署到生产环境

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量（根据实际情况修改）
PROJECT_DIR="/home/ywt/banana-batch"
DIST_DIR="$PROJECT_DIR/dist"
NGINX_CONFIG="/etc/nginx/sites-available/banana-batch"
NGINX_ENABLED="/etc/nginx/sites-enabled/banana-batch"
BACKUP_DIR="$PROJECT_DIR/backups"

# 函数：打印信息
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 函数：检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        error "$1 未安装，请先安装"
        exit 1
    fi
}

# 函数：备份当前构建
backup_current_build() {
    if [ -d "$DIST_DIR" ]; then
        info "备份当前构建..."
        BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        cp -r "$DIST_DIR" "$BACKUP_DIR/$BACKUP_NAME"
        info "备份完成: $BACKUP_DIR/$BACKUP_NAME"
        
        # 只保留最近 5 个备份
        ls -t "$BACKUP_DIR" | tail -n +6 | xargs -r rm -rf
    fi
}

# 函数：构建项目
build_project() {
    info "开始构建项目..."
    cd "$PROJECT_DIR"
    
    # 检查 node_modules 是否存在
    if [ ! -d "node_modules" ]; then
        warn "node_modules 不存在，正在安装依赖..."
        npm install
    fi
    
    # 执行构建
    npm run build
    
    if [ ! -d "$DIST_DIR" ]; then
        error "构建失败：dist 目录不存在"
        exit 1
    fi
    
    info "构建完成！"
}

# 函数：创建 Nginx 配置
create_nginx_config() {
    info "创建 Nginx 配置文件..."
    
    sudo tee "$NGINX_CONFIG" > /dev/null <<EOF
server {
    listen 80;
    server_name www.vince123.xyz vince123.xyz;

    root $DIST_DIR;
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
        try_files \$uri \$uri/ /index.html;
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
EOF
    
    # 创建符号链接
    if [ ! -L "$NGINX_ENABLED" ]; then
        sudo ln -s "$NGINX_CONFIG" "$NGINX_ENABLED"
        info "已创建 Nginx 配置符号链接"
    fi
    
    info "Nginx 配置文件已创建: $NGINX_CONFIG"
}

# 函数：检查 Nginx 配置
check_nginx_config() {
    if [ ! -f "$NGINX_CONFIG" ]; then
        warn "Nginx 配置文件不存在: $NGINX_CONFIG"
        read -p "是否自动创建 Nginx 配置文件？(y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            create_nginx_config
        else
            warn "跳过 Nginx 配置，将使用 Vite Preview 模式"
            return 1
        fi
    fi
    
    info "检查 Nginx 配置..."
    if sudo nginx -t 2>&1 | grep -q "successful"; then
        info "Nginx 配置检查通过"
        return 0
    else
        error "Nginx 配置有误，请检查"
        sudo nginx -t
        return 1
    fi
}

# 函数：重新加载 Nginx
reload_nginx() {
    if [ -f "$NGINX_CONFIG" ]; then
        info "重新加载 Nginx..."
        sudo systemctl reload nginx
        info "Nginx 已重新加载"
    fi
}

# 函数：使用 Vite Preview（开发/测试）
start_preview() {
    info "启动 Vite Preview 服务器..."
    cd "$PROJECT_DIR"
    
    # 检查是否已有进程在运行
    if pgrep -f "vite preview" > /dev/null; then
        warn "Vite Preview 已在运行，正在停止..."
        pkill -f "vite preview"
        sleep 2
    fi
    
    # 启动预览服务器（后台运行）
    nohup npm run preview > /dev/null 2>&1 &
    info "Vite Preview 已启动（后台运行）"
    info "访问地址: http://$(hostname -I | awk '{print $1}'):3000"
}

# 函数：显示使用帮助
show_help() {
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  build          仅构建项目（不部署）"
    echo "  deploy         构建并部署（默认）"
    echo "  preview        构建并启动 Vite Preview 服务器"
    echo "  nginx-reload   仅重新加载 Nginx 配置"
    echo "  clean          清理构建文件和备份"
    echo "  help           显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0              # 构建并部署"
    echo "  $0 build        # 仅构建"
    echo "  $0 preview      # 构建并启动预览服务器"
}

# 函数：清理
clean() {
    info "清理构建文件和备份..."
    read -p "确定要删除 dist 目录和备份吗？(y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$DIST_DIR"
        rm -rf "$BACKUP_DIR"
        info "清理完成"
    else
        info "已取消清理"
    fi
}

# 主函数
main() {
    info "=== Banana Batch 部署脚本 ==="
    
    # 检查必要的命令
    check_command npm
    check_command node
    
    # 解析参数
    case "${1:-deploy}" in
        build)
            backup_current_build
            build_project
            info "构建完成！"
            ;;
        deploy)
            backup_current_build
            build_project
            if check_nginx_config; then
                reload_nginx
                info "部署完成！使用 Nginx 服务"
            else
                warn "未配置 Nginx，可以使用 'preview' 模式启动预览服务器"
            fi
            ;;
        preview)
            backup_current_build
            build_project
            start_preview
            ;;
        nginx-setup)
            create_nginx_config
            check_nginx_config
            ;;
        nginx-reload)
            if check_nginx_config; then
                reload_nginx
            fi
            ;;
        clean)
            clean
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"

