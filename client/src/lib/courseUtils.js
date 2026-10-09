export function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [/(?:v=)([^&\s]{11})/, /youtu\.be\/([^?\s]{11})/, /embed\/([^?\s]{11})/, /shorts\/([^?\s]{11})/];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
}

export function extractVimeoId(url) {
  if (!url) return null;
  const patterns = [/vimeo\.com\/(\d+)/, /vimeo\.com\/video\/(\d+)/, /player\.vimeo\.com\/video\/(\d+)/, /vimeo\.com\/channels\/[^/]+\/(\d+)/, /vimeo\.com\/groups\/[^/]+\/videos\/(\d+)/];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
}

export function parseVideoUrl(url) {
  if (!url) return null;
  const ytId = extractYouTubeId(url);
  if (ytId) return { type: 'youtube', id: ytId };
  const vmId = extractVimeoId(url);
  if (vmId) return { type: 'vimeo', id: vmId };
  return null;
}

export function getCleanEmbedUrl(videoId, videoType = 'youtube') {
  if (!videoId) return '';
  if (videoType === 'vimeo') return `https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0&badge=0&autopause=0&autoplay=1&color=6d28d9`;
  return `https://www.youtube-nocookie.com/embed/${videoId}?modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&cc_load_policy=0&disablekb=0&fs=1&color=white&autoplay=1`;
}

export function getVideoThumbnail(videoId, videoType = 'youtube') {
  if (!videoId) return null;
  if (videoType === 'vimeo') return `https://vumbnail.com/${videoId}.jpg`;
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function getYouTubeThumbnail(videoId) {
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
}
