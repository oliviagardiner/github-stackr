export interface BranchInfo {
    name: string;
    sha: string;
    baseBranch?: string;
}

export interface PrInfo {
    number: number;
    title: string;
    baseBranch: string;
    headBranch: string;
    state: string;
    url: string;
}

export class GitHubApiService {
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