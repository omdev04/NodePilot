#!/bin/bash

# NodePilot - First Time Setup on Linux
# Run this file first after cloning

echo "🚀 NodePilot - First Time Setup"
echo "================================"
echo ""

# Make all scripts executable
echo "📝 Step 1: Making scripts executable..."
chmod +x setup.sh start.sh stop.sh restart.sh status.sh check.sh test-linux.sh install.sh

echo "✅ Scripts are now executable!"
echo ""

# Run compatibility test
echo "📝 Step 2: Running compatibility test..."
echo ""
./test-linux.sh

echo ""
echo "================================"
echo "🎉 Setup Complete!"
echo "================================"
echo ""
echo "📚 Next Steps:"
echo ""
echo "1️⃣  Run full setup (requires sudo):"
echo "    sudo ./setup.sh"
echo ""
echo "2️⃣  Or check system readiness:"
echo "    ./check.sh"
echo ""
echo "3️⃣  Read the documentation:"
echo "    - LINUX_QUICKSTART.md - Quick start guide"
echo "    - LINUX_DEPLOYMENT.md - Full deployment guide"
echo "    - LINUX_READY.md - Complete summary"
echo ""
echo "4️⃣  Available commands after setup:"
echo "    ./start.sh    - Start NodePilot"
echo "    ./stop.sh     - Stop NodePilot"
echo "    ./restart.sh  - Restart NodePilot"
echo "    ./status.sh   - Check status"
echo ""
echo "🌟 You're all set! Happy deploying!"
echo ""
