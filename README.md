# Jellyfin Shorts Plugin

Jellyfin 类抖音短视频（Shorts）垂直切片信息流播放插件。

## 特性

- **服务端高效查询**：直接注入 `ILibraryManager` 查询 Jellyfin 内部媒体库索引，无需重新扫描文件。
- **全屏仿抖音手势流**：手机触屏上下滑动换视频、桌面端滚轮/键盘方向键上下切换、双击点赞动画、单击暂停/播放。
- **直连高速流媒体**：短视频直接走 HTML5 原生 Range 直连播放，毫秒级起播零转码延迟。
- **内置独立 Web 页面与 Jellyfin Web 无缝注入**：
  - 访问 `/Shorts/app` 即可作为独立 Web App / PWA 播放；
  - 访问 Jellyfin 官方网页版，在文件夹内自动注入「▶ 刷短视频」按钮，右下角提供快捷入口。
- **安全鉴权**：继承 Jellyfin Token 与当前用户权限边界。

## 目录结构

```
jellyfin-Shorts/
├── deploy.sh                     # 一键构建与远端部署脚本
├── Jellyfin.Plugin.Shorts/
│   ├── Jellyfin.Plugin.Shorts.csproj
│   ├── Plugin.cs                 # 插件入口与生命周期
│   ├── PluginServiceRegistrator.cs # 服务注入注册
│   ├── Configuration/
│   │   └── ShortsConfiguration.cs# 插件配置模型
│   ├── Controllers/
│   │   └── ShortsController.cs   # API 控制器与静态文件服务
│   ├── Services/
│   │   └── ShortsFeedService.cs  # 媒体库查询与随机切片业务
│   ├── Models/
│   │   └── ShortVideoDto.cs      # 数据传输模型
│   ├── Web/
│   │   ├── shorts.html           # 全屏短视频播放器外壳
│   │   ├── shorts.css            # 播放器样式与动效
│   │   ├── shorts.js             # 触摸手势、预载与播放控制
│   │   ├── shorts-inject.js      # Jellyfin Web 页面无缝注入脚本
│   │   └── configPage.html       # 插件管理后台设置页
│   └── meta.json                 # 插件描述元数据
```

## 构建与部署

```bash
# 一键编译并同步至 your-server-ip
./deploy.sh
```
