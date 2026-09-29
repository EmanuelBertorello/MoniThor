#!/bin/bash
# ================================================================
# POLITICA MONITOR - Script de instalación automática
# ================================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        📡 PoliticaMonitor Setup        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js no encontrado. Instalalo desde https://nodejs.org (v18+)${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Se requiere Node.js 18+. Versión actual: $(node -v)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node -v) detectado${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm no encontrado${NC}"
    exit 1
fi

# ── Step 1: Backend env ───────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}📝 Paso 1: Configurando variables de entorno...${NC}"

if [ ! -f "backend/.env" ]; then
    cp backend/.env.example backend/.env
    echo -e "${GREEN}✅ backend/.env creado desde el template${NC}"
    echo -e "${YELLOW}⚠️  IMPORTANTE: Editá backend/.env con tus claves API antes de continuar${NC}"
else
    echo -e "${GREEN}✅ backend/.env ya existe${NC}"
fi

if [ ! -f "frontend/.env.local" ]; then
    cp frontend/.env.local.example frontend/.env.local
    echo -e "${GREEN}✅ frontend/.env.local creado${NC}"
fi

# ── Step 2: Install dependencies ──────────────────────────────────────────────
echo ""
echo -e "${YELLOW}📦 Paso 2: Instalando dependencias del backend...${NC}"
cd backend && npm install
echo -e "${GREEN}✅ Backend listo${NC}"

echo ""
echo -e "${YELLOW}📦 Instalando dependencias del frontend...${NC}"
cd ../frontend && npm install
echo -e "${GREEN}✅ Frontend listo${NC}"
cd ..

# ── Step 3: Database check ────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}🗄️  Paso 3: Base de datos...${NC}"
echo -e "${BLUE}Para desarrollo local necesitás PostgreSQL y Redis corriendo.${NC}"
echo -e "${BLUE}Opción rápida con Docker: docker-compose up postgres redis -d${NC}"
echo ""

read -p "¿Querés ejecutar las migraciones ahora? (s/n): " RUN_MIGRATE
if [ "$RUN_MIGRATE" = "s" ] || [ "$RUN_MIGRATE" = "S" ]; then
    cd backend
    echo "Ejecutando migraciones..."
    npx prisma migrate dev --name init || {
        echo -e "${RED}❌ Error en migración. Verificá que DATABASE_URL en backend/.env apunte a una DB válida${NC}"
        cd ..
        exit 1
    }
    echo "Ejecutando seed de datos demo..."
    node src/seed.js
    echo -e "${GREEN}✅ Base de datos lista con datos demo${NC}"
    cd ..
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ✅ INSTALACIÓN COMPLETA        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Para iniciar en desarrollo:${NC}"
echo "  Terminal 1: cd backend && npm run dev"
echo "  Terminal 2: cd frontend && npm run dev"
echo ""
echo -e "${BLUE}O con un solo comando (necesita concurrently):${NC}"
echo "  npm install && npm run dev"
echo ""
echo -e "${BLUE}Dashboard:${NC} http://localhost:3000"
echo -e "${BLUE}API:${NC}       http://localhost:4000"
echo -e "${BLUE}API Health:${NC} http://localhost:4000/health"
echo ""
echo -e "${YELLOW}Demo login:${NC} demo@politicamonitor.com / demo1234"
echo ""
