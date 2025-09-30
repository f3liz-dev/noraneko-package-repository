export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith('/pool/') && url.pathname.endsWith('.deb')) {
      // Pass the env object to the handler function
      return handleDebFileProxy(request, env, url);
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

async function handleDebFileProxy(request, env, url) {
  const debFileName = decodeURIComponent(url.pathname.split('/').pop()).replace('~', '.');
  const githubRepo = env.GITHUB_REPO || 'f3liz-dev/noraneko-package-repository';
  
  // Create a headers object to use for API calls
  const headers = {
    'User-Agent': 'noraneko-apt-repo/1.0',
    // FIX: Add the Authorization header to authenticate requests
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json', // Recommended by GitHub docs
  };

  try {
    const releasesResponse = await fetch(
      `https://api.github.com/repos/${githubRepo}/releases/latest`,
      // Use the headers object here
      { headers: headers }
    );
    
    if (!releasesResponse.ok) {
      console.error(`GitHub API request failed with status: ${releasesResponse.status}`);
      console.error(`Response body: ${await releasesResponse.text()}`);
      return new Response('Release not found', { status: releasesResponse.status });
    }
    
    const release = await releasesResponse.json();
    const asset = release.assets.find(asset => asset.name === debFileName);
    
    if (!asset) {
      const availableAssets = release.assets.map(a => a.name);
      console.error(`Asset not found: "${debFileName}"`);
      console.log(`Available assets in latest release:\n${JSON.stringify(availableAssets, null, 2)}`);
      return new Response('Package not found in latest release', { status: 404 });
    }
    
    console.log(`Asset found! Proxying download for: "${asset.name}"`);

    // NOTE: You don't need authentication to download the asset itself (browser_download_url)
    const debResponse = await fetch(asset.browser_download_url);
    
    if (!debResponse.ok) {
      return new Response('Failed to fetch package', { status: 502 });
    }
    
    return new Response(debResponse.body, {
      status: debResponse.status,
      headers: {
        'Content-Type': 'application/vnd.debian.binary-package',
        'Content-Length': debResponse.headers.get('Content-Length'),
        'Cache-Control': 'public, max-age=3600',
        'Content-Disposition': `attachment; filename="${debFileName}"`,
      }
    });
    
  } catch (error) {
    console.error('Caught an exception:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
