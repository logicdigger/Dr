# Garment Production Manager

A lightweight production management app for job-work garment units.

This app is designed for units like:
- 7 sewing machines
- 2 overlock machines
- 1 folding station

It focuses on the highest-value workflows:
1. Piece tracking by stage
2. Worker earnings and payment ledger

## Features

### 1) Customer Orders
- Party name
- Order number
- Style name
- Quantity
- Delivery date
- Rate per piece
- Total value

### 2) Production Tracking
Track stage movement with **In / Out / Balance**:
- Cutting
- Stitching
- Overlock
- Folding
- Packed

### 3) Worker Management
Store worker profile and rate setup:
- Name
- Mobile number
- Process
- Per-piece rate
- Opening balance
- Work assigned

Auto-calculated:
- Work completed
- Earnings

### 4) Daily Production Entry
Capture daily job completion:
- Date
- Order
- Worker
- Process
- Quantity completed

### 5) Payment Ledger
Track for each worker:
- Opening balance
- Earned amount
- Advance paid
- Pending payment

### 6) Fabric & Accessories (Optional)
- Fabric/thread/accessory entries
- Received quantity
- Consumed quantity
- Wastage

### 7) Reports
- Order-wise production status
- Worker-wise earnings
- Pending pieces
- Delivery status
- Revenue, labor cost, and estimated profit

## Tech Stack

- Frontend: React + Vite + TypeScript
- Backend: Supabase (PostgreSQL + Auth + RLS)
- Hosting: Vercel (recommended)

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure env:

```bash
cp .env.example .env
```

Set the real values:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

3. Create Supabase tables:
- Open Supabase SQL editor
- Run `supabase/schema.sql`

4. Start the app:

```bash
npm run dev
```

5. Build for production:

```bash
npm run build
```

## Supabase Setup Notes

- The schema enables Row Level Security (RLS) on all tables.
- Policies allow authenticated users to read and write records.
- For production, tighten policies by organization/factory user scope.

## Suggested Next Additions

- QR code on bundles
- Attendance tracking
- WhatsApp daily production report export
- Barcode scanning
- GST invoice generation
