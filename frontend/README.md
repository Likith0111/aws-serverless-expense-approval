# SpendGuard - Intelligent Expense Approval Portal

A production-grade React frontend application for the Serverless Intelligent Expense Approval Workflow backend. Built with React 18, TypeScript, Vite, and Tailwind CSS.

---

## Overview

SpendGuard provides a clean, enterprise-style interface for employees and managers to interact with the expense approval workflow system. The application features role-based access control, real-time expense tracking, and a streamlined approval process.

**Key Features:**
- User authentication (email + password, JWT-based)
- Employee expense submission and tracking
- Manager review and approval workflow
- Real-time status updates
- Responsive, modern UI design
- In-memory token storage (no browser persistence)

---

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool and dev server |
| Tailwind CSS | Utility-first styling |
| React Router | Client-side routing |
| Axios | HTTP client |
| JWT | Authentication tokens |

---

## Project Structure

```
frontend/
  src/
    components/
      ErrorBoundary.tsx      Global error boundary
      Sidebar.tsx            Navigation sidebar
      StatusBadge.tsx        Expense status indicator
    context/
      AuthContext.tsx        Authentication state management
    pages/
      LoginPage.tsx          User login
      RegisterPage.tsx       User registration
      DashboardPage.tsx      Overview and statistics
      NewExpensePage.tsx     Submit expense form
      MyExpensesPage.tsx     Employee expense list
      ReviewExpensesPage.tsx Manager review interface
      NotFoundPage.tsx       404 handler
    routes/
      ProtectedRoute.tsx     Route guard for authenticated users
      ManagerRoute.tsx       Route guard for manager role
    services/
      api.ts                 API client with interceptors
    types.ts                 TypeScript type definitions
    App.tsx                  Root component and routing
    main.tsx                 Entry point
    index.css                Global styles
```

---

## Authentication Flow

### Registration
1. User provides email, password, role (EMPLOYEE or MANAGER), and optional employee ID
2. Backend validates input and hashes password with bcrypt
3. User record stored in in-memory DynamoDB simulation
4. JWT token generated and returned
5. Token stored in React state (in-memory only, lost on refresh)

### Login
1. User provides email and password
2. Backend verifies credentials against stored hash
3. JWT token generated and returned
4. Token stored in React state
5. User redirected to dashboard

### Token Management
- **Storage**: In-memory React state only (no localStorage, no sessionStorage)
- **Expiration**: 7 days (handled by backend)
- **Refresh**: Not implemented (user must re-login after token expires)
- **Security**: Token cleared on logout or 401/403 responses

---

## Role-Based Access Control

### Employee Role
- Access to:
  - Dashboard (personal statistics)
  - Submit new expenses
  - View own expenses
- Cannot access:
  - Review/approval interface

### Manager Role
- All Employee permissions, plus:
  - View expenses pending manual review
  - Approve or reject flagged expenses
  - Access to review interface

### Route Protection
- `ProtectedRoute`: Requires authentication (any role)
- `ManagerRoute`: Requires authentication + MANAGER role
- Unauthenticated users redirected to `/login`
- Unauthorized managers redirected to `/dashboard`

---

## API Integration

### Base Configuration
- **Base URL**: `http://localhost:5050` (configurable via `VITE_API_URL`)
- **Authentication**: Bearer token in `Authorization` header
- **Error Handling**: Automatic 401/403 redirects to login

### Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/register` | POST | User registration |
| `/auth/login` | POST | User login |
| `/expense` | POST | Submit expense claim |
| `/expense/:id` | GET | Get expense details |
| `/expenses/employee/:id` | GET | List employee expenses (paginated) |
| `/expenses` | GET | List all expenses (for pending reviews) |
| `/expenses/:id/manual-decision` | POST | Manager approval/rejection |

### Request/Response Examples

**Register:**
```json
POST /auth/register
{
  "email": "user@company.com",
  "password": "secure123",
  "role": "EMPLOYEE",
  "employeeId": "EMP-001"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@company.com",
    "role": "EMPLOYEE",
    "employeeId": "EMP-001"
  }
}
```

**Submit Expense:**
```json
POST /expense
Authorization: Bearer <token>
{
  "employeeId": "EMP-001",
  "amount": 45.00,
  "category": "meals",
  "description": "Team lunch",
  "receiptProvided": true
}
```

---

## Local Development

### Prerequisites
- Node.js >= 18
- Backend server running on `http://localhost:5050`

### Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:3000` (or next available port).

### Environment Variables

Create `.env.local` (optional):

```env
VITE_API_URL=http://localhost:5050
```

### Build for Production

```bash
npm run build
```

Output: `dist/` directory (static files ready for deployment)

---

## UI/UX Design

### Design System
- **Primary Color**: Blue (`primary-600`)
- **Status Colors**:
  - Approved: Green
  - Rejected: Red
  - Pending Review: Yellow
  - Processing: Blue
- **Typography**: System font stack
- **Spacing**: Tailwind's default scale

### Responsive Breakpoints
- Mobile: < 768px (single column, stacked navigation)
- Tablet: 768px - 1024px
- Desktop: > 1024px (sidebar + main content)

### Key UI Components

**StatusBadge**: Color-coded expense status indicator
**Sidebar**: Persistent navigation with role-based menu items
**ErrorBoundary**: Catches React errors and displays fallback UI
**Form Validation**: Client-side validation with clear error messages

---

## Security Best Practices

### Implemented
- JWT tokens stored in-memory only (no browser storage)
- Password hashing handled by backend (bcrypt)
- Input sanitization via backend API
- Role-based route protection
- Automatic token clearing on 401/403
- HTTPS-ready (configure in production)

### Not Implemented (by design)
- Token refresh (user re-logs after expiration)
- Remember me functionality
- Password reset flow
- Two-factor authentication

---

## Free Tier Considerations

### Frontend Impact
- **No external services**: All API calls to local backend
- **Static hosting**: Can deploy to S3 + CloudFront (free tier eligible)
- **No CDN required**: Vite bundles assets efficiently
- **Minimal dependencies**: Small bundle size reduces bandwidth

### Backend Integration
- Frontend designed to work with free-tier backend
- Pagination implemented to limit data transfer
- Efficient state management reduces API calls
- Error handling prevents unnecessary retries

---

## Testing

### Manual Testing Checklist
- [ ] Register new user (EMPLOYEE role)
- [ ] Register new user (MANAGER role)
- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Submit expense claim
- [ ] View own expenses
- [ ] Filter expenses by status
- [ ] Manager: View pending reviews
- [ ] Manager: Approve expense
- [ ] Manager: Reject expense
- [ ] Logout clears auth state
- [ ] Protected routes redirect to login
- [ ] Manager routes redirect non-managers

### Browser Compatibility
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

---

## Deployment

### Static Hosting Options
1. **AWS S3 + CloudFront** (recommended for AWS project)
2. **Vercel** (zero-config)
3. **Netlify** (zero-config)
4. **GitHub Pages** (free)

### Build Output
```bash
npm run build
# Output: dist/ directory
```

### Environment Configuration
Set `VITE_API_URL` to production backend URL before building.

---

## Resume Bullet Points

- Architected and implemented a production-grade React frontend for an expense approval workflow system using React 18, TypeScript, Vite, and Tailwind CSS, demonstrating modern frontend development practices.

- Designed and implemented role-based access control with JWT authentication, in-memory token storage for enhanced security, and protected route components that enforce authorization at the component level.

- Built a comprehensive user interface with responsive design, real-time expense tracking, manager approval workflows, and intuitive status indicators, ensuring excellent user experience across devices.

- Integrated with a serverless backend API using Axios interceptors for automatic token injection, error handling, and 401/403 redirects, demonstrating full-stack integration expertise.

- Implemented TypeScript throughout the application with strict type checking, ensuring type safety across API calls, component props, and state management, reducing runtime errors.

- Created reusable UI components (StatusBadge, Sidebar, ErrorBoundary) and established a consistent design system using Tailwind CSS utility classes, promoting maintainability and design consistency.

- Designed and implemented a context-based authentication system with React hooks, providing centralized auth state management and seamless integration across all protected routes and components.
