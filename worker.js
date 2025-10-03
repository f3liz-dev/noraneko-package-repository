export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle .deb file requests from pool
    if (url.pathname.startsWith('/pool/') && url.pathname.endsWith('.deb')) {
      return handleDebFileProxy(request, env, url, ctx);
    }
    
    // Let Cloudflare Workers Assets handle static files (including release-map.json)
    return env.ASSETS.fetch(request);
  }
};

async function handleDebFileProxy(request, env, url, ctx) {
  // Extract the pool filename from the URL
  // Example: /pool/main/n/noraneko-alpha/noraneko-alpha_0.2.0~build1_amd64.deb
  const poolFilename = decodeURIComponent(url.pathname.split('/').pop());
  
  const githubRepo = env.GITHUB_REPO || 'f3liz-dev/noraneko-package-repository';
  
  const headers = {
    'User-Agent': 'noraneko-apt-repo/1.0',
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
  };

  try {
    // Fetch release map from static assets
    const mapResponse = await env.ASSETS.fetch(new Request(`${url.origin}/release-map.json`));
    
    if (!mapResponse.ok) {
      console.error('Failed to load release-map.json');
      return new Response('Release map not found', { status: 500 });
    }
    
    const releaseData = await mapResponse.json();
    const packageMap = releaseData.packages || {};
    
    // Look up the package in the map
    const packageInfo = packageMap[poolFilename];
    
    if (!packageInfo) {
      console.error(`Package not found in release map: ${poolFilename}`);
      console.log(`Available packages: ${Object.keys(packageMap).slice(0, 5).join(', ')}...`);
      return new Response('Package not found in release map', { status: 404 });
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
      return new Response('Release not found on GitHub', { status: releasesResponse.status });
    }
    
    const release = await releasesResponse.json();
    
    // Find the asset by original filename
    const asset = release.assets.find(a => a.name === packageInfo.originalAssetName);
    
    if (!asset) {
      console.error(`Asset not found: "${packageInfo.originalAssetName}" in release "${release.tag_name}"`);
      const availableAssets = release.assets.map(a => a.name);
      console.log(`Available assets: ${JSON.stringify(availableAssets, null, 2)}`);
      return new Response('Package asset not found on GitHub', { status: 404 });
    }
    
    // Proxy the download
    return fetchAndReturnDeb(asset, poolFilename);
    
  } catch (error) {
    console.error('Exception in handleDebFileProxy:', error);
    return new Response(`Internal Server Error: ${error.message}`, { status: 500 });
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
