#!/bin/bash

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=====================================${NC}"
echo -e "${YELLOW}AI Features Setup Verification${NC}"
echo -e "${YELLOW}=====================================${NC}\n"

cd "/Users/mac/Debrief v1/my-react-app"

# Check 1: Environment files
echo -e "${YELLOW}1. Checking environment files...${NC}"
if [ -f ".env" ]; then
    echo -e "${GREEN}✓ .env file exists${NC}"
    if grep -q "ANTHROPIC_API_KEY=sk-" ".env"; then
        echo -e "${GREEN}✓ ANTHROPIC_API_KEY configured${NC}"
    else
        echo -e "${RED}✗ ANTHROPIC_API_KEY not set (needs sk-ant-xxx format)${NC}"
    fi
else
    echo -e "${RED}✗ .env file missing${NC}"
fi

if [ -f ".env.local" ]; then
    echo -e "${GREEN}✓ .env.local file exists${NC}"
else
    echo -e "${RED}✗ .env.local file missing${NC}"
fi

# Check 2: Dependencies
echo -e "\n${YELLOW}2. Checking dependencies...${NC}"
if npm ls @anthropic-ai/sdk > /dev/null 2>&1; then
    echo -e "${GREEN}✓ @anthropic-ai/sdk installed${NC}"
else
    echo -e "${RED}✗ @anthropic-ai/sdk not installed${NC}"
fi

if npm ls express > /dev/null 2>&1; then
    echo -e "${GREEN}✓ express installed${NC}"
else
    echo -e "${RED}✗ express not installed${NC}"
fi

# Check 3: Files
echo -e "\n${YELLOW}3. Checking required files...${NC}"
files=("server.js" "src/services/aiService.js" "src/hooks/useAI.js" "src/components/ChatComponent.jsx")
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓ $file exists${NC}"
    else
        echo -e "${RED}✗ $file missing${NC}"
    fi
done

# Check 4: Backend test
echo -e "\n${YELLOW}4. Testing backend connectivity...${NC}"
if command -v curl &> /dev/null; then
    response=$(curl -s http://localhost:3001/health 2>&1)
    if [[ $response == *"OK"* ]]; then
        echo -e "${GREEN}✓ Backend server is running!${NC}"
    else
        echo -e "${RED}✗ Backend server is not running${NC}"
        echo -e "${YELLOW}  Start it with: npm run server${NC}"
    fi
else
    echo -e "${YELLOW}⚠ curl not available, skipping backend test${NC}"
fi

echo -e "\n${YELLOW}=====================================${NC}"
echo -e "${YELLOW}Summary${NC}"
echo -e "${YELLOW}=====================================${NC}"
echo -e "1. Update .env with your API key from https://console.anthropic.com/"
echo -e "2. Run: npm run server (Terminal 1)"
echo -e "3. Run: npm run dev (Terminal 2)"
echo -e "4. Open: http://localhost:5173"
echo -e "\n${GREEN}AI features should now work!${NC}\n"
