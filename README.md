# Doctor Directory & Virtual Consultation Platform

Full-stack TypeScript healthcare platform for doctor discovery, appointments, profile management, subscriptions, and video consultation workflows.

## Tech Stack

- **Frontend:** React + Vite + TypeScript
- **Backend:** Node.js + Express + TypeScript + Zod
- **Database:** Prisma ORM (SQLite for local dev, PostgreSQL-ready schema)
- **Auth/Security:** JWT, role-based access control, Helmet, CORS

## Core Modules Implemented

- Multi-role authentication (Super Admin, Doctor, Clinic Admin, Patient)
- Doctor profile creation with SEO metadata and availability slots
- Doctor directory search with specialty, language, city, fee and experience filters
- Clinic creation and doctor assignment
- Appointment booking (video, in-clinic, phone)
- Appointment status lifecycle and conflict checks
- Review and rating system
- Subscription plans and enrollment endpoints
- Google Business sync integration placeholder endpoint
- Video consultation room generation endpoint
- Audit logs and basic admin analytics

## Monorepo Structure

```text
.
├── backend
│   ├── prisma
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src
│       ├── app.ts
│       ├── app.test.ts
│       └── index.ts
└── frontend
    └── src
        ├── App.tsx
        ├── api.ts
        └── types.ts
```

## Local Setup

1. Install dependencies at repo root:

   ```bash
   npm install
   ```

2. Configure environment files:

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

3. Initialize database:

   ```bash
   npm run prisma:generate -w backend
   npm run prisma:push -w backend
   npm run prisma:seed -w backend
   ```

4. Start backend and frontend together:

   ```bash
   npm run dev
   ```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Demo Credentials

- `admin@healthplatform.com` / `Password123!`
- `doctor@healthplatform.com` / `Password123!`
- `patient@healthplatform.com` / `Password123!`

## API Highlights

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/doctors`
- `GET /api/doctors/:slug`
- `POST /api/appointments`
- `GET /api/appointments`
- `PATCH /api/appointments/:appointmentId/status`
- `POST /api/video-sessions`
- `POST /api/google-business/sync`
- `GET /api/admin/analytics`

## Notes for Production

- Switch Prisma datasource to PostgreSQL/MySQL
- Integrate real Google OAuth + Google Business Profile APIs
- Replace mocked video URLs with WebRTC/Twilio/Agora provider tokens
- Add SMS/email reminder workers and queue processing
- Implement full HIPAA/GDPR policy workflows and retention controls
