// Listen for token changes and notify all tabs
chrome.storage.onChanged.addListener((changes) => {
    if (changes.githubToken) {
        chrome.tabs.query({url: "*://*.github.com/*/pull/*"}, (tabs) => {
            tabs.forEach(tab => {
                if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, { action: 'tokenChanged' });
                }
            });
        });
    }
});

// Listen for open options message
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'openOptions') {
        chrome.runtime.openOptionsPage();
    }
});