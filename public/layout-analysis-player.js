const videoId = new URLSearchParams(location.search).get('videoId');
if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) {
  document.getElementById('guide').textContent = '올바른 영상 링크로 다시 열어 주세요.';
} else {
  document.title = `IIDX 영상 공유 · ${videoId}`;
  const player = document.createElement('iframe');
  player.title = 'YouTube IIDX 영상';
  player.src = `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&autoplay=1`;
  player.allow = 'autoplay; encrypted-media; picture-in-picture';
  player.allowFullscreen = true;
  document.getElementById('frame').append(player);
}
