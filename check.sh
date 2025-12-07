#!/bin/bash

# NodePilot Pre-Deployment Checklist
# Run this script to verify Linux readiness

echo "🔍 NodePilot Linux Deployment Checklist"
echo "========================================"
echo ""

CHECKS_PASSED=0
CHECKS_FAILED=0

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_pass() {
    echo -e "${GREEN}✅ $1${NC}"
    ((CHECKS_PASSED++))
}

check_fail() {
    echo -e "${RED}❌ $1${NC}"
    ((CHECKS_FAILED++))
}

check_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

echo "📋 Checking System Requirements..."
echo ""

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        check_pass "Node.js $(node --version)"
    else
        check_fail "Node.js version must be 18+ (current: $(node --version))"
    fi
else
    check_fail "Node.js not installed"
fi

# Check npm
if command -v npm &> /dev/null; then
    check_pass "npm $(npm --version)"
else
    check_fail "npm not installed"
fi

# Check PM2
if command -v pm2 &> /dev/null; then
    check_pass "PM2 $(pm2 --version)"
else
    check_warn "PM2 not installed (optional, but recommended)"
fi

# Check Git
if command -v git &> /dev/null; then
    check_pass "Git $(git --version | cut -d' ' -f3)"
else
    check_warn "Git not installed (needed for git deployment features)"
fi

echo ""
echo "📁 Checking Project Structure..."
echo ""

# Check directories
[ -d "backend" ] && check_pass "backend/ directory exists" || check_fail "backend/ directory missing"
[ -d "frontend" ] && check_pass "frontend/ directory exists" || check_fail "frontend/ directory missing"
[ -f "package.json" ] && check_pass "Root package.json exists" || check_fail "Root package.json missing"
[ -f "backend/package.json" ] && check_pass "Backend package.json exists" || check_fail "Backend package.json missing"
[ -f "frontend/package.json" ] && check_pass "Frontend package.json exists" || check_fail "Frontend package.json missing"

echo ""
echo "⚙️  Checking Configuration..."
echo ""

# Check env files
if [ -f "backend/.env" ]; then
    check_pass "Backend .env exists"
    
    # Check critical env vars
    if grep -q "JWT_SECRET=your-super-secret" backend/.env; then
        check_warn "JWT_SECRET still has default value - change it!"
    fi
    
    if grep -q "JWT_SECRET" backend/.env; then
        check_pass "JWT_SECRET configured"
    else
        check_fail "JWT_SECRET missing in .env"
    fi
    
else
    check_fail "Backend .env missing (copy from .env.example)"
fi

if [ -f "frontend/.env.local" ]; then
    check_pass "Frontend .env.local exists"
else
    check_warn "Frontend .env.local missing (copy from .env.example)"
fi

echo ""
echo "🔨 Checking Build Status..."
echo ""

# Check if built
if [ -d "backend/dist" ] && [ -f "backend/dist/index.js" ]; then
    check_pass "Backend is built"
else
    check_warn "Backend not built yet (run: cd backend && npm run build)"
fi

if [ -d "frontend/.next" ]; then
    check_pass "Frontend is built"
else
    check_warn "Frontend not built yet (run: cd frontend && npm run build)"
fi

echo ""
echo "📦 Checking Dependencies..."
echo ""

# Check node_modules
if [ -d "node_modules" ]; then
    check_pass "Root dependencies installed"
else
    check_warn "Root dependencies not installed (run: npm install)"
fi

if [ -d "backend/node_modules" ]; then
    check_pass "Backend dependencies installed"
else
    check_warn "Backend dependencies not installed (run: cd backend && npm install)"
fi

if [ -d "frontend/node_modules" ]; then
    check_pass "Frontend dependencies installed"
else
    check_warn "Frontend dependencies not installed (run: cd frontend && npm install)"
fi

echo ""
echo "🔐 Checking Permissions..."
echo ""

# Check script permissions
if [ -x "setup.sh" ]; then
    check_pass "setup.sh is executable"
else
    check_warn "setup.sh not executable (run: chmod +x setup.sh)"
fi

for script in start.sh stop.sh restart.sh status.sh; do
    if [ -f "$script" ]; then
        if [ -x "$script" ]; then
            check_pass "$script is executable"
        else
            check_warn "$script not executable (run: chmod +x $script)"
        fi
    fi
done

echo ""
echo "🌐 Checking Ports..."
echo ""

# Check if ports are free
if lsof -Pi :9000 -sTCP:LISTEN -t &> /dev/null; then
    check_warn "Port 9000 is in use (frontend)"
else
    check_pass "Port 9000 is available (frontend)"
fi

if lsof -Pi :9001 -sTCP:LISTEN -t &> /dev/null; then
    check_warn "Port 9001 is in use (backend)"
else
    check_pass "Port 9001 is available (backend)"
fi

echo ""
echo "🗂️  Checking Required Directories..."
echo ""

for dir in projects backups logs backend/logs frontend/logs backend/uploads; do
    if [ -d "$dir" ]; then
        check_pass "$dir/ exists"
    else
        check_warn "$dir/ missing (will be created on first run)"
    fi
done

echo ""
echo "========================================"
echo ""
echo -e "${GREEN}Passed: $CHECKS_PASSED${NC} | ${RED}Failed: $CHECKS_FAILED${NC}"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All critical checks passed!${NC}"
    echo ""
    echo "🚀 Ready to deploy! Run:"
    echo "   ./start.sh"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some critical checks failed.${NC}"
    echo ""
    echo "🔧 Please fix the issues above before deploying."
    echo ""
    exit 1
fi
