#!/bin/bash

# Export AWS credentials from current session
echo "Exporting AWS credentials from current session..."
eval $(aws configure export-credentials --format env)

# Run the seed script
echo "Running seed script..."
ts-node scripts/seed.ts
