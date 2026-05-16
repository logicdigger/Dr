export type UserRole = "SUPER_ADMIN" | "DOCTOR" | "CLINIC_ADMIN" | "PATIENT";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface LoginResponse {
  token: string;
  user: SessionUser;
}

export interface DoctorCard {
  id: string;
  slug: string;
  fullName: string;
  specialization: string;
  experienceYears: number;
  languages: string[];
  consultationFee: number;
  services: string[];
  hasVideoConsultation: boolean;
  averageRating: number;
  reviewCount: number;
  clinics: Array<{
    id: string;
    name: string;
    city: string;
    country: string;
  }>;
}

export interface DoctorDetails {
  id: string;
  slug: string;
  fullName: string;
  specialization: string;
  qualifications: string;
  experienceYears: number;
  languages: string[];
  certifications: string[];
  consultationFee: number;
  services: string[];
  bio: string;
  hasVideoConsultation: boolean;
  customDomain?: string;
  availabilities: Array<{
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    timezone: string;
  }>;
  reviews: Array<{
    id: string;
    patientName: string;
    rating: number;
    comment: string;
    createdAt: string;
  }>;
  clinics: Array<{
    id: string;
    name: string;
    address: string;
    city: string;
    country: string;
  }>;
}

export interface AppointmentRecord {
  id: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  startAt: string;
  endAt: string;
  type: "VIDEO" | "IN_CLINIC" | "PHONE";
  reason?: string;
  notes?: string;
  doctor: {
    user: {
      fullName: string;
    };
  };
  patient: {
    fullName: string;
    email: string;
  };
  clinic?: {
    name: string;
    city: string;
  };
  videoSession?: {
    joinUrl: string;
    vendor: string;
  };
}
