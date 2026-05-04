(() => {
    const mediaUrls = new Set();
    
    // Helper to get absolute URL
    const getAbsoluteUrl = (url) => {
        try {
            return new URL(url, document.baseURI).href;
        } catch (e) {
            return null;
        }
    };

    // 1. Find all Images and parse srcset for high-res
    const images = document.querySelectorAll('img');
    images.forEach(img => {
        let bestUrl = img.getAttribute('src');
        
        // Check for srcset to get highest quality
        const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
        if (srcset) {
            const sources = srcset.split(',').map(s => {
                const parts = s.trim().split(/\s+/);
                return {
                    url: parts[0],
                    size: parts.length > 1 ? parseInt(parts[1], 10) : 0
                };
            });
            // Sort by size descending
            sources.sort((a, b) => b.size - a.size);
            if (sources.length > 0 && sources[0].url) {
                bestUrl = sources[0].url;
            }
        }
        
        // Fallbacks for lazy-loaded images
        if (!bestUrl || bestUrl.startsWith('data:')) {
            bestUrl = img.getAttribute('data-src') || img.getAttribute('data-original') || bestUrl;
        }

        if (bestUrl) {
            if (bestUrl.startsWith('data:')) {
                // Keep data URLs, but ignore tiny ones (might be tracking pixels)
                if (bestUrl.length > 1000) {
                    mediaUrls.add(bestUrl);
                }
            } else {
                const absUrl = getAbsoluteUrl(bestUrl);
                if (absUrl) mediaUrls.add(absUrl);
            }
        }
    });

    // 2. Find Videos
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
        const src = video.getAttribute('src');
        if (src) {
            const absUrl = getAbsoluteUrl(src);
            if (absUrl && !absUrl.startsWith('blob:')) mediaUrls.add(absUrl);
        }
        
        // Check source tags inside video
        const sources = video.querySelectorAll('source');
        sources.forEach(source => {
            const sourceSrc = source.getAttribute('src');
            if (sourceSrc) {
                const absUrl = getAbsoluteUrl(sourceSrc);
                if (absUrl && !absUrl.startsWith('blob:')) mediaUrls.add(absUrl);
            }
        });
    });

    // 3. Find Audio
    const audios = document.querySelectorAll('audio');
    audios.forEach(audio => {
        const src = audio.getAttribute('src');
        if (src) {
            const absUrl = getAbsoluteUrl(src);
            if (absUrl && !absUrl.startsWith('blob:')) mediaUrls.add(absUrl);
        }
        
        const sources = audio.querySelectorAll('source');
        sources.forEach(source => {
            const sourceSrc = source.getAttribute('src');
            if (sourceSrc) {
                const absUrl = getAbsoluteUrl(sourceSrc);
                if (absUrl && !absUrl.startsWith('blob:')) mediaUrls.add(absUrl);
            }
        });
    });

    // 4. Background images on generic divs (optional but good for high qual media)
    const allElems = document.querySelectorAll('*');
    allElems.forEach(el => {
        const bgImg = window.getComputedStyle(el).getPropertyValue('background-image');
        if (bgImg && bgImg !== 'none') {
            // format is usually url("http...")
            const match = bgImg.match(/url\(['"]?(.*?)['"]?\)/);
            if (match && match[1]) {
                const bestUrl = match[1];
                if (bestUrl.startsWith('data:')) {
                    if (bestUrl.length > 1000) mediaUrls.add(bestUrl);
                } else {
                    const absUrl = getAbsoluteUrl(bestUrl);
                    if (absUrl) mediaUrls.add(absUrl);
                }
            }
        }
    });

    return Array.from(mediaUrls);
})();
