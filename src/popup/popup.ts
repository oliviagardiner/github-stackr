document.addEventListener('DOMContentLoaded', async () => {
    const tokenInput = document.getElementById('github-token') as HTMLInputElement;
    const saveButton = document.getElementById('save-token') as HTMLButtonElement;
    const statusMessage = document.getElementById('status-message') as HTMLDivElement;

    // Load existing token if present
    chrome.storage.sync.get(['githubToken'], (result) => {
        if (result.githubToken) {
            // Show masked token for security
            tokenInput.value = '••••••••••••••••••••••••••';
            tokenInput.setAttribute('data-has-token', 'true');
        }
    });

    // Clear the field when clicked if it's a masked token
    tokenInput.addEventListener('focus', () => {
        if (tokenInput.getAttribute('data-has-token') === 'true') {
            tokenInput.value = '';
            tokenInput.removeAttribute('data-has-token');
        }
    });

    saveButton.addEventListener('click', async () => {
        const token = tokenInput.value.trim();

        if (!token) {
            showStatus('Please enter a valid GitHub token', false);
            return;
        }

        // Updated pattern to match all GitHub token formats
        // This accepts classic tokens (ghp_), fine-grained tokens (github_pat_) with any length
        if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
            showStatus('Invalid GitHub token format. Use a GitHub personal access token (ghp_) or fine-grained token (github_pat_)', false);
            return;
        }

        // Validate token with a simple test API call
        try {
            saveButton.disabled = true;
            saveButton.textContent = 'Validating...';

            // Try to validate with user endpoint first (full access tokens)
            let response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });

            // If that fails, try a public repo endpoint (for fine-grained tokens)
            if (!response.ok) {
                response = await fetch('https://api.github.com/repos/github/docs', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'X-GitHub-Api-Version': '2022-11-28'
                    }
                });
            }

            if (response.ok) {
                // Save token to chrome storage
                chrome.storage.sync.set({ githubToken: token }, () => {
                    showStatus('Token saved successfully!', true);
                    // Mask the token for security
                    tokenInput.value = '••••••••••••••••••••••••••';
                    tokenInput.setAttribute('data-has-token', 'true');
                });
            } else {
                showStatus(`Invalid token or insufficient permissions (${response.status})`, false);
            }
        } catch (error) {
            showStatus('Error validating token', false);
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Save Token';
        }
    });

    function showStatus(message: string, isSuccess: boolean) {
        statusMessage.textContent = message;
        statusMessage.className = 'status-message ' + (isSuccess ? 'success' : 'error');
        statusMessage.style.display = 'block';

        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    }
});