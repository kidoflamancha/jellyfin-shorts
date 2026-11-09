using System;

namespace Jellyfin.Plugin.Shorts.Models;

public class ShortVideoDto
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Overview { get; set; }

    public long? RunTimeTicks { get; set; }

    public double DurationSeconds { get; set; }

    public int? Width { get; set; }

    public int? Height { get; set; }

    public string? AspectRatio { get; set; }

    public string? Container { get; set; }

    public string? VideoCodec { get; set; }

    public string? AudioCodec { get; set; }

    public Guid? ParentId { get; set; }

    public string? ParentName { get; set; }

    public DateTime? DateCreated { get; set; }

    public bool HasSubtitles { get; set; }
}

public class ShortVideoFeedResult
{
    public int TotalRecordCount { get; set; }

    public int StartIndex { get; set; }

    public ShortVideoDto[] Items { get; set; } = Array.Empty<ShortVideoDto>();
}
