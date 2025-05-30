# PR Stack Visualizer

A browser extension that helps visualize when GitHub pull requests are not targeting the main branch, making it easier to work with stacked PRs.

## Features

- 🔍 **Automatic Detection**: Identifies when a PR is targeting a non-main branch
- 🎨 **Visual Indicators**: Clear badges and styling to distinguish stacked PRs
- 📱 **Responsive Design**: Works well on desktop and mobile GitHub
- 🌙 **Dark Mode Support**: Automatically adapts to GitHub's theme
- ⚡ **Real-time Updates**: Works with GitHub's dynamic content loading

## What it Shows

### Stacked PRs
- Red warning badge with stack icon
- Branch chain visualization (base → head)
- Warning message indicating the PR builds on a feature branch

### Standard PRs
- Green confirmation badge
- Branch chain showing main branch targeting
- Confirmation that it's targeting a main branch

## Installation

1. **Build the extension**:
   ```bash
   npm install
   npm run build
   ```

2. **Load in Chrome**:
    - Open `chrome://extensions/`
    - Enable "Developer mode"
    - Click "Load unpacked"
    - Select the extension directory

3. **Load in Firefox**:
    - Open `about:debugging`
    - Click "This Firefox"
    - Click "Load Temporary Add-on"
    - Select the `manifest.json` file

## Development

### Prerequisites
- Node.js 16+
- TypeScript
- A Chromium-based browser or Firefox

### Setup
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch for changes during development
npm run watch
```

### Project Structure
```
├── manifest.json          # Extension manifest
├── src/                   # Main extension scripts
│   ├── list
│   │   └── visualize.ts
│   ├── pull-request
│       └── visualize.ts
├── styles.css             # Extension styles
├── package.json
├── tsconfig.json
└── README.md
```

## How it Works

The extension:

1. **Detects PR Pages**: Runs on GitHub pull request URLs
2. **Extracts Branch Info**: Reads the base and head branch from GitHub's UI
3. **Identifies Stacked PRs**: Checks if the base branch is not a main branch (main, master, develop, dev)
4. **Adds Visual Indicators**: Injects styled elements to highlight the PR type
5. **Handles Dynamic Content**: Uses MutationObserver to work with GitHub's SPA navigation

## Supported Main Branches

The extension considers these as "main" branches:
- `main`
- `master`
- `develop`
- `dev`

PRs targeting any other branch are considered "stacked."

## Browser Compatibility

- ✅ Chrome/Chromium (Manifest V3)
- ✅ Firefox (Manifest V3 compatible)
- ✅ Edge
- ✅ Safari (with minor modifications)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on GitHub PRs
5. Submit a pull request

## License

MIT License - see LICENSE file for details