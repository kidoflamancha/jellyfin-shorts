using System;
using System.Collections.Generic;
using System.Linq;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.Shorts.Configuration;
using Jellyfin.Plugin.Shorts.Models;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Shorts.Services;

public class ShortsFeedService
{
    private readonly ILibraryManager _libraryManager;
    private readonly ILogger<ShortsFeedService> _logger;

    public ShortsFeedService(
        ILibraryManager libraryManager,
        ILogger<ShortsFeedService> logger)
    {
        _libraryManager = libraryManager;
        _logger = logger;
    }

    public ShortVideoFeedResult GetFeed(
        User? user,
        Guid? folderId,
        bool? recursive,
        int? limit,
        int? startIndex,
        bool? random,
        int? maxDurationMinutes)
    {
        var config = Plugin.Instance?.Configuration ?? new ShortsConfiguration();

        bool isRecursive = recursive ?? config.Recursive;
        int takeCount = Math.Clamp(limit ?? config.DefaultLimit, 1, 100);
        int skipIndex = Math.Max(startIndex ?? 0, 0);
        int durationLimit = maxDurationMinutes ?? config.MaxDurationMinutes;
        bool isRandom = random ?? config.EnableRandomFeedByDefault;

        var query = new InternalItemsQuery(user)
        {
            Recursive = isRecursive,
            IsFolder = false,
            MediaTypes = new[] { MediaType.Video }
        };

        if (folderId.HasValue && folderId.Value != Guid.Empty)
        {
            var targetItem = _libraryManager.GetItemById(folderId.Value);
            if (targetItem != null && !targetItem.IsFolder && targetItem.ParentId != Guid.Empty)
            {
                // Target is a single video; use its parent folder instead
                query.ParentId = targetItem.ParentId;
            }
            else
            {
                query.ParentId = folderId.Value;
            }
        }

        // Fetch candidate videos
        var items = _libraryManager.GetItemList(query);

        // Filter by duration if configured
        IEnumerable<BaseItem> filtered = items;
        if (durationLimit > 0)
        {
            long maxTicks = TimeSpan.FromMinutes(durationLimit).Ticks;
            filtered = filtered.Where(i => !i.RunTimeTicks.HasValue || i.RunTimeTicks.Value <= maxTicks);
        }

        // Exclude items that are trailers or extras if desired, or keep all playable videos
        var list = filtered.ToList();
        int totalCount = list.Count;

        if (isRandom)
        {
            // Fisher-Yates shuffle
            var rng = Random.Shared;
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                (list[i], list[j]) = (list[j], list[i]);
            }
        }

        var pagedItems = list.Skip(skipIndex).Take(takeCount).ToList();

        var dtoList = pagedItems.Select(item =>
        {
            var mediaStreams = item.GetMediaStreams();
            var videoStream = mediaStreams.FirstOrDefault(s => s.Type == MediaStreamType.Video);
            var audioStream = mediaStreams.FirstOrDefault(s => s.Type == MediaStreamType.Audio);
            bool hasSubs = mediaStreams.Any(s => s.Type == MediaStreamType.Subtitle);

            double durationSeconds = item.RunTimeTicks.HasValue
                ? TimeSpan.FromTicks(item.RunTimeTicks.Value).TotalSeconds
                : 0;

            int? width = item.Width != 0 ? item.Width : videoStream?.Width;
            int? height = item.Height != 0 ? item.Height : videoStream?.Height;
            string? aspectRatio = videoStream?.AspectRatio;
            string? parentName = item.GetParent()?.Name ?? (item.ParentId != Guid.Empty ? _libraryManager.GetItemById(item.ParentId)?.Name : null);

            return new ShortVideoDto
            {
                Id = item.Id,
                Name = item.Name,
                Overview = item.Overview,
                RunTimeTicks = item.RunTimeTicks,
                DurationSeconds = durationSeconds,
                Width = width,
                Height = height,
                AspectRatio = aspectRatio,
                Container = item.Container,
                VideoCodec = videoStream?.Codec,
                AudioCodec = audioStream?.Codec,
                ParentId = item.ParentId,
                ParentName = parentName,
                DateCreated = item.DateCreated,
                HasSubtitles = hasSubs
            };
        }).ToArray();

        return new ShortVideoFeedResult
        {
            TotalRecordCount = totalCount,
            StartIndex = skipIndex,
            Items = dtoList
        };
    }
}
