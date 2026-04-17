# ReimbursePro

A full-stack reimbursement management system built with Next.js, Prisma, and PostgreSQL. Supports multi-step approval workflows, OCR receipt parsing, Google Sheets export, PDF proof bundles, and role-based access control.

## Architecture

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Data Ingestion  │  │  Admin Config   │  │ Routing/Approval │
│  (OCR + Forms)   │──│  (Rules Engine) │──│  (Multi-step)    │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                     │
┌────────┴────────────────────┴─────────────────────┴────────┐
│                Consolidation + Reporting                    │
│               (Google Sheets, PDF Proofs)                   │
└────────────────────────────┬───────────────────────────────┘
                             │
┌────────────────────────────┴───────────────────────────────┐
│              Status, Log + Notification                     │
│          (Audit Trail, SSE, Email Digests)                  │
└────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma 7
- **Auth**: NextAuth v5 (Google OAuth + Credentials)
- **UI**: shadcn/ui v4, Tailwind CSS
- **OCR**: Google Vision API / Tesseract.js fallback
- **Export**: Google Sheets API / CSV fallback
- **PDF**: pdf-lib + QRCode
- **Email**: Resend
- **File Storage**: Vercel Blob / local /tmp fallback

## Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd reimbursement-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment file and fill in values:
   ```bash
   cp .env.example .env
   ```

4. Start PostgreSQL (Docker or local):
   ```bash
   docker run -d --name reimburse-db -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=reimbursement postgres:16
   ```

5. Run database migrations:
   ```bash
   npx prisma migrate dev
   ```

6. Seed the database:
   ```bash
   npx prisma db seed
   ```

7. Start the development server:
   ```bash
   npm run dev
   ```

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `NEXTAUTH_URL` | Base URL of the app (e.g., `http://localhost:3000`) | Yes |
| `NEXTAUTH_SECRET` | Random secret for JWT signing | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | For Google sign-in |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | For Google sign-in |
| `GOOGLE_VISION_API_KEY` | Google Cloud Vision API key | For OCR (falls back to Tesseract) |
| `GOOGLE_SHEETS_SERVICE_ACCOUNT` | JSON credentials for Sheets API | For Sheets export (falls back to CSV) |
| `GOOGLE_DRIVE_FOLDER_ID` | Drive folder ID for exported sheets | No |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage token | For file uploads (falls back to /tmp) |
| `RESEND_API_KEY` | Resend API key for email notifications | For email (falls back to in-app) |
| `CRON_SECRET` | Secret for authenticating cron endpoints | For scheduled jobs |

## Test Accounts

| Email | Role | Description |
|---|---|---|
| `employee@test.com` | EMPLOYEE | Submit and track reimbursement requests |
| `approver@test.com` | APPROVER | Review and approve/reject requests |
| `finance@test.com` | FINANCE | Mark approved requests as paid, generate reports |
| `admin@test.com` | ADMIN | Manage users, configure approval rules |

Use any password when signing in with credentials in development mode.

## API Routes

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/api/health` | Public | Health check |
| GET/POST | `/api/requests` | Employee | List own requests / Create request |
| GET | `/api/requests/[id]` | Owner, Approver, Finance, Admin | Get request details |
| PATCH | `/api/requests/[id]` | Owner (DRAFT only) | Update draft request |
| DELETE | `/api/requests/[id]` | Owner (DRAFT only) | Delete draft request |
| PATCH | `/api/requests/[id]/approve` | Approver with pending step | Approve request |
| PATCH | `/api/requests/[id]/reject` | Approver with pending step | Reject request |
| PATCH | `/api/requests/[id]/request-change` | Approver/Employee | Request changes |
| PATCH | `/api/requests/[id]/resubmit` | Owner | Resubmit after changes |
| PATCH | `/api/requests/[id]/mark-paid` | Finance, Admin | Mark as paid |
| GET | `/api/requests/[id]/audit-log` | Owner, Approver, Finance, Admin | View audit trail |
| GET | `/api/requests/[id]/status-timeline` | Owner, Approver, Finance, Admin | Status timeline |
| GET | `/api/requests/[id]/status-stream` | Any authenticated | SSE status updates |
| GET | `/api/requests/[id]/proof-bundle` | Owner, Finance, Admin | Download PDF proof |
| GET | `/api/approver/queue` | Approver, Finance, Admin | Approval queue |
| GET | `/api/reports/monthly` | Finance, Admin | Monthly report data |
| POST | `/api/reports/export-sheet` | Finance, Admin | Export to Sheets/CSV |
| GET/PUT | `/api/admin/config` | Admin | Get/update system config |
| GET/POST | `/api/admin/users` | Admin | List/create users |
| PATCH | `/api/admin/users/[id]` | Admin | Update user |
| GET | `/api/notifications` | Authenticated | List notifications |
| POST | `/api/notifications/mark-read` | Authenticated | Mark all as read |
| POST | `/api/notifications/send` | Admin | Send notification |
| POST | `/api/upload/receipt` | Authenticated | Upload receipt file |
| POST | `/api/ocr/parse` | Authenticated | Parse receipt via OCR |
| GET | `/api/files/[filename]` | Public | Serve uploaded files |
| GET | `/api/cron/digest-approver` | Cron (secret) | Daily approver digest |
| GET | `/api/cron/digest-finance` | Cron (secret) | Weekly finance digest |
| GET | `/api/cron/escalate` | Cron (secret) | Overdue escalation |
