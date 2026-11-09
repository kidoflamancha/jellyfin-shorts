using System;
using System.Collections.Generic;
using Jellyfin.Plugin.Shorts.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.Shorts;

public sealed class Plugin : BasePlugin<ShortsConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public override string Name => "Shorts";

    public override string Description => "TikTok-style vertical short video player feed for Jellyfin.";

    public override Guid Id => Guid.Parse("5f8f478c-3b27-48b9-b2ed-d56d629b4d2d");

    public static Plugin? Instance { get; private set; }

    public IEnumerable<PluginPageInfo> GetPages()
    {
        yield return new PluginPageInfo
        {
            Name = "Shorts",
            EmbeddedResourcePath = $"{GetType().Namespace}.Web.configPage.html",
            EnableInMainMenu = false
        };
    }
}
