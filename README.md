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
├── deploy.example.sh             # 自动化构建与部署脚本模板
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

## 构建与安装

### 1. 构建插件
要求环境：[.NET 9.0 SDK](https://dotnet.microsoft.com/download/dotnet/9.0)

```bash
dotnet build -c Release
```

编译产物位于 `Jellyfin.Plugin.Shorts/bin/Release/net9.0/Jellyfin.Plugin.Shorts.dll`。

### 2. 安装插件
1. 在 Jellyfin 配置目录中的 `plugins` 文件夹下创建 `Shorts` 目录（例如 `/config/plugins/Shorts`）；
2. 将编译好的 `Jellyfin.Plugin.Shorts.dll` 以及 `meta.json` 复制到该目录下；
3. 重启 Jellyfin 服务容器；
4. 进入 Jellyfin 控制台「控制台 -> 插件」，即可看到 Shorts 插件已激活并可配置默认行为。

### 3. Web 端注入（可选）
如果希望在 Jellyfin 官方网页端的媒体库界面中直接显示「刷短视频」按钮，可将 `Jellyfin.Plugin.Shorts/Web/shorts-inject.js` 引入 Jellyfin Web：
- 在 Jellyfin Web 的 `index.html` 结尾 `</body>` 前加入：
  ```html
  <script defer="defer" src="/Shorts/web/shorts-inject.js"></script>
  ```
- 或者直接访问独立页面体验：`http://<your-jellyfin-host>:8096/Shorts/app`。
