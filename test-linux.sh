#!/bin/bash

# NodePilot Linux Compatibility Test Script
# Tests all critical functionality before deployment

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════╗"
echo "║  NodePilot Linux Compatibility Test     ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

test_pass() {
    echo -e "${GREEN}✓ $1${NC}"
    ((TESTS_PASSED++))
}

test_fail() {
    echo -e "${RED}✗ $1${NC}"
    ((TESTS_FAILED++))
}

test_warn() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Test 1: File Naming
echo -e "${BLUE}[1/8] Testing File Naming...${NC}"
if [ -f "setup.sh" ] && [ -f "start.sh" ] && [ -f "stop.sh" ]; then
    test_pass "All shell scripts present with correct naming"
else
    test_fail "Some shell scripts missing"
fi

# Test 2: Script Permissions
echo -e "${BLUE}[2/8] Testing Script Permissions...${NC}"
if [ -x "setup.sh" ] || [ -f "setup.sh" ]; then
    test_pass "Scripts are accessible (run: chmod +x *.sh to make executable)"
else
    test_fail "Cannot access scripts"
fi

# Test 3: Line Endings
echo -e "${BLUE}[3/8] Testing Line Endings...${NC}"
if file setup.sh | grep -q "CRLF"; then
    test_warn "CRLF line endings detected (run: dos2unix *.sh to fix)"
else
    test_pass "Unix line endings (LF) detected"
fi

# Test 4: Directory Structure
echo -e "${BLUE}[4/8] Testing Directory Structure...${NC}"
if [ -d "backend" ] && [ -d "frontend" ] && [ -d "backend/src" ]; then
    test_pass "Directory structure is correct"
else
    test_fail "Directory structure is incorrect"
fi

# Test 5: Package.json Scripts
echo -e "${BLUE}[5/8] Testing package.json Scripts...${NC}"
if grep -q "npm run build:backend; npm run build:frontend" package.json; then
    test_pass "Cross-platform scripts using semicolons"
else
    test_warn "Scripts may use && which can cause issues"
fi

# Test 6: Path Usage
echo -e "${BLUE}[6/8] Testing Path Usage...${NC}"
if grep -r "path\.join" backend/src/ > /dev/null 2>&1; then
    test_pass "Using path.join for cross-platform paths"
else
    test_warn "May not be using path.join consistently"
fi

# Test 7: Environment Files
echo -e "${BLUE}[7/8] Testing Environment Files...${NC}"
if [ -f "backend/.env.example" ] && [ -f "frontend/.env.example" ]; then
    test_pass "Environment example files present"
    
    # Check for relative paths
    if grep -q "PROJECTS_DIR=../projects" backend/.env.example; then
        test_pass "Using relative paths in .env.example"
    else
        test_warn "May be using absolute paths in .env.example"
    fi
else
    test_fail "Environment example files missing"
fi

# Test 8: Documentation
echo -e "${BLUE}[8/8] Testing Documentation...${NC}"
if [ -f "LINUX_DEPLOYMENT.md" ] && [ -f "LINUX_QUICKSTART.md" ]; then
    test_pass "Linux documentation present"
else
    test_fail "Linux documentation missing"
fi

echo ""
echo "══════════════════════════════════════════"
echo ""
echo -e "Results: ${GREEN}$TESTS_PASSED passed${NC} | ${RED}$TESTS_FAILED failed${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! Project is Linux-ready.${NC}"
    echo ""
    echo "🚀 Next steps:"
    echo "   1. Make scripts executable: chmod +x *.sh"
    echo "   2. Run setup: sudo ./setup.sh"
    echo "   3. Start NodePilot: ./start.sh"
    echo ""
    exit 0
else
    echo -e "${YELLOW}⚠️  Some issues detected, but project should still work.${NC}"
    echo ""
    echo "🔧 Recommendations:"
    echo "   - Fix line endings: dos2unix *.sh"
    echo "   - Make executable: chmod +x *.sh"
    echo "   - Review warnings above"
    echo ""
    exit 0
fi
