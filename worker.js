export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Check if this is a request for a .deb file in /pool/
    if (url.pathname.startsWith('/pool/') && url.pathname.endsWith('.deb')) {
      return handleDebFileProxy(request, env, url);
    }
    
    // For all other requests, return a 404 as static files are handled by Assets
    return new Response('Not Found', { status: 404 });
  }
};

async function handleDebFileProxy(request, env, url) {
  const debFileName = decodeURIComponent(url.pathname.split('/').pop());
  const githubRepo = env.GITHUB_REPO || 'f3liz-dev/noraneko';
  
  try {
    // First, try to get the latest release
    const releasesResponse = await fetch(
      `https://api.github.com/repos/${githubRepo}/releases/latest`,
      {
        headers: {
          'User-Agent': 'noraneko-apt-repo/1.0',
        }
      }
    );
    
    if (!releasesResponse.ok) {
      return new Response('Release not found', { status: 404 });
    }
    
    const release = await releasesResponse.json();
    
    // Look for the requested .deb file in the release assets
    const asset = release.assets.find(asset => 
      asset.name === debFileName && asset.name.endsWith('.deb')
    );
    
    if (!asset) {
      return new Response('Package not found', { status: 404 });
    }
    
    // Proxy the request to GitHub
    const debResponse = await fetch(asset.browser_download_url, {
      headers: {
        'User-Agent': 'noraneko-apt-repo/1.0',
      }
    });
    
    if (!debResponse.ok) {
      return new Response('Failed to fetch package', { status: 502 });
    }
    
    // Return the .deb file with appropriate headers
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
    console.error('Error proxying .deb file:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
