# 💻 Development Guide - NodePilot

Guide for developers who want to contribute or modify NodePilot.

## Development Environment Setup

### Prerequisites

- Node.js 18+ installed
- Git installed
- Code editor (VS Code recommended)
- Basic knowledge of TypeScript, React, and Node.js

### Initial Setup

```bash
# Clone repository
git clone <your-repo>
cd NodePilot

# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Return to root
cd ..
```

### Environment Configuration

```bash
# Backend environment
cd backend
cp .env.example .env

# Edit .env with your values
# For development, defaults are fine
nano .env
```

### Running in Development Mode

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```
Backend runs on: http://localhost:3001

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
Frontend runs on: http://localhost:3000

### First Login

- Username: `admin` (or whatever you set in .env)
- Password: `admin123` (or whatever you set in .env)

---

## Project Structure Explained

### Backend (`/backend`)

```
backend/
├── src/
│   ├── index.ts              # Server entry point
│   ├── routes/               # API routes
│   │   ├── auth.ts          # /api/auth/* endpoints
│   │   ├── projects.ts      # /api/project/* endpoints
│   │   └── system.ts        # /api/system/* endpoints
│   ├── services/            # Business logic
│   │   ├── pm2Service.ts    # PM2 operations
│   │   └── deploymentService.ts  # Deployment logic
│   ├── middleware/          # Express/Fastify middleware
│   │   └── auth.ts         # JWT authentication
│   └── utils/              # Utilities
│       └── database.ts     # SQLite setup
├── package.json
├── tsconfig.json
└── .env                    # Environment variables
```

### Frontend (`/frontend`)

```
frontend/
├── app/                    # Next.js 14 App Router
│   ├── login/             # Login page
│   ├── dashboard/         # Dashboard page
│   ├── projects/          # Projects section
│   │   ├── page.tsx      # List projects
│   │   ├── create/       # Create project
│   │   └── [id]/         # Project details
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Home/redirect
│   └── globals.css       # Global styles
├── components/
│   └── ui/               # ShadCN components
├── lib/
│   ├── api.ts           # Axios API client
│   └── utils.ts         # Utility functions
└── package.json
```

---

## Adding New Features

### Adding a New API Endpoint

**1. Create route handler in backend:**

```typescript
// backend/src/routes/myFeature.ts
import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';

export default async function myFeatureRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/my-endpoint', async (request, reply) => {
    // Your logic here
    return { message: 'Hello!' };
  });
}
```

**2. Register route in index.ts:**

```typescript
// backend/src/index.ts
import myFeatureRoutes from './routes/myFeature';

// Inside start() function:
await fastify.register(myFeatureRoutes, { prefix: '/api/my-feature' });
```

**3. Test endpoint:**
```bash
curl http://localhost:3001/api/my-feature/my-endpoint \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Adding a New Frontend Page

**1. Create page component:**

```typescript
// frontend/app/my-page/page.tsx
'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function MyPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    async function fetchData() {
      const response = await api.get('/my-feature/my-endpoint');
      setData(response.data);
    }
    fetchData();
  }, []);

  return (
    <div>
      <h1>My Page</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
```

**2. Add navigation link:**

```typescript
// In your navigation component
<Link href="/my-page">
  <Button>My Feature</Button>
</Link>
```

### Adding a New UI Component

```typescript
// frontend/components/ui/my-component.tsx
import { cn } from '@/lib/utils';

interface MyComponentProps {
  title: string;
  className?: string;
}

export function MyComponent({ title, className }: MyComponentProps) {
  return (
    <div className={cn('p-4 border rounded', className)}>
      <h2>{title}</h2>
    </div>
  );
}
```

---

## Database Changes

### Adding a New Table

```typescript
// backend/src/utils/database.ts

// Add to initDatabase() function:
db.exec(`
  CREATE TABLE IF NOT EXISTS my_table (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
```

### Adding a New Column

```typescript
// Add migration in initDatabase():
try {
  db.exec(`ALTER TABLE projects ADD COLUMN new_field TEXT`);
} catch (error) {
  // Column might already exist
}
```

---

## Testing

### Manual API Testing with cURL

```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Save the token
TOKEN="your-jwt-token-here"

# Test authenticated endpoint
curl http://localhost:3001/api/project/list \
  -H "Authorization: Bearer $TOKEN"
```

### Testing File Upload

```bash
# Create project
curl -X POST http://localhost:3001/api/project/create \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/project.zip" \
  -F "projectName=test-app" \
  -F "displayName=Test App" \
  -F "startCommand=npm start"
```

---

## Common Development Tasks

### Reset Database

```bash
cd backend
rm deployer.db
npm run db:init
```

### View PM2 Logs

```bash
pm2 logs
pm2 logs nodepilot-my-project
```

### Clear PM2 Processes

```bash
pm2 delete all
pm2 save --force
```

### Rebuild Frontend

```bash
cd frontend
rm -rf .next
npm run build
```

### Check TypeScript Errors

```bash
# Backend
cd backend
npx tsc --noEmit

# Frontend
cd frontend
npx tsc --noEmit
```

---

## Debugging Tips

### Backend Debugging

**Enable verbose logging:**
```typescript
// backend/src/index.ts
const fastify = Fastify({
  logger: {
    level: 'debug', // Change to 'debug'
  },
});
```

**Use VS Code debugger:**

Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/backend/src/index.ts",
      "preLaunchTask": "tsc: build - backend/tsconfig.json",
      "outFiles": ["${workspaceFolder}/backend/dist/**/*.js"]
    }
  ]
}
```

### Frontend Debugging

**Use React Developer Tools:**
- Install Chrome extension
- Inspect component props/state

**Console logging:**
```typescript
console.log('Debug:', { data, state, props });
```

**Network debugging:**
- Open Chrome DevTools → Network tab
- Filter by "XHR" to see API calls

---

## Code Style Guidelines

### TypeScript

- Use TypeScript strict mode
- Define interfaces for data structures
- Avoid `any` type
- Use async/await over promises

```typescript
// Good
interface Project {
  id: number;
  name: string;
}

async function getProject(id: number): Promise<Project> {
  const result = await api.get(`/project/${id}`);
  return result.data;
}

// Bad
async function getProject(id: any) {
  return api.get(`/project/${id}`).then(r => r.data);
}
```

### React Components

- Use functional components
- Use TypeScript interfaces for props
- Destructure props
- Use hooks properly

```typescript
interface MyComponentProps {
  title: string;
  count: number;
  onUpdate: (value: number) => void;
}

export function MyComponent({ title, count, onUpdate }: MyComponentProps) {
  const [state, setState] = useState(count);
  
  useEffect(() => {
    onUpdate(state);
  }, [state, onUpdate]);

  return <div>{title}: {state}</div>;
}
```

### API Routes

- Use proper HTTP methods
- Return consistent response format
- Handle errors properly
- Validate input

```typescript
fastify.post('/endpoint', async (request, reply) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
    });
    
    const data = schema.parse(request.body);
    
    // Process data
    const result = await doSomething(data);
    
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid input',
        details: error.errors,
      });
    }
    throw error;
  }
});
```

---

## Git Workflow

### Branch Strategy

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes
git add .
git commit -m "feat: add my feature"

# Push to remote
git push origin feature/my-feature

# Create pull request on GitHub
```

### Commit Message Convention

```
feat: add new feature
fix: fix bug
docs: update documentation
style: format code
refactor: refactor code
test: add tests
chore: update dependencies
```

---

## Performance Optimization

### Backend

- Use prepared statements for database queries
- Implement caching for frequently accessed data
- Use PM2 cluster mode for CPU-intensive tasks
- Optimize SQL queries

### Frontend

- Use Next.js Image component
- Implement code splitting
- Lazy load components
- Minimize bundle size

---

## Deployment

### Development → Production Checklist

- [ ] Change JWT_SECRET in .env
- [ ] Change ADMIN_PASSWORD in .env
- [ ] Set NODE_ENV=production
- [ ] Build backend: `npm run build`
- [ ] Build frontend: `npm run build`
- [ ] Test on staging server
- [ ] Setup Nginx reverse proxy
- [ ] Enable SSL with Let's Encrypt
- [ ] Setup firewall (UFW)
- [ ] Configure PM2 startup
- [ ] Setup monitoring/logging

---

## Useful Commands Reference

```bash
# Development
npm run dev:backend      # Start backend dev server
npm run dev:frontend     # Start frontend dev server
npm run dev             # Start both (with concurrently)

# Building
npm run build:backend   # Build backend
npm run build:frontend  # Build frontend
npm run build          # Build both

# Production
npm run start:backend   # Start backend (production)
npm run start:frontend  # Start frontend (production)

# Database
cd backend && npm run db:init  # Initialize/reset database

# PM2
pm2 list               # List processes
pm2 logs               # View logs
pm2 restart all        # Restart all
pm2 stop all           # Stop all
pm2 delete all         # Delete all
pm2 save               # Save config
```

---

## Resources

- **Fastify Docs**: https://www.fastify.io/docs/latest/
- **Next.js Docs**: https://nextjs.org/docs
- **PM2 Docs**: https://pm2.keymetrics.io/docs/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **ShadCN UI**: https://ui.shadcn.com/
- **SQLite**: https://www.sqlite.org/docs.html

---

## Getting Help

- Read the documentation files (README.md, ARCHITECTURE.md, etc.)
- Check existing issues on GitHub
- Use console.log for debugging
- Test API endpoints with cURL or Postman
- Check PM2 logs for runtime errors

---

**Happy Coding! 🚀**
