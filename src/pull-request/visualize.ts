interface PRInfo {
    baseBranch: string;
    headBranch: string;
    isStackedPR: boolean;
    repoOwner: string;
    repoName: string;
}

interface BranchNode {
    name: string;
    isMain: boolean;
    level: number;
    children: string[];
}

class PRStackVisualizer {
    private readonly MAIN_BRANCHES = ['main', 'master', 'develop', 'dev'];
    private observer: MutationObserver | null = null;

    constructor() {
        this.init();
    }

    private init(): void {
        // Run immediately
        this.visualizePR();

        // Set up observer for dynamic content changes
        this.setupObserver();
    }

    private setupObserver(): void {
        this.observer = new MutationObserver((mutations) => {
            const shouldUpdate = mutations.some(mutation =>
                mutation.type === 'childList' &&
                Array.from(mutation.addedNodes).some(node =>
                    node.nodeType === Node.ELEMENT_NODE &&
                    (node as Element).querySelector('.gh-header-meta, .base-ref, .head-ref')
                )
            );

            if (shouldUpdate) {
                this.visualizePR();
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    private getPRInfo(): PRInfo | null {
        // Try to get branch info from the PR header
        const baseRefElement = document.querySelector('.base-ref');
        const headRefElement = document.querySelector('.head-ref');

        if (!baseRefElement || !headRefElement) {
            console.log('PR Stack Visualizer: Branch elements not found');
            return null;
        }

        const baseBranch = baseRefElement.textContent?.trim() || '';
        const headBranch = headRefElement.textContent?.trim() || '';

        // Extract repo info from URL or elements
        const urlParts = window.location.pathname.split('/');
        const repoOwner = urlParts[1] || '';
        const repoName = urlParts[2] || '';

        const isStackedPR = !this.MAIN_BRANCHES.includes(baseBranch.toLowerCase());

        return {
            baseBranch,
            headBranch,
            isStackedPR,
            repoOwner,
            repoName
        };
    }

    private createMergeDiagram(prInfo: PRInfo): HTMLElement {
        const diagram = document.createElement('div');
        diagram.className = 'pr-merge-diagram';

        if (prInfo.isStackedPR) {
            // For stacked PRs, show the branch hierarchy
            diagram.innerHTML = this.createStackedMergeDiagram(prInfo);
        } else {
            // For regular PRs, show simple main -> feature branch
            diagram.innerHTML = this.createSimpleMergeDiagram(prInfo);
        }

        return diagram;
    }

    private createSimpleMergeDiagram(prInfo: PRInfo): string {
        return `
        <div class="merge-diagram-container simple">
            <div class="diagram-title">Merge Flow</div>
            <div class="branch-flow">
                <div class="connector-main"></div>
                <div class="branch-node main-branch">
                    <div class="branch-connector"></div>
                    <div class="branch-circle main"></div>
                    <div class="branch-label">${prInfo.baseBranch}</div>
                </div>
                <div class="branch-node head-branch current">
                    <div class="branch-connector"></div>
                    <div class="branch-circle feature"></div>
                    <div class="branch-label">${prInfo.headBranch}</div>
                    <div class="current-pr-indicator">This PR</div>
                </div>
            </div>
        </div>
    `;
    }

    private isStackedPR(prInfo: PRInfo): boolean {
        // Check if base branch is not main/master/develop
        const mainBranchPatterns = ['main', 'master', 'develop'];
        return !mainBranchPatterns.some(pattern =>
            prInfo.baseBranch.toLowerCase() === pattern ||
            prInfo.baseBranch.toLowerCase().endsWith(`/${pattern}`)
        );
    }

    private inferMainBranch(baseBranch: string): string {
        // Try to infer main branch from common patterns
        const mainBranchPatterns = ['main', 'master', 'develop'];

        // If base branch looks like a feature branch, assume main is "main"
        if (baseBranch.includes('/')) {
            return 'main';
        }

        // Otherwise default to main
        return 'main';
    }

    private createBranchVisualization(prInfo: PRInfo): string {
        const isStacked = this.isStackedPR(prInfo);

        if (isStacked) {
            return this.createStackedMergeDiagram(prInfo);
        } else {
            return this.createSimpleMergeDiagram(prInfo);
        }
    }

    private createStackedMergeDiagram(prInfo: PRInfo): string {
        // Determine the main branch
        const mainBranch = this.inferMainBranch(prInfo.baseBranch);

        return `
        <div class="merge-diagram-container stacked">
            <div class="diagram-title">Branch Hierarchy</div>
            <div class="branch-flow">
                <div class="connector-main"></div>
                <div class="branch-node main-branch">
                    <div class="branch-connector"></div>
                    <div class="branch-circle main"></div>
                    <div class="branch-label">${mainBranch}</div>
                </div>
                <div class="branch-node base-branch">
                    <div class="branch-connector"></div>
                    <div class="branch-circle intermediate"></div>
                    <div class="branch-label">${prInfo.baseBranch}</div>
                </div>
                <div class="branch-node head-branch">
                    <div class="branch-connector"></div>
                    <div class="branch-circle feature"></div>
                    <div class="branch-label">${prInfo.headBranch}</div>
                    <div class="current-pr-indicator">Current PR</div>
                </div>
            </div>
        </div>
    `;
    }

    private createStackIndicator(prInfo: PRInfo): HTMLElement {
        const indicator = document.createElement('div');
        indicator.className = 'pr-stack-indicator';
        indicator.setAttribute('data-pr-stack', 'true');

        const mergeDiagram = this.createMergeDiagram(prInfo);

        if (prInfo.isStackedPR) {
            indicator.innerHTML = `
                <div class="pr-stack-badge pr-stack-stacked">
                    <svg class="pr-stack-icon" viewBox="0 0 16 16" width="16" height="16">
                        <path fill="currentColor" d="M1.5 2.5A1.5 1.5 0 0 1 3 1h10a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 13 7H3a1.5 1.5 0 0 1-1.5-1.5v-3ZM3 2a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-3A.5.5 0 0 0 13 2H3Z"/>
                        <path fill="currentColor" d="M1.5 9.5A1.5 1.5 0 0 1 3 8h10a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5v-3ZM3 9a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-3A.5.5 0 0 0 13 9H3Z"/>
                    </svg>
                    <span class="pr-stack-text">Stacked PR</span>
                    <button class="diagram-toggle" data-expanded="false">
                        <svg class="toggle-icon" viewBox="0 0 16 16" width="12" height="12">
                            <path fill="currentColor" d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.44 8.5H2.75a.75.75 0 0 1 0-1.5h8.69L8.22 4.03a.75.75 0 0 1 0-1.06Z"/>
                        </svg>
                    </button>
                </div>
                <div class="pr-stack-info">
                    <div class="pr-stack-chain">
                        <span class="pr-stack-branch pr-stack-base">${prInfo.baseBranch}</span>
                        <svg class="pr-stack-arrow" viewBox="0 0 16 16" width="16" height="16">
                            <path fill="currentColor" d="M7.78 2.97a.75.75 0 0 0-1.06 0L2.47 7.22a.75.75 0 0 0 0 1.06l4.25 4.25a.75.75 0 0 0 1.06-1.06L4.56 8.5h8.69a.75.75 0 0 0 0-1.5H4.56l3.22-3.97a.75.75 0 0 0 0-1.06Z"/>
                        </svg>
                        <span class="pr-stack-branch pr-stack-head">${prInfo.headBranch}</span>
                    </div>
                    <div class="pr-stack-warning">
                        ⚠️ This PR is building on <strong>${prInfo.baseBranch}</strong>, not a main branch
                    </div>
                </div>
            `;
        } else {
            indicator.innerHTML = `
                <div class="pr-stack-badge pr-stack-normal">
                    <svg class="pr-stack-icon" viewBox="0 0 16 16" width="16" height="16">
                        <path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM6.5 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM9.5 6.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM7.25 10.75a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 0-1.5h-1.5Z"/>
                    </svg>
                    <span class="pr-stack-text">Standard PR</span>
                    <button class="diagram-toggle" data-expanded="false">
                        <svg class="toggle-icon" viewBox="0 0 16 16" width="12" height="12">
                            <path fill="currentColor" d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.44 8.5H2.75a.75.75 0 0 1 0-1.5h8.69L8.22 4.03a.75.75 0 0 1 0-1.06Z"/>
                        </svg>
                    </button>
                </div>
                <div class="pr-stack-info">
                    <div class="pr-stack-chain">
                        <span class="pr-stack-branch pr-stack-base">${prInfo.baseBranch}</span>
                        <svg class="pr-stack-arrow" viewBox="0 0 16 16" width="16" height="16">
                            <path fill="currentColor" d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.44 8.5H2.75a.75.75 0 0 1 0-1.5h8.69L8.22 4.03a.75.75 0 0 1 0-1.06Z"/>
                        </svg>
                        <span class="pr-stack-branch pr-stack-head">${prInfo.headBranch}</span>
                    </div>
                    <div class="pr-stack-note">
                        ✅ Targeting main branch: <strong>${prInfo.baseBranch}</strong>
                    </div>
                </div>
            `;
        }

        // Append the merge diagram
        indicator.appendChild(mergeDiagram);

        // Add click handler for toggle
        this.setupToggleHandler(indicator);

        return indicator;
    }

    private setupToggleHandler(indicator: HTMLElement): void {
        const toggleButton = indicator.querySelector('.diagram-toggle') as HTMLButtonElement;
        const diagram = indicator.querySelector('.pr-merge-diagram') as HTMLElement;

        if (toggleButton && diagram) {
            toggleButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const isExpanded = toggleButton.dataset.expanded === 'true';
                toggleButton.dataset.expanded = (!isExpanded).toString();

                if (isExpanded) {
                    diagram.style.display = 'none';
                    toggleButton.classList.remove('expanded');
                } else {
                    diagram.style.display = 'block';
                    toggleButton.classList.add('expanded');
                }
            });
        }
    }

    private visualizePR(): void {
        // Remove existing indicators
        const existingIndicators = document.querySelectorAll('[data-pr-stack="true"]');
        existingIndicators.forEach(indicator => indicator.remove());

        const prInfo = this.getPRInfo();
        if (!prInfo) {
            return;
        }

        // Find the best place to insert the indicator
        const insertionPoint = this.findInsertionPoint();
        if (!insertionPoint) {
            console.log('PR Stack Visualizer: Could not find insertion point');
            return;
        }

        const indicator = this.createStackIndicator(prInfo);
        insertionPoint.insertAdjacentElement('afterend', indicator);
    }

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
        setTimeout(initExtension, 100); // Small delay for content to load
    }
}).observe(document, { subtree: true, childList: true });