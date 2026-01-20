#!/bin/bash
# Test that workspace:* dependencies are resolved correctly when packing
set -e

echo "Building packages..."
pnpm build:packages

echo "Testing workspace:* resolution..."
cd packages

for package in */; do
  echo "Testing package: $package"
  cd "$package"
  
  # Create a pack tarball - pnpm will resolve workspace:* during packing
  pnpm pack --quiet
  
  # Find the tarball
  tarball=$(ls *.tgz | head -1)
  
  # Extract and check that workspace:* was resolved (should NOT be present)
  if tar -xzOf "$tarball" package/package.json | grep -q '"workspace:\*"'; then
    echo "✗ ERROR: workspace:* not resolved in $package"
    rm -f "$tarball"
    exit 1
  else
    echo "✓ workspace:* resolved correctly in $package"
  fi
  
  rm -f "$tarball"
  cd ..
done

echo "All packages verified successfully!"
