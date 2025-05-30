// import {BranchInfo, GitHubApiService} from '../services/github-api';

interface BranchInfo {
    name: string;
    sha: string;
    baseBranch?: string;
}

interface PrInfo {
    baseBranch: string;
    headBranch: string;
    isStackedPR: boolean;
    repoOwner: string;
    repoName: string;
    branchChain?: BranchInfo[];
}

class GitHubApiService {
    private token: string | null = null;
    private tokenListeners: Array<(hasToken: boolean) => void> = [];

    constructor() {
        this.loadToken();
        // Listen for storage changes
        chrome.storage.onChanged.addListener(this.handleStorageChange.bind(this));
    }

    private handleStorageChange(changes: {[key: string]: chrome.storage.StorageChange}): void {
        if (changes.githubToken) {
            this.token = changes.githubToken.newValue || null;
            this.notifyTokenListeners();
        }
    }

    private async loadToken(): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['githubToken'], (result) => {
                this.token = result.githubToken || null;
                this.notifyTokenListeners();
                resolve();
            });
        });
    }

    public onTokenChange(listener: (hasToken: boolean) => void): void {
        this.tokenListeners.push(listener);
        // Immediately notify with current state
        listener(!!this.token);
    }

    private notifyTokenListeners(): void {
        const hasToken = !!this.token;
        this.tokenListeners.forEach(listener => listener(hasToken));
    }

    private async fetchGitHubApi(endpoint: string): Promise<any> {
        if (!this.token) {
            await this.loadToken();
        }

        if (!this.token) {
            throw new Error('No GitHub token available');
        }

        const response = await fetch(`https://api.github.com${endpoint}`, {
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.statusText}`);
        }

        return response.json();
    }

    async getBranchInfo(owner: string, repo: string, branchName: string): Promise<BranchInfo> {
        const branchData = await this.fetchGitHubApi(`/repos/${owner}/${repo}/branches/${branchName}`);
        return {
            name: branchName,
            sha: branchData.commit.sha
        };
    }

    async getPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'all'): Promise<PrInfo[]> {
        const prs = await this.fetchGitHubApi(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=100`);

        return prs.map((pr: any) => ({
            number: pr.number,
            title: pr.title,
            baseBranch: pr.base.ref,
            headBranch: pr.head.ref,
            state: pr.state,
            url: pr.html_url
        }));
    }

    async buildBranchHierarchy(owner: string, repo: string, headBranch: string): Promise<BranchInfo[]> {
        const prs = await this.getPullRequests(owner, repo);
        const branchMap = new Map<string, string>();

        // Build mapping of head → base
        prs.forEach(pr => {
            branchMap.set(pr.headBranch, pr.baseBranch);
        });

        // Build branch chain
        const branchChain: BranchInfo[] = [];
        let currentBranch = headBranch;

        while (currentBranch) {
            const branchInfo = await this.getBranchInfo(owner, repo, currentBranch);
            const baseBranch = branchMap.get(currentBranch);

            branchInfo.baseBranch = baseBranch;
            branchChain.push(branchInfo);

            currentBranch = baseBranch || '';

            // Stop if we reach a main branch (main, master, develop)
            if (['main', 'master', 'develop'].includes(currentBranch.toLowerCase())) {
                const mainBranchInfo = await this.getBranchInfo(owner, repo, currentBranch);
                branchChain.push(mainBranchInfo);
                break;
            }
        }

        return branchChain;
    }

    async hasToken(): Promise<boolean> {
        await this.loadToken();
        return !!this.token;
    }
}

class PRStackVisualizer {
    private readonly MAIN_BRANCHES = ['main', 'master', 'develop', 'dev'];
    private observer: MutationObserver | null = null;
    private apiService: GitHubApiService;
    private hasGithubToken: boolean = false;

    constructor() {
        this.apiService = new GitHubApiService();
        this.init();
    }

    private async init(): Promise<void> {
        console.log('Initializing PR Stack Visualizer');

        // Check if token is available
        this.hasGithubToken = await this.apiService.hasToken();
        console.log('Initial token status:', this.hasGithubToken ? 'available' : 'not available');

        // Listen for token changes
        this.apiService.onTokenChange((hasToken: boolean) => {
            console.log('Token status changed:', hasToken ? 'available' : 'not available');
            this.hasGithubToken = hasToken;
            // Re-visualize when token changes
            this.visualizePR();
        });

        // Run immediately and add a few retries with delays to ensure the page has loaded
        this.visualizePR();
        // Add additional attempts with delays to catch slow-loading pages
        setTimeout(() => this.visualizePR(), 500);
        setTimeout(() => this.visualizePR(), 2000);

        // Set up observer for dynamic content changes
        this.setupObserver();
    }

    private setupObserver(): void {
        // Disconnect any existing observer
        if (this.observer) {
            this.observer.disconnect();
        }

        // Create a new observer
        this.observer = new MutationObserver((mutations) => {
            // Check if relevant parts of the DOM changed
            const shouldUpdate = mutations.some(mutation =>
                mutation.target.nodeType === Node.ELEMENT_NODE &&
                ((mutation.target as Element).closest('.js-timeline-container') ||
                    (mutation.target as Element).closest('.js-discussion'))
            );

            if (shouldUpdate) {
                this.visualizePR();
            }
        });

        // Start observing
        const targetNode = document.querySelector('.js-timeline-container') || document;
        if (targetNode) {
            this.observer.observe(targetNode, {
                childList: true,
                subtree: true,
                attributes: false
            });
        }
    }

    private inferMainBranch(baseBranch: string): string {
        // If the base branch is already a main branch, return it
        if (this.MAIN_BRANCHES.includes(baseBranch.toLowerCase())) {
            return baseBranch;
        }

        // Otherwise, return the default main branch
        return 'main';
    }

    // Add this method to fetch branch chain
    private async fetchBranchChain(prInfo: PrInfo): Promise<BranchInfo[]> {
        try {
            if (!this.hasGithubToken) {
                console.log('no github token')
                return [];
            }

            return await this.apiService.buildBranchHierarchy(
                prInfo.repoOwner,
                prInfo.repoName,
                prInfo.headBranch
            );
        } catch (error) {
            console.error('Error fetching branch chain:', error);
            return [];
        }
    }

    // Update createStackedMergeDiagram to use branch chain
    // private createStackedMergeDiagram(prInfo: PrInfo): string {
    //     if (prInfo.branchChain && prInfo.branchChain.length > 0) {
    //         // Use the actual branch chain when available
    //         const branchNodes = prInfo.branchChain.map((branch, index: number) => {
    //             const isMainBranch = this.MAIN_BRANCHES.includes(branch.name.toLowerCase());
    //             const isHead = branch.name === prInfo.headBranch;
    //             const isBase = branch.name === prInfo.baseBranch;
    //
    //             let nodeClass = 'branch-node';
    //             if (isMainBranch) nodeClass += ' main-branch';
    //             else if (isBase) nodeClass += ' base-branch';
    //             else if (isHead) nodeClass += ' head-branch';
    //
    //             let circleClass = 'branch-circle';
    //             if (isMainBranch) circleClass += ' main';
    //             else if (isBase || (!isHead && !isMainBranch)) circleClass += ' intermediate';
    //             else if (isHead) circleClass += ' feature';
    //
    //             const currentIndicator = isHead ?
    //                 `<div class="current-pr-indicator">Current PR</div>` : '';
    //
    //             return `
    //             <div class="${nodeClass}">
    //                 <div class="branch-connector"></div>
    //                 <div class="${circleClass}"></div>
    //                 <div class="branch-label">${branch.name}</div>
    //                 ${currentIndicator}
    //             </div>`;
    //         }).join('');
    //
    //         return `
    //         <div class="merge-diagram-container stacked">
    //             <div class="diagram-title">Branch Hierarchy</div>
    //             <div class="branch-flow">
    //                 <div class="connector-main"></div>
    //                 ${branchNodes}
    //             </div>
    //         </div>`;
    //     } else {
    //         // Fall back to the simple 3-node diagram
    //         const mainBranch = this.inferMainBranch(prInfo.baseBranch);
    //
    //         return `
    //         <div class="merge-diagram-container stacked">
    //             <div class="diagram-title">Branch Hierarchy</div>
    //             <div class="branch-flow">
    //                 <div class="connector-main"></div>
    //                 <div class="branch-node main-branch">
    //                     <div class="branch-connector"></div>
    //                     <div class="branch-circle main"></div>
    //                     <div class="branch-label">${mainBranch}</div>
    //                 </div>
    //                 <div class="branch-node base-branch">
    //                     <div class="branch-connector"></div>
    //                     <div class="branch-circle intermediate"></div>
    //                     <div class="branch-label">${prInfo.baseBranch}</div>
    //                 </div>
    //                 <div class="branch-node head-branch">
    //                     <div class="branch-connector"></div>
    //                     <div class="branch-circle feature"></div>
    //                     <div class="branch-label">${prInfo.headBranch}</div>
    //                     <div class="current-pr-indicator">Current PR</div>
    //                 </div>
    //             </div>
    //         </div>`;
    //     }
    // }

    private createStackedMergeDiagram(prInfo: PrInfo): string {
        if (prInfo.branchChain && prInfo.branchChain.length > 0) {
            // Reverse the branch chain to show main branch at the top
            // and the head branch at the bottom
            const reversedBranchChain = [...prInfo.branchChain].reverse();

            const branchNodes = reversedBranchChain.map((branch, index: number) => {
                const isMainBranch = this.MAIN_BRANCHES.includes(branch.name.toLowerCase());
                const isHead = branch.name === prInfo.headBranch;
                const isBase = branch.name === prInfo.baseBranch;

                let nodeClass = 'branch-node';
                if (isMainBranch) nodeClass += ' main-branch';
                else if (isBase) nodeClass += ' base-branch';
                else if (isHead) nodeClass += ' head-branch';

                let circleClass = 'branch-circle';
                if (isMainBranch) circleClass += ' main';
                else if (isBase || (!isHead && !isMainBranch)) circleClass += ' intermediate';
                else if (isHead) circleClass += ' feature';

                const currentIndicator = isHead ?
                    `<div class="current-pr-indicator">Current PR</div>` : '';

                // Using CSS variable for depth instead of inline style
                return `
            <div class="${nodeClass}" style="--depth: ${index};">
                <div class="branch-connector-vertical"></div>
                <div class="branch-connector"></div>
                <div class="${circleClass}"></div>
                <div class="branch-label">${branch.name}</div>
                ${currentIndicator}
            </div>`;
            }).join('');

            return `
        <div class="merge-diagram-container stacked">
            <div class="diagram-title">Branch Hierarchy</div>
            <div class="branch-flow">
                <div class="connector-main"></div>
                ${branchNodes}
            </div>
        </div>`;
        } else {
            // Fall back to the simple 3-node diagram
            const mainBranch = this.inferMainBranch(prInfo.baseBranch);

            return `
        <div class="merge-diagram-container stacked">
            <div class="diagram-title">Branch Hierarchy</div>
            <div class="branch-flow">
                <div class="connector-main"></div>
                <div class="branch-node main-branch" style="--depth: 0;">
                    <div class="branch-connector-vertical"></div>
                    <div class="branch-connector"></div>
                    <div class="branch-circle main"></div>
                    <div class="branch-label">${mainBranch}</div>
                </div>
                <div class="branch-node base-branch" style="--depth: 1;">
                    <div class="branch-connector-vertical"></div>
                    <div class="branch-connector"></div>
                    <div class="branch-circle intermediate"></div>
                    <div class="branch-label">${prInfo.baseBranch}</div>
                </div>
                <div class="branch-node head-branch" style="--depth: 2;">
                    <div class="branch-connector-vertical"></div>
                    <div class="branch-connector"></div>
                    <div class="branch-circle feature"></div>
                    <div class="branch-label">${prInfo.headBranch}</div>
                    <div class="current-pr-indicator">Current PR</div>
                </div>
            </div>
        </div>`;
        }
    }

    private getPRInfo(): PrInfo | null {
        try {
            // Extract the repository owner and name
            const pathParts = window.location.pathname.split('/');
            if (pathParts.length < 5 || pathParts[3] !== 'pull') {
                return null;
            }

            const repoOwner = pathParts[1];
            const repoName = pathParts[2];

            // Find branch information from the UI
            const branchInfoContainer = document.querySelector('.commit-ref.head-ref') as HTMLElement;
            if (!branchInfoContainer) {
                return null;
            }

            const headBranchElement = branchInfoContainer.querySelector('.css-truncate-target') as HTMLElement;
            if (!headBranchElement) {
                return null;
            }
            const headBranch = headBranchElement.textContent?.trim() || '';

            // Find the base branch
            const baseBranchContainer = document.querySelector('.commit-ref.base-ref') as HTMLElement;
            if (!baseBranchContainer) {
                return null;
            }

            const baseBranchElement = baseBranchContainer.querySelector('.css-truncate-target') as HTMLElement;
            if (!baseBranchElement) {
                return null;
            }
            const baseBranch = baseBranchElement.textContent?.trim() || '';

            // Determine if this is a stacked PR
            const isMainBranch = this.MAIN_BRANCHES.includes(baseBranch.toLowerCase());
            const isStackedPR = !isMainBranch;

            return {
                baseBranch,
                headBranch,
                isStackedPR,
                repoOwner,
                repoName
            };
        } catch (error) {
            console.error('Error getting PR info:', error);
            return null;
        }
    }

    // private findInsertionPoint(): Element | null {
    //     // Try to find the PR description area
    //     const descriptionArea = document.querySelector('.pull-discussion-timeline');
    //     if (!descriptionArea) {
    //         return null;
    //     }
    //
    //     // Look for the PR title
    //     const prTitleElement = document.querySelector('.js-issue-title');
    //     if (prTitleElement && prTitleElement.parentElement) {
    //         return prTitleElement.parentElement;
    //     }
    //
    //     // Fallback to the first element in the PR description
    //     return descriptionArea.querySelector('.TimelineItem');
    // }

    private findInsertionPoint(): Element | null {
        // Try different selectors for where to insert the indicator
        const selectors = [
            '.gh-header-meta',           // GitHub's PR header metadata section
            '.gh-header-title',          // PR title area
            '.js-issue-title',           // Issue/PR title
            '.gh-header',                // General header
            '[data-testid="pr-header"]'  // Test ID for PR header
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                return element;
            }
        }

        return null;
    }

    private createStackIndicator(prInfo: PrInfo): HTMLElement {
        const indicator = document.createElement('div');
        indicator.className = 'pr-stack-indicator';
        indicator.setAttribute('data-pr-stack', 'true');

        // Create the top bar/badge
        const badge = document.createElement('div');
        badge.className = prInfo.isStackedPR ? 'pr-stack-badge pr-stack-stacked' : 'pr-stack-badge pr-stack-normal';

        // Icon for the badge
        const icon = document.createElement('span');
        icon.className = 'pr-stack-icon';
        icon.innerHTML = prInfo.isStackedPR
            ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M7.75 14A1.75 1.75 0 016 12.25v-8.5C6 2.784 6.784 2 7.75 2h6.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0114.25 14h-6.5zm-.25-1.75c0 .138.112.25.25.25h6.5a.25.25 0 00.25-.25v-8.5a.25.25 0 00-.25-.25h-6.5a.25.25 0 00-.25.25v8.5zM4.9 3.508a.75.75 0 01-.274 1.025.25.25 0 00-.126.217v6.5a.25.25 0 00.126.217.75.75 0 01-.752 1.298A1.75 1.75 0 013 11.25v-6.5c0-.649.353-1.214.874-1.516a.75.75 0 011.025.274zM1.625 5.533a.75.75 0 10-.75-1.3A1.75 1.75 0 000 5.75v3.5c0 .649.353 1.214.875 1.515a.75.75 0 10.75-1.3.25.25 0 01-.125-.215v-3.5a.25.25 0 01.125-.217z"></path></svg>'
            : '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z"></path></svg>';

        // Text for the badge
        const text = document.createElement('div');
        text.className = 'pr-stack-text';
        text.textContent = prInfo.isStackedPR ? 'Stacked Pull Request' : 'Direct Pull Request';

        // Toggle button for showing the branch diagram
        const toggle = document.createElement('button');
        toggle.className = 'diagram-toggle';
        toggle.setAttribute('aria-label', 'Toggle branch diagram');
        toggle.setAttribute('data-expanded', 'false');
        toggle.innerHTML = '<svg class="toggle-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"></path></svg>';

        badge.appendChild(icon);
        badge.appendChild(text);
        badge.appendChild(toggle);

        // Create the info section
        const infoSection = document.createElement('div');
        infoSection.className = 'pr-stack-info';

        // Branch chain display
        const branchChain = document.createElement('div');
        branchChain.className = 'pr-stack-chain';

        // Base branch
        const baseBranchSpan = document.createElement('span');
        baseBranchSpan.className = 'pr-stack-branch pr-stack-base';
        baseBranchSpan.textContent = prInfo.baseBranch;
        branchChain.appendChild(baseBranchSpan);

        // Arrow
        const arrow = document.createElement('span');
        arrow.className = 'pr-stack-arrow';
        arrow.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z"></path></svg>';
        branchChain.appendChild(arrow);

        // Head branch
        const headBranchSpan = document.createElement('span');
        headBranchSpan.className = 'pr-stack-branch pr-stack-head';
        headBranchSpan.textContent = prInfo.headBranch;
        branchChain.appendChild(headBranchSpan);

        infoSection.appendChild(branchChain);

        // Branch diagram container
        const diagramContainer = document.createElement('div');
        diagramContainer.className = 'pr-merge-diagram';
        diagramContainer.style.display = 'none';
        diagramContainer.innerHTML = this.createStackedMergeDiagram(prInfo);
        infoSection.appendChild(diagramContainer);

        // Add token status info
        indicator.appendChild(badge);
        indicator.appendChild(infoSection);

        // Add the token status UI
        this.addTokenStatusToUI(indicator);

        // Add event listeners
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            const isExpanded = toggle.getAttribute('data-expanded') === 'true';
            toggle.setAttribute('data-expanded', (!isExpanded).toString());
            diagramContainer.style.display = !isExpanded ? 'block' : 'none';
        });

        return indicator;
    }

    // Update visualizePR to be async and fetch branch chain
    private async visualizePR(): Promise<void> {
        console.log('Attempting to visualize PR');

        // Remove existing indicators
        const existingIndicators = document.querySelectorAll('[data-pr-stack="true"]');
        existingIndicators.forEach(indicator => indicator.remove());

        const prInfo = this.getPRInfo();

        if (!prInfo) {
            console.log('No PR info found, will retry later');
            // Schedule a retry after page might have loaded more elements
            setTimeout(() => this.visualizePR(), 1000);
            return;
        }

        const insertionPoint = this.findInsertionPoint();

        if (!insertionPoint) {
            console.log('Could not find insertion point, will retry later');
            // Schedule a retry after page might have loaded more elements
            setTimeout(() => this.visualizePR(), 1000);
            return;
        }

        console.log('Found PR info:', prInfo);
        console.log('Token status:', this.hasGithubToken ? 'available' : 'not available');

        // Even without token, render the basic version first
        let indicator = this.createStackIndicator(prInfo);
        insertionPoint.insertAdjacentElement('afterend', indicator);

        // If token is available, fetch branch chain and update the indicator
        if (this.hasGithubToken) {
            console.log('Fetching branch chain with token');
            prInfo.branchChain = await this.fetchBranchChain(prInfo);

            // Update the visualization with the branch chain info
            const existingIndicator = document.querySelector('[data-pr-stack="true"]');
            if (existingIndicator) {
                existingIndicator.remove();
                indicator = this.createStackIndicator(prInfo);
                insertionPoint.insertAdjacentElement('afterend', indicator);
            }
        }
    }

    // Update the token status indicator in the UI
    private addTokenStatusToUI(indicator: HTMLElement): void {
        const infoSection = indicator.querySelector('.pr-stack-info');
        if (!infoSection) return;

        const tokenStatus = document.createElement('div');
        tokenStatus.className = this.hasGithubToken ? 'pr-stack-note' : 'pr-stack-warning';
        tokenStatus.style.marginTop = '8px';

        if (this.hasGithubToken) {
            tokenStatus.innerHTML = '✅ Using GitHub token for enhanced branch detection';
        } else {
            tokenStatus.innerHTML = '⚠️ No GitHub token configured. <a href="#" id="configure-token">Configure token</a> for better branch detection';

            // Add listener for token configuration link
            setTimeout(() => {
                const link = document.getElementById('configure-token');
                if (link) {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        chrome.runtime.sendMessage({ action: 'openOptions' });
                    });
                }
            }, 0);
        }

        infoSection.appendChild(tokenStatus);
    }

    public destroy(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        const indicators = document.querySelectorAll('[data-pr-stack="true"]');
        indicators.forEach(indicator => indicator.remove());
    }
}

// Initialize the extension
let prStackVisualizer: PRStackVisualizer | null = null;

function initExtension(): void {
    // Check if we're on a PR page
    if (!window.location.pathname.includes('/pull/')) {
        return;
    }

    // Clean up existing instance
    if (prStackVisualizer) {
        prStackVisualizer.destroy();
    }

    // Create new instance
    prStackVisualizer = new PRStackVisualizer();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExtension);
} else {
    initExtension();
}

// Handle navigation changes (for SPA behavior)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(initExtension, 500); // Small delay for content to load
    }
}).observe(document, { subtree: true, childList: true });