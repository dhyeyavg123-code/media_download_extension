document.addEventListener('DOMContentLoaded', async () => {
    const downloadDefaultBtn = document.getElementById('downloadDefaultBtn');
    const downloadCustomBtn = document.getElementById('downloadCustomBtn');
    const printBtn = document.getElementById('printBtn');
    const stopBtn = document.getElementById('stopBtn');
    const statusText = document.getElementById('status');
    const statusDot = document.getElementById('statusDot');
    const mediaCountElem = document.getElementById('mediaCount');

    let isAborted = false;
    let globalAbortController = null;
    let pendingDownloadIds = [];

    const updateStatus = (text, dotClass = '') => {
        statusText.textContent = text;
        statusDot.className = 'dot ' + dotClass;
    };

    const toggleUI = (isExtracting) => {
        document.getElementById('actionContainer').classList.toggle('hidden', isExtracting);
        stopBtn.classList.toggle('hidden', !isExtracting);
    };

    stopBtn.addEventListener('click', () => {
        isAborted = true;
        if (globalAbortController) {
            globalAbortController.abort();
        }
        pendingDownloadIds.forEach(id => {
            chrome.downloads.cancel(id);
        });
        pendingDownloadIds = [];
        
        updateStatus("Aborted by user", "error");
        toggleUI(false);
    });

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
        updateStatus("Invalid page", "error");
        return;
    }

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
    }, (injectionResults) => {
        if (chrome.runtime.lastError) {
            updateStatus("Access denied", "error");
            return;
        }

        if (!injectionResults || !injectionResults[0]) {
            updateStatus("Script failed", "error");
            return;
        }

        const mediaUrls = injectionResults[0].result;
        if (!mediaUrls || mediaUrls.length === 0) {
            mediaCountElem.textContent = "0";
            updateStatus("No media found", "error");
        } else {
            mediaCountElem.textContent = mediaUrls.length;
            updateStatus("Ready", "ready");
            downloadDefaultBtn.disabled = false;
            downloadCustomBtn.disabled = false;
        }

        // --- OPTION A: Default Downloads Folder ---
        downloadDefaultBtn.addEventListener('click', () => {
            isAborted = false;
            pendingDownloadIds = [];
            toggleUI(true);
            updateStatus("Extracting...", "active");

            let count = 0;
            mediaUrls.forEach((url, index) => {
                setTimeout(() => {
                    if (isAborted) return;
                    chrome.downloads.download({
                        url: url,
                        conflictAction: "uniquify",
                        saveAs: false
                    }, (downloadId) => {
                        if (isAborted) {
                            if (downloadId) chrome.downloads.cancel(downloadId);
                            return;
                        }
                        if (chrome.runtime.lastError) {
                            console.error('Download failed', url, chrome.runtime.lastError);
                        } else {
                            pendingDownloadIds.push(downloadId);
                            count++;
                            updateStatus(`Saving ${count}/${mediaUrls.length}`, "active");
                        }
                        
                        if (index === mediaUrls.length - 1) {
                            setTimeout(() => {
                                if (!isAborted) {
                                    updateStatus("Completed", "ready");
                                    toggleUI(false);
                                }
                            }, 1000); // UI buffer
                        }
                    });
                }, index * 200); // limit rapid-fire rate
            });
        });

        // --- OPTION B: Custom Anywhere Folder ---
        downloadCustomBtn.addEventListener('click', async () => {
            try {
                const dirHandle = await window.showDirectoryPicker({
                    mode: 'readwrite',
                    id: 'media_downloader',
                    startIn: 'downloads'
                });
                
                isAborted = false;
                globalAbortController = new AbortController();
                toggleUI(true);
                updateStatus("Extracting...", "active");

                let count = 0;
                let errors = 0;

                const getFilename = (url, index) => {
                    try {
                        let name = new URL(url).pathname.split('/').pop();
                        name = decodeURIComponent(name).replace(/[/\\?%*:|"<>]/g, '-');
                        if (!name || name.trim() === '') name = `media_${index}`;
                        if (!name.includes('.')) {
                            name += url.includes('video') ? '.mp4' : '.jpg';
                        }
                        return name;
                    } catch {
                        return `media_${index}.jpg`;
                    }
                };

                for (let i = 0; i < mediaUrls.length; i++) {
                    if (isAborted) break;
                    
                    const url = mediaUrls[i];
                    try {
                        let filename = getFilename(url, i);
                        if (filename === 'image.jpg' || filename === 'video.mp4') filename = `${i}_${filename}`;

                        const response = await fetch(url, { signal: globalAbortController.signal });
                        if (!response.ok) throw new Error("Network error");
                        const blob = await response.blob();
                        
                        if (isAborted) break;

                        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                        
                        count++;
                        updateStatus(`Saving ${count}/${mediaUrls.length}`, "active");
                    } catch (err) {
                        if (err.name === 'AbortError') break;
                        console.error('Failed to download:', url, err);
                        errors++;
                    }
                }
                
                if (!isAborted) {
                    if (errors > 0) updateStatus(`Done! ${errors} failed.`, "error");
                    else updateStatus("Completed", "ready");
                    toggleUI(false);
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error(err);
                    updateStatus("System error", "error");
                    toggleUI(false);
                }
            }
        });

        // --- PRINT MODULE ---
        printBtn.addEventListener('click', () => {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => window.print()
            });
        });
    });
});
