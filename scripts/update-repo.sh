#!/bin/bash

# Update Debian APT Repository Script
# This script generates checksums, compresses Packages file, and updates Release file

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_PATH="$REPO_ROOT/public/dists/stable"
PACKAGES_PATH="$DIST_PATH/main/binary-amd64/Packages"
RELEASE_PATH="$DIST_PATH/Release"

echo "Updating APT repository..."

# Create compressed version of Packages file
echo "Compressing Packages file..."
gzip -9 -c "$PACKAGES_PATH" > "$PACKAGES_PATH.gz"

# Generate checksums for Release file
echo "Generating checksums..."

# Function to generate checksums for a file
generate_checksums() {
    local file="$1"
    local relative_path="$2"
    local size=$(stat -c%s "$file")
    
    local md5sum=$(md5sum "$file" | cut -d' ' -f1)
    local sha1sum=$(sha1sum "$file" | cut -d' ' -f1)
    local sha256sum=$(sha256sum "$file" | cut -d' ' -f1)
    
    echo "MD5: $md5sum $size $relative_path"
    echo "SHA1: $sha1sum $size $relative_path"
    echo "SHA256: $sha256sum $size $relative_path"
}

# Temporary file for new Release content
TEMP_RELEASE=$(mktemp)

# Copy everything up to the checksum sections
sed '/^MD5Sum:/,$d' "$RELEASE_PATH" > "$TEMP_RELEASE"

# Update the date
sed -i "s/^Date:.*/Date: $(date -u -R)/" "$TEMP_RELEASE"

# Add checksum sections
echo "MD5Sum:" >> "$TEMP_RELEASE"
if [ -f "$PACKAGES_PATH" ]; then
    generate_checksums "$PACKAGES_PATH" "main/binary-amd64/Packages" | grep "MD5:" | sed 's/MD5: / /' >> "$TEMP_RELEASE"
fi
if [ -f "$PACKAGES_PATH.gz" ]; then
    generate_checksums "$PACKAGES_PATH.gz" "main/binary-amd64/Packages.gz" | grep "MD5:" | sed 's/MD5: / /' >> "$TEMP_RELEASE"
fi

echo "SHA1:" >> "$TEMP_RELEASE"
if [ -f "$PACKAGES_PATH" ]; then
    generate_checksums "$PACKAGES_PATH" "main/binary-amd64/Packages" | grep "SHA1:" | sed 's/SHA1: / /' >> "$TEMP_RELEASE"
fi
if [ -f "$PACKAGES_PATH.gz" ]; then
    generate_checksums "$PACKAGES_PATH.gz" "main/binary-amd64/Packages.gz" | grep "SHA1:" | sed 's/SHA1: / /' >> "$TEMP_RELEASE"
fi

echo "SHA256:" >> "$TEMP_RELEASE"
if [ -f "$PACKAGES_PATH" ]; then
    generate_checksums "$PACKAGES_PATH" "main/binary-amd64/Packages" | grep "SHA256:" | sed 's/SHA256: / /' >> "$TEMP_RELEASE"
fi
if [ -f "$PACKAGES_PATH.gz" ]; then
    generate_checksums "$PACKAGES_PATH.gz" "main/binary-amd64/Packages.gz" | grep "SHA256:" | sed 's/SHA256: / /' >> "$TEMP_RELEASE"
fi

# Replace the Release file
mv "$TEMP_RELEASE" "$RELEASE_PATH"

echo "Repository updated successfully!"
echo "Files updated:"
echo "  - $PACKAGES_PATH.gz (compressed)"
echo "  - $RELEASE_PATH (checksums updated)"
echo ""
echo "To deploy: wrangler deploy"