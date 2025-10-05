import { Hono } from 'hono';

const app = new Hono();

// Helper function to handle .deb file proxy requests
async function handleDebFileProxy(c) {
  const url = new URL(c.req.url);
  const poolFilename = decodeURIComponent(url.pathname.split('/').pop());
  
  const githubRepo = c.env.GITHUB_REPO || 'f3liz-dev/noraneko-package-repository';
  
  const headers = {
    'User-Agent': 'noraneko-apt-repo/1.0',
    'Authorization': `Bearer ${c.env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
  };

  try {
    // Fetch release map from Workers Assets
    const mapResponse = await c.env.ASSETS.fetch(new Request(`${url.origin}/release-map.json`));
    
    if (!mapResponse.ok) {
      console.error('Failed to load release-map.json');
      return c.text('Release map not found', 500);
    }
    
    const releaseData = await mapResponse.json();
    const packageMap = releaseData.packages || {};
    
    // Look up the package in the map
    const packageInfo = packageMap[poolFilename];
    
    if (!packageInfo) {
      console.error(`Package not found in release map: ${poolFilename}`);
      console.log(`Available packages: ${Object.keys(packageMap).slice(0, 5).join(', ')}...`);
      return c.text('Package not found in release map', 404);
    }
    
    console.log(`Found mapping for ${poolFilename}:`);
    console.log(`  Release: ${packageInfo.release}`);
    console.log(`  Original asset: ${packageInfo.originalAssetName}`);
    console.log(`  Pool path: ${packageInfo.poolPath}`);
    
    // Fetch the specific release
    const releaseUrl = `https://api.github.com/repos/${githubRepo}/releases/tags/${packageInfo.release}`;
    const releasesResponse = await fetch(releaseUrl, { headers });
    
    if (!releasesResponse.ok) {
      console.error(`GitHub API request failed with status: ${releasesResponse.status}`);
      const errorBody = await releasesResponse.text();
      console.error(`Response body: ${errorBody}`);
      return c.text('Release not found on GitHub', releasesResponse.status);
    }
    
    const release = await releasesResponse.json();
    
    // Find the asset by original filename
    const asset = release.assets.find(a => a.name === packageInfo.originalAssetName);
    
    if (!asset) {
      console.error(`Asset not found: "${packageInfo.originalAssetName}" in release "${release.tag_name}"`);
      const availableAssets = release.assets.map(a => a.name);
      console.log(`Available assets: ${JSON.stringify(availableAssets, null, 2)}`);
      return c.text('Package asset not found on GitHub', 404);
    }
    
    // Proxy the download
    return fetchAndReturnDeb(asset, poolFilename);
    
  } catch (error) {
    console.error('Exception in handleDebFileProxy:', error);
    return c.text(`Internal Server Error: ${error.message}`, 500);
  }
}

async function fetchAndReturnDeb(asset, fileName) {
  console.log(`Proxying download: "${asset.name}" -> "${fileName}"`);
  
  const debResponse = await fetch(asset.browser_download_url);
  
  if (!debResponse.ok) {
    console.error(`Failed to fetch from GitHub: ${debResponse.status}`);
    return new Response('Failed to fetch package from GitHub', { status: 502 });
  }
  
  return new Response(debResponse.body, {
    status: debResponse.status,
    headers: {
      'Content-Type': 'application/vnd.debian.binary-package',
      'Content-Length': debResponse.headers.get('Content-Length'),
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    }
  });
}

// Handle .deb file requests from pool - proxy to GitHub
app.get('/pool/*', async (c) => {
  const path = c.req.path;
  
  if (path.endsWith('.deb')) {
    return handleDebFileProxy(c);
  }
  
  // If not a .deb file, pass through to ASSETS
  return c.env.ASSETS.fetch(c.req.raw);
});

// All other requests are handled by Workers Assets
app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
