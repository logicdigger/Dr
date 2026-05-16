import cookieParser from "cookie-parser";
import cors from "cors";
import dayjs from "dayjs";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import morgan from "morgan";
import {
  AppointmentStatus,
  AppointmentType,
  PrismaClient,
  Role,
  SubscriptionPlan,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";

dotenv.config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./prisma/dev.db";
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "development-secret";
}

const prisma = new PrismaClient();
const app = express();

const PORT = Number(process.env.PORT ?? 4000);
const JWT_SECRET = process.env.JWT_SECRET ?? "development-secret";
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:5173";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: Role;
      };
    }
  }
}

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  role: z.enum([Role.DOCTOR, Role.CLINIC_ADMIN, Role.PATIENT]),
  timezone: z.string().default("UTC"),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const doctorProfileSchema = z.object({
  qualifications: z.string().min(3),
  specialization: z.string().min(2),
  experienceYears: z.number().int().min(0).max(60),
  languages: z.array(z.string().min(2)).min(1),
  certifications: z.array(z.string()).optional(),
  consultationFee: z.number().int().min(0),
  services: z.array(z.string().min(2)).min(1),
  bio: z.string().min(20),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  customDomain: z.string().optional(),
  hasVideoConsultation: z.boolean().default(true),
  availabilities: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        timezone: z.string().default("UTC"),
      }),
    )
    .default([]),
});

const clinicSchema = z.object({
  name: z.string().min(2),
  slug: z
    .string()
    .min(3)
    .regex(/^[a-z0-9-]+$/),
  address: z.string().min(5),
  city: z.string().min(2),
  country: z.string().min(2),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const appointmentSchema = z.object({
  doctorId: z.string().cuid(),
  clinicId: z.string().cuid().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  type: z.nativeEnum(AppointmentType),
  reason: z.string().max(500).optional(),
});

const statusSchema = z.object({
  status: z.nativeEnum(AppointmentStatus),
  notes: z.string().optional(),
});

const reviewSchema = z.object({
  doctorId: z.string().cuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(3).max(500),
});

const subscriptionSchema = z.object({
  plan: z.nativeEnum(SubscriptionPlan),
});

const businessSyncSchema = z.object({
  doctorId: z.string().cuid(),
  externalId: z.string().min(3),
});

const videoSchema = z.object({
  appointmentId: z.string().cuid(),
  vendor: z.enum(["WEBRTC", "TWILIO", "AGORA"]),
});

const cleanSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const authTokenFor = (user: { id: string; email: string; role: Role }): string =>
  jwt.sign(user, JWT_SECRET, { expiresIn: "12h" });

const parseBearer = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (!header) {
    return null;
  }
  const [, token] = header.split(" ");
  return token ?? null;
};

const recordAuditLog = async (
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>,
): Promise<void> => {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId,
      metadataJson: metadata ? JSON.stringify(metadata) : null,
    },
  });
};

const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const token = parseBearer(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: Role;
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
  }
};

const allowRoles = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || !roles.includes(req.user.role)) {
    res.status(403).json({ error: "Insufficient permissions." });
    return;
  }
  next();
};

app.use(helmet());
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "doctor-directory-api", time: new Date().toISOString() });
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered." });
      return;
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const created = await prisma.user.create({
      data: {
        email: body.email,
        fullName: body.fullName,
        role: body.role,
        timezone: body.timezone,
        phone: body.phone,
        passwordHash,
      },
    });
    await prisma.subscription.create({
      data: {
        userId: created.id,
        plan: SubscriptionPlan.FREE,
      },
    });
    await recordAuditLog(created.id, "REGISTERED", "USER", created.id);
    res.status(201).json({
      token: authTokenFor({
        id: created.id,
        email: created.email,
        role: created.role,
      }),
      user: {
        id: created.id,
        email: created.email,
        fullName: created.fullName,
        role: created.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }
    await recordAuditLog(user.id, "LOGIN", "USER", user.id);
    res.json({
      token: authTokenFor({
        id: user.id,
        email: user.email,
        role: user.role,
      }),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        timezone: true,
        phone: true,
      },
    });
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

app.post("/api/doctors/profile", requireAuth, allowRoles(Role.DOCTOR), async (req, res, next) => {
  try {
    const body = doctorProfileSchema.parse(req.body);
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const profile = await prisma.doctorProfile.upsert({
      where: { userId: req.user!.id },
      update: {
        qualifications: body.qualifications,
        specialization: body.specialization,
        experienceYears: body.experienceYears,
        languages: body.languages.join(","),
        certifications: body.certifications?.join(",") ?? null,
        consultationFee: body.consultationFee,
        services: body.services.join(","),
        bio: body.bio,
        seoTitle: body.seoTitle,
        seoDescription: body.seoDescription,
        customDomain: body.customDomain,
        hasVideoConsultation: body.hasVideoConsultation,
      },
      create: {
        userId: req.user!.id,
        slug: cleanSlug(owner.fullName),
        qualifications: body.qualifications,
        specialization: body.specialization,
        experienceYears: body.experienceYears,
        languages: body.languages.join(","),
        certifications: body.certifications?.join(",") ?? null,
        consultationFee: body.consultationFee,
        services: body.services.join(","),
        bio: body.bio,
        seoTitle: body.seoTitle,
        seoDescription: body.seoDescription,
        customDomain: body.customDomain,
        hasVideoConsultation: body.hasVideoConsultation,
      },
    });

    await prisma.availabilitySlot.deleteMany({ where: { doctorId: profile.id } });
    if (body.availabilities.length > 0) {
      await prisma.availabilitySlot.createMany({
        data: body.availabilities.map((slot) => ({
          doctorId: profile.id,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          timezone: slot.timezone,
        })),
      });
    }
    await recordAuditLog(req.user!.id, "DOCTOR_PROFILE_SAVED", "DOCTOR_PROFILE", profile.id);
    res.json({ profileId: profile.id });
  } catch (error) {
    next(error);
  }
});

app.get("/api/doctors/profile/me", requireAuth, allowRoles(Role.DOCTOR), async (req, res, next) => {
  try {
    const profile = await prisma.doctorProfile.findUnique({
      where: { userId: req.user!.id },
      include: { availabilities: true },
    });
    if (!profile) {
      res.status(404).json({ error: "Profile not found." });
      return;
    }
    res.json({
      profile: {
        ...profile,
        languages: profile.languages.split(","),
        services: profile.services.split(","),
        certifications: profile.certifications ? profile.certifications.split(",") : [],
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/doctors", async (req, res, next) => {
  try {
    const specialty = req.query.specialty ? String(req.query.specialty) : undefined;
    const language = req.query.language ? String(req.query.language) : undefined;
    const minExperience = req.query.minExperience ? Number(req.query.minExperience) : undefined;
    const maxFee = req.query.maxFee ? Number(req.query.maxFee) : undefined;
    const city = req.query.city ? String(req.query.city) : undefined;

    const doctors = await prisma.doctorProfile.findMany({
      where: {
        ...(specialty ? { specialization: { contains: specialty, mode: "insensitive" } } : {}),
        ...(language ? { languages: { contains: language, mode: "insensitive" } } : {}),
        ...(minExperience ? { experienceYears: { gte: minExperience } } : {}),
        ...(maxFee ? { consultationFee: { lte: maxFee } } : {}),
      },
      include: {
        user: {
          select: { fullName: true },
        },
        reviews: true,
        clinicLinks: {
          include: {
            clinic: true,
          },
          where: city ? { clinic: { city: { contains: city, mode: "insensitive" } } } : undefined,
        },
      },
      orderBy: [{ isVerified: "desc" }, { updatedAt: "desc" }],
    });

    const output = doctors.map((doctor) => {
      const ratings = doctor.reviews.map((review) => review.rating);
      const averageRating =
        ratings.length > 0 ? ratings.reduce((acc, value) => acc + value, 0) / ratings.length : 0;
      return {
        id: doctor.id,
        slug: doctor.slug,
        fullName: doctor.user.fullName,
        specialization: doctor.specialization,
        experienceYears: doctor.experienceYears,
        languages: doctor.languages.split(","),
        consultationFee: doctor.consultationFee,
        services: doctor.services.split(","),
        hasVideoConsultation: doctor.hasVideoConsultation,
        averageRating: Number(averageRating.toFixed(1)),
        reviewCount: doctor.reviews.length,
        clinics: doctor.clinicLinks.map((link) => ({
          id: link.clinic.id,
          name: link.clinic.name,
          city: link.clinic.city,
          country: link.clinic.country,
        })),
      };
    });

    res.json({ doctors: output });
  } catch (error) {
    next(error);
  }
});

app.get("/api/doctors/:slug", async (req, res, next) => {
  try {
    const doctor = await prisma.doctorProfile.findUnique({
      where: { slug: req.params.slug },
      include: {
        user: {
          select: { fullName: true },
        },
        availabilities: true,
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        clinicLinks: {
          include: { clinic: true },
        },
      },
    });
    if (!doctor) {
      res.status(404).json({ error: "Doctor not found." });
      return;
    }

    const schemaMarkup = {
      "@context": "https://schema.org",
      "@type": "Physician",
      name: doctor.user.fullName,
      medicalSpecialty: doctor.specialization,
      description: doctor.bio,
      availableService: doctor.services.split(","),
      aggregateRating:
        doctor.reviews.length > 0
          ? {
              "@type": "AggregateRating",
              ratingValue:
                doctor.reviews.reduce((sum, review) => sum + review.rating, 0) / doctor.reviews.length,
              reviewCount: doctor.reviews.length,
            }
          : undefined,
    };

    res.json({
      doctor: {
        id: doctor.id,
        slug: doctor.slug,
        fullName: doctor.user.fullName,
        specialization: doctor.specialization,
        qualifications: doctor.qualifications,
        experienceYears: doctor.experienceYears,
        languages: doctor.languages.split(","),
        certifications: doctor.certifications ? doctor.certifications.split(",") : [],
        consultationFee: doctor.consultationFee,
        services: doctor.services.split(","),
        bio: doctor.bio,
        hasVideoConsultation: doctor.hasVideoConsultation,
        customDomain: doctor.customDomain,
        availabilities: doctor.availabilities,
        reviews: doctor.reviews,
        clinics: doctor.clinicLinks.map((link) => link.clinic),
        seo: {
          title: doctor.seoTitle,
          description: doctor.seoDescription,
          schemaMarkup,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/clinics", requireAuth, allowRoles(Role.CLINIC_ADMIN, Role.SUPER_ADMIN), async (req, res, next) => {
  try {
    const body = clinicSchema.parse(req.body);
    const clinic = await prisma.clinic.create({
      data: {
        ...body,
        managerId: req.user!.id,
      },
    });
    await recordAuditLog(req.user!.id, "CLINIC_CREATED", "CLINIC", clinic.id);
    res.status(201).json({ clinic });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/clinics/:clinicId/doctors/:doctorId",
  requireAuth,
  allowRoles(Role.CLINIC_ADMIN, Role.SUPER_ADMIN),
  async (req, res, next) => {
    try {
      const clinicId = String(req.params.clinicId);
      const doctorId = String(req.params.doctorId);
      const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
      if (clinic.managerId !== req.user!.id && req.user!.role !== Role.SUPER_ADMIN) {
        res.status(403).json({ error: "Only clinic owner can assign doctors." });
        return;
      }
      const linked = await prisma.clinicDoctor.upsert({
        where: {
          clinicId_doctorId: {
            clinicId,
            doctorId,
          },
        },
        create: {
          clinicId,
          doctorId,
          department: req.body.department ?? null,
        },
        update: {
          department: req.body.department ?? null,
        },
      });
      await recordAuditLog(req.user!.id, "DOCTOR_ASSIGNED_TO_CLINIC", "CLINIC", clinic.id, {
        doctorId,
      });
      res.json({ linked });
    } catch (error) {
      next(error);
    }
  },
);

app.post("/api/appointments", requireAuth, allowRoles(Role.PATIENT), async (req, res, next) => {
  try {
    const body = appointmentSchema.parse(req.body);
    if (new Date(body.startAt) >= new Date(body.endAt)) {
      res.status(400).json({ error: "Appointment end time must be after start time." });
      return;
    }

    const overlap = await prisma.appointment.findFirst({
      where: {
        doctorId: body.doctorId,
        status: {
          in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
        },
        OR: [
          {
            startAt: { lte: new Date(body.startAt) },
            endAt: { gt: new Date(body.startAt) },
          },
          {
            startAt: { lt: new Date(body.endAt) },
            endAt: { gte: new Date(body.endAt) },
          },
        ],
      },
    });

    if (overlap) {
      res.status(409).json({ error: "This timeslot is unavailable." });
      return;
    }

    const appointment = await prisma.appointment.create({
      data: {
        doctorId: body.doctorId,
        patientId: req.user!.id,
        clinicId: body.clinicId,
        startAt: new Date(body.startAt),
        endAt: new Date(body.endAt),
        type: body.type,
        reason: body.reason,
      },
    });
    await recordAuditLog(req.user!.id, "APPOINTMENT_CREATED", "APPOINTMENT", appointment.id);
    res.status(201).json({ appointment });
  } catch (error) {
    next(error);
  }
});

app.get("/api/appointments", requireAuth, async (req, res, next) => {
  try {
    const whereClause =
      req.user!.role === Role.DOCTOR
        ? { doctor: { is: { userId: req.user!.id } } }
        : req.user!.role === Role.PATIENT
          ? { patientId: req.user!.id }
          : {};

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        doctor: {
          include: {
            user: {
              select: { fullName: true },
            },
          },
        },
        patient: {
          select: { fullName: true, email: true },
        },
        clinic: true,
        videoSession: true,
      },
      orderBy: { startAt: "asc" },
    });

    res.json({ appointments });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/appointments/:appointmentId/status", requireAuth, async (req, res, next) => {
  try {
    const body = statusSchema.parse(req.body);
    const appointmentId = String(req.params.appointmentId);
    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: {
        doctor: true,
      },
    });

    const canUpdate =
      req.user!.role === Role.SUPER_ADMIN ||
      (req.user!.role === Role.DOCTOR && appointment.doctor.userId === req.user!.id) ||
      (req.user!.role === Role.PATIENT && appointment.patientId === req.user!.id);
    if (!canUpdate) {
      res.status(403).json({ error: "You cannot update this appointment." });
      return;
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: body.status,
        notes: body.notes,
      },
    });
    await recordAuditLog(req.user!.id, "APPOINTMENT_STATUS_UPDATED", "APPOINTMENT", appointment.id, {
      status: body.status,
    });
    res.json({ appointment: updated });
  } catch (error) {
    next(error);
  }
});

app.post("/api/reviews", requireAuth, allowRoles(Role.PATIENT), async (req, res, next) => {
  try {
    const body = reviewSchema.parse(req.body);
    const reviewer = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const review = await prisma.review.create({
      data: {
        doctorId: body.doctorId,
        rating: body.rating,
        comment: body.comment,
        patientName: reviewer.fullName,
      },
    });
    await recordAuditLog(req.user!.id, "REVIEW_CREATED", "REVIEW", review.id);
    res.status(201).json({ review });
  } catch (error) {
    next(error);
  }
});

app.get("/api/subscriptions/plans", (_req, res) => {
  res.json({
    plans: [
      {
        key: SubscriptionPlan.FREE,
        title: "Free",
        price: 0,
        features: ["Basic profile", "Standard listing"],
      },
      {
        key: SubscriptionPlan.PREMIUM,
        title: "Premium",
        price: 29,
        features: ["Video consultations", "Analytics", "Priority ranking"],
      },
      {
        key: SubscriptionPlan.FEATURED,
        title: "Featured",
        price: 79,
        features: ["Homepage promotion", "Sponsored placement", "SEO add-ons"],
      },
    ],
  });
});

app.post("/api/subscriptions/subscribe", requireAuth, async (req, res, next) => {
  try {
    const body = subscriptionSchema.parse(req.body);
    const subscription = await prisma.subscription.create({
      data: {
        userId: req.user!.id,
        plan: body.plan,
        renewsAt: dayjs().add(30, "day").toDate(),
      },
    });
    await recordAuditLog(req.user!.id, "SUBSCRIPTION_CHANGED", "SUBSCRIPTION", subscription.id, {
      plan: body.plan,
    });
    res.status(201).json({ subscription });
  } catch (error) {
    next(error);
  }
});

app.post("/api/google-business/sync", requireAuth, allowRoles(Role.DOCTOR), async (req, res, next) => {
  try {
    const body = businessSyncSchema.parse(req.body);
    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { id: body.doctorId } });
    if (profile.userId !== req.user!.id) {
      res.status(403).json({ error: "Cannot sync another doctor's profile." });
      return;
    }
    const sync = await prisma.businessProfileSync.create({
      data: {
        doctorId: body.doctorId,
        provider: "GOOGLE_BUSINESS_PROFILE",
        externalId: body.externalId,
        lastSyncedAt: new Date(),
        statusMessage: "Published listing details via OAuth token.",
      },
    });
    await recordAuditLog(req.user!.id, "GOOGLE_PROFILE_SYNCED", "BUSINESS_PROFILE_SYNC", sync.id);
    res.json({
      sync,
      message:
        "Google Business Profile sync simulated. Integrate Google OAuth and Business Profile API credentials to enable live publishing.",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/video-sessions", requireAuth, allowRoles(Role.DOCTOR), async (req, res, next) => {
  try {
    const body = videoSchema.parse(req.body);
    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: body.appointmentId },
      include: { doctor: true },
    });
    if (appointment.doctor.userId !== req.user!.id) {
      res.status(403).json({ error: "Only assigned doctor can create session." });
      return;
    }
    if (appointment.type !== AppointmentType.VIDEO) {
      res.status(400).json({ error: "Video sessions are only available for video appointments." });
      return;
    }

    const session = await prisma.videoSession.upsert({
      where: { appointmentId: appointment.id },
      update: {
        vendor: body.vendor,
      },
      create: {
        appointmentId: appointment.id,
        doctorId: appointment.doctorId,
        vendor: body.vendor,
        roomName: `room-${appointment.id}`,
        joinUrl: `https://video.example.com/join/room-${appointment.id}`,
      },
    });
    await recordAuditLog(req.user!.id, "VIDEO_SESSION_CREATED", "VIDEO_SESSION", session.id);
    res.status(201).json({ session });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/analytics", requireAuth, allowRoles(Role.SUPER_ADMIN), async (_req, res, next) => {
  try {
    const [doctorCount, patientCount, appointmentCount, videoSessionsCount, premiumCount] = await Promise.all([
      prisma.user.count({ where: { role: Role.DOCTOR } }),
      prisma.user.count({ where: { role: Role.PATIENT } }),
      prisma.appointment.count(),
      prisma.videoSession.count(),
      prisma.subscription.count({
        where: { plan: { in: [SubscriptionPlan.PREMIUM, SubscriptionPlan.FEATURED] }, active: true },
      }),
    ]);

    res.json({
      analytics: {
        doctorCount,
        patientCount,
        appointmentCount,
        videoSessionsCount,
        premiumCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Validation error", details: error.flatten() });
    return;
  }

  if (error instanceof Error) {
    res.status(500).json({
      error: error.message,
    });
    return;
  }

  res.status(500).json({ error: "Unknown server error." });
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export { PORT };
export default app;
