export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith('/pool/') && url.pathname.endsWith('.deb')) {
      return handleDebFileProxy(request, env, url);
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

async function handleDebFileProxy(request, env, url) {
  // Decode the filename from the URL path
  const debFileName = decodeURIComponent(url.pathname.split('/').pop());
  const githubRepo = env.GITHUB_REPO || 'f3liz-dev/noraneko-package-repository';
  
  // LOG 1: Log the filename we are looking for
  console.log(`Attempting to find package with decoded name: "${debFileName}"`);

  try {
    const releasesResponse = await fetch(
      `https://api.github.com/repos/${githubRepo}/releases/latest`,
      {
        headers: {
          'User-Agent': 'noraneko-apt-repo/1.0',
        }
      }
    );
    
    if (!releasesResponse.ok) {
      console.error(`GitHub API request failed with status: ${releasesResponse.status}`);
      return new Response('Release not found', { status: 404 });
    }
    
    const release = await releasesResponse.json();
    
    // Find the asset in the release
    const asset = release.assets.find(asset => asset.name === debFileName);
    
    if (!asset) {
      // LOG 2: If not found, log what was available
      const availableAssets = release.assets.map(a => a.name);
      console.error(`Asset not found: "${debFileName}"`);
      console.log(`Available assets in latest release:\n${JSON.stringify(availableAssets, null, 2)}`);
      
      return new Response('Package not found in latest release', { status: 404 });
    }
    
    // LOG 3: Log a success message
    console.log(`Asset found! Proxying download for: "${asset.name}"`);

    const debResponse = await fetch(asset.browser_download_url, {
      headers: {
        'User-Agent': 'noraneko-apt-repo/1.0',
      }
    });
    
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
