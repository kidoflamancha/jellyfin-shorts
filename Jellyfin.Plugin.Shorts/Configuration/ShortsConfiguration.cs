using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Shorts.Configuration;

public class ShortsConfiguration : BasePluginConfiguration
{
    public ShortsConfiguration()
    {
        Recursive = true;
        DefaultLimit = 30;
        MaxDurationMinutes = 15;
        EnableRandomFeedByDefault = true;
        AutoAdvance = false;
    }

    /// <summary>
    /// Gets or sets a value indicating whether child folders should be searched recursively.
    /// </summary>
    public bool Recursive { get; set; }

    /// <summary>
    /// Gets or sets the default number of videos returned per feed batch.
    /// </summary>
    public int DefaultLimit { get; set; }

    /// <summary>
    /// Gets or sets the maximum video duration in minutes to be considered a short video (0 = no limit).
    /// </summary>
    public int MaxDurationMinutes { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether random order is enabled by default.
    /// </summary>
    public bool EnableRandomFeedByDefault { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether videos should automatically advance to the next upon completion.
    /// </summary>
    public bool AutoAdvance { get; set; }
}
