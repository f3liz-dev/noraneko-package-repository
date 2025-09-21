# noraneko-package-repository

APT repository for Noraneko packages, hosted on Cloudflare Workers with static file serving and GitHub release proxying.

## Structure

```
repo/
├── public/dists/stable/{Release,main/binary-amd64/Packages}
├── wrangler.toml (assets.directory="public", worker proxies .deb files)  
├── worker.js (proxy /pool/*.deb from GitHub releases)
└── scripts/update-repo.sh (generate checksums, gzip Packages)
```

## Usage

### Adding the repository to your system

```bash
echo "deb https://apt.domain.com/ stable main" | sudo tee /etc/apt/sources.list.d/noraneko.list
sudo apt update
```

### Deploying to Cloudflare Workers

```bash
wrangler deploy
```

### Updating the repository

Run the update script to regenerate checksums and compress packages:

```bash
./scripts/update-repo.sh
```

## How it works

- Static files (Release, Packages, Packages.gz) are served directly from Cloudflare's edge
- .deb package files in `/pool/` are proxied through the Worker from GitHub releases
- The Worker fetches packages from the latest release of the configured GitHub repository
