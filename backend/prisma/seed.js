import bcrypt from "bcryptjs";
import { PrismaClient, Role, SubscriptionPlan } from "@prisma/client";
const prisma = new PrismaClient();
async function seed() {
    const passwordHash = await bcrypt.hash("Password123!", 10);
    const admin = await prisma.user.upsert({
        where: { email: "admin@healthplatform.com" },
        update: {},
        create: {
            email: "admin@healthplatform.com",
            fullName: "Platform Admin",
            role: Role.SUPER_ADMIN,
            passwordHash,
        },
    });
    const doctorUser = await prisma.user.upsert({
        where: { email: "doctor@healthplatform.com" },
        update: {},
        create: {
            email: "doctor@healthplatform.com",
            fullName: "Dr. Emma Carter",
            role: Role.DOCTOR,
            timezone: "Asia/Kolkata",
            passwordHash,
        },
    });
    const patientUser = await prisma.user.upsert({
        where: { email: "patient@healthplatform.com" },
        update: {},
        create: {
            email: "patient@healthplatform.com",
            fullName: "John Walker",
            role: Role.PATIENT,
            timezone: "Europe/London",
            passwordHash,
        },
    });
    const doctor = await prisma.doctorProfile.upsert({
        where: { userId: doctorUser.id },
        update: {},
        create: {
            userId: doctorUser.id,
            slug: "dr-emma-carter",
            qualifications: "MBBS, MD (Internal Medicine)",
            specialization: "Internal Medicine",
            experienceYears: 11,
            languages: "English,Hindi",
            certifications: "Board Certified Physician",
            consultationFee: 45,
            services: "Diabetes Care,Hypertension Management,General Wellness",
            bio: "Experienced physician focused on preventive and chronic care.",
            seoTitle: "Dr Emma Carter | Internal Medicine Specialist",
            seoDescription: "Book online and in-clinic consultations with Dr Emma Carter.",
            isVerified: true,
            hasVideoConsultation: true,
        },
    });
    await prisma.availabilitySlot.deleteMany({
        where: { doctorId: doctor.id },
    });
    await prisma.availabilitySlot.createMany({
        data: [
            {
                doctorId: doctor.id,
                dayOfWeek: 1,
                startTime: "09:00",
                endTime: "13:00",
                timezone: "Asia/Kolkata",
            },
            {
                doctorId: doctor.id,
                dayOfWeek: 3,
                startTime: "14:00",
                endTime: "18:00",
                timezone: "Asia/Kolkata",
            },
        ],
    });
    await prisma.review.deleteMany({
        where: { doctorId: doctor.id },
    });
    await prisma.review.createMany({
        data: [
            {
                doctorId: doctor.id,
                patientName: "A. Sharma",
                rating: 5,
                comment: "Very patient and clear treatment plan.",
            },
            {
                doctorId: doctor.id,
                patientName: "K. Rao",
                rating: 4,
                comment: "Helpful consultation and easy booking process.",
            },
        ],
    });
    const existingPremium = await prisma.subscription.findFirst({
        where: { userId: doctorUser.id, plan: SubscriptionPlan.PREMIUM, active: true },
    });
    if (!existingPremium) {
        await prisma.subscription.create({
            data: {
                userId: doctorUser.id,
                plan: SubscriptionPlan.PREMIUM,
                renewsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
            },
        });
    }
    await prisma.auditLog.create({
        data: {
            actorId: admin.id,
            action: "SEED_DATA_CREATED",
            entityType: "SYSTEM",
            entityId: "seed",
            metadataJson: JSON.stringify({
                seededDoctorId: doctor.id,
                seededPatientId: patientUser.id,
            }),
        },
    });
}
seed()
    .then(async () => {
    await prisma.$disconnect();
})
    .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
});
