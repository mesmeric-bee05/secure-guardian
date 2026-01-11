import { z } from 'zod';

// Auth schemas
export const loginSchema = z.object({
  email: z.string()
    .trim()
    .email({ message: 'Please enter a valid email address' })
    .max(255, { message: 'Email must be less than 255 characters' }),
  password: z.string()
    .min(8, { message: 'Password must be at least 8 characters' })
    .max(128, { message: 'Password must be less than 128 characters' }),
});

export const signupSchema = z.object({
  fullName: z.string()
    .trim()
    .min(2, { message: 'Name must be at least 2 characters' })
    .max(100, { message: 'Name must be less than 100 characters' }),
  email: z.string()
    .trim()
    .email({ message: 'Please enter a valid email address' })
    .max(255, { message: 'Email must be less than 255 characters' }),
  password: z.string()
    .min(8, { message: 'Password must be at least 8 characters' })
    .max(128, { message: 'Password must be less than 128 characters' })
    .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
    .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
    .regex(/[0-9]/, { message: 'Password must contain at least one number' }),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

// Profile schema
export const profileSchema = z.object({
  fullName: z.string()
    .trim()
    .min(2, { message: 'Name must be at least 2 characters' })
    .max(100, { message: 'Name must be less than 100 characters' }),
  phoneNumber: z.string()
    .regex(/^\+?[0-9]{10,15}$/, { message: 'Please enter a valid phone number' })
    .optional()
    .or(z.literal('')),
  bloodType: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''])
    .optional(),
  allergies: z.string().optional(),
  medicalConditions: z.string().optional(),
  dateOfBirth: z.string().optional(),
  preferredLanguage: z.enum(['en', 'sw']).default('en'),
});

// Emergency contact schema
export const emergencyContactSchema = z.object({
  name: z.string()
    .trim()
    .min(2, { message: 'Name must be at least 2 characters' })
    .max(100, { message: 'Name must be less than 100 characters' }),
  phoneNumber: z.string()
    .regex(/^\+?[0-9]{10,15}$/, { message: 'Please enter a valid phone number' }),
  relationship: z.string()
    .max(50, { message: 'Relationship must be less than 50 characters' })
    .optional(),
  isPrimary: z.boolean().default(false),
});

// Emergency case schema
export const emergencyCaseSchema = z.object({
  symptoms: z.string()
    .trim()
    .min(10, { message: 'Please describe symptoms in at least 10 characters' })
    .max(1000, { message: 'Description must be less than 1000 characters' }),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  address: z.string().max(500).optional(),
});

// Chat message schema
export const chatMessageSchema = z.object({
  content: z.string()
    .trim()
    .min(1, { message: 'Message cannot be empty' })
    .max(2000, { message: 'Message must be less than 2000 characters' }),
});

// Facility schema
export const facilitySchema = z.object({
  name: z.string()
    .trim()
    .min(2, { message: 'Name must be at least 2 characters' })
    .max(200, { message: 'Name must be less than 200 characters' }),
  facilityType: z.enum(['hospital', 'clinic', 'pharmacy', 'health_center']),
  address: z.string()
    .trim()
    .min(5, { message: 'Address must be at least 5 characters' })
    .max(500, { message: 'Address must be less than 500 characters' }),
  city: z.string()
    .trim()
    .min(2, { message: 'City must be at least 2 characters' })
    .max(100, { message: 'City must be less than 100 characters' }),
  region: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  phoneNumber: z.string()
    .regex(/^\+?[0-9]{10,15}$/, { message: 'Please enter a valid phone number' })
    .optional()
    .or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  services: z.array(z.string()).optional(),
  is24Hours: z.boolean().default(false),
  hasAmbulance: z.boolean().default(false),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof signupSchema>;
export type ProfileFormData = z.infer<typeof profileSchema>;
export type EmergencyContactFormData = z.infer<typeof emergencyContactSchema>;
export type EmergencyCaseFormData = z.infer<typeof emergencyCaseSchema>;
export type ChatMessageFormData = z.infer<typeof chatMessageSchema>;
export type FacilityFormData = z.infer<typeof facilitySchema>;
