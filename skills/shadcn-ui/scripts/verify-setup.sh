#!/usr/bin/env bash
# shadcn/ui Setup Verification Script
# Validates that a project is correctly configured for shadcn/ui

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Verifying shadcn/ui setup..."
echo ""

# Check if components.json exists
if [ -f "components.json" ]; then
    echo -e "${GREEN}✓${NC} components.json found"
else
    echo -e "${RED}✗${NC} components.json not found"
    echo -e "  ${YELLOW}Run:${NC} npx shadcn@latest init"
    exit 1
fi

# Check if tailwind.config exists
if [ -f "tailwind.config.js" ] || [ -f "tailwind.config.ts" ]; then
    echo -e "${GREEN}✓${NC} Tailwind config found"
else
    echo -e "${RED}✗${NC} tailwind.config.js not found"
    echo -e "  ${YELLOW}Install Tailwind:${NC} npm install -D tailwindcss postcss autoprefixer"
    exit 1
fi

# Check if tsconfig.json has path aliases
if [ -f "tsconfig.json" ]; then
    if grep -q '"@/\*"' tsconfig.json; then
        echo -e "${GREEN}✓${NC} Path aliases configured in tsconfig.json"
    else
        echo -e "${YELLOW}⚠${NC} Path aliases not found in tsconfig.json"
        echo "  Add to compilerOptions.paths:"
        echo '  "@/*": ["./src/*"]'
    fi
else
    echo -e "${YELLOW}⚠${NC} tsconfig.json not found (TypeScript not configured)"
fi

# Check if globals.css or equivalent exists
if [ -f "src/index.css" ] || [ -f "src/globals.css" ] || [ -f "app/globals.css" ]; then
    echo -e "${GREEN}✓${NC} Global CSS file found"
    
    # Check for Tailwind directives
    CSS_FILE=$(find . -not -path "*/node_modules/*" \( -name "globals.css" -o -name "index.css" \) | head -n 1)
    if grep -q "@tailwind base" "$CSS_FILE"; then
        echo -e "${GREEN}✓${NC} Tailwind directives present"
    else
        echo -e "${RED}✗${NC} Tailwind directives missing"
        echo "  Add to your CSS file:"
        echo "  @tailwind base;"
        echo "  @tailwind components;"
        echo "  @tailwind utilities;"
    fi
    
    # Check for CSS variables
    if grep -q "^:root" "$CSS_FILE" || grep -q "@layer base" "$CSS_FILE"; then
        echo -e "${GREEN}✓${NC} CSS variables defined"
    else
        echo -e "${YELLOW}⚠${NC} CSS variables not found"
        echo "  shadcn/ui requires CSS variables for theming"
    fi
else
    echo -e "${RED}✗${NC} Global CSS file not found"
fi

# Check if components/ui directory exists
if [ -d "src/components/ui" ] || [ -d "components/ui" ]; then
    echo -e "${GREEN}✓${NC} components/ui directory exists"
    
    # Count components
    COMPONENT_COUNT=$(find . -not -path "*/node_modules/*" \( -path "*/components/ui/*.tsx" -o -path "*/components/ui/*.jsx" \) | wc -l)
    echo -e "  ${COMPONENT_COUNT} components installed"
else
    echo -e "${YELLOW}⚠${NC} components/ui directory not found"
    echo "  Add your first component: npx shadcn@latest add button"
fi

# Check if lib/utils exists
if [ -f "src/lib/utils.ts" ] || [ -f "lib/utils.ts" ]; then
    echo -e "${GREEN}✓${NC} lib/utils.ts exists"
    
    # Check for cn function
    UTILS_FILE=$(find . -not -path "*/node_modules/*" -name "utils.ts" | grep "lib" | head -n 1)
    if grep -q "export function cn" "$UTILS_FILE"; then
        echo -e "${GREEN}✓${NC} cn() utility function present"
    else
        echo -e "${RED}✗${NC} cn() utility function missing"
    fi
else
    echo -e "${RED}✗${NC} lib/utils.ts not found"
fi

# Check package.json dependencies
if [ -f "package.json" ]; then
    echo ""
    echo "📦 Checking dependencies..."
    
    # Required dependencies
    REQUIRED_DEPS=("react" "tailwindcss")
    RECOMMENDED_DEPS=("class-variance-authority" "clsx" "tailwind-merge" "tailwindcss-animate")
    
    for dep in "${REQUIRED_DEPS[@]}"; do
        if grep -q "\"$dep\"" package.json; then
            echo -e "${GREEN}✓${NC} $dep installed"
        else
            echo -e "${RED}✗${NC} $dep not installed"
        fi
    done
    
    echo ""
    echo "Recommended dependencies:"
    for dep in "${RECOMMENDED_DEPS[@]}"; do
        if grep -q "\"$dep\"" package.json; then
            echo -e "${GREEN}✓${NC} $dep installed"
        else
            echo -e "${YELLOW}⚠${NC} $dep not installed (recommended)"
        fi
    done
fi

echo ""
echo -e "${GREEN}✓${NC} Setup verification complete!"
echo ""
echo "Next steps:"
echo "  1. Add components: npx shadcn@latest add [component]"
echo "  2. View catalog: npx shadcn@latest add --help"
echo "  3. Browse docs: https://ui.shadcn.com"
