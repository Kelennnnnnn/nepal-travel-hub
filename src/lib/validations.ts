import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const signUpSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const agencySignUpSchema = signUpSchema.extend({
  agencyName: z.string().min(2, "Agency name is required"),
});

export const listingFormSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(50, "Description must be at least 50 characters"),
  category: z.enum(["Trekking", "Adventure", "Cultural", "Wildlife", "Rafting", "Mountaineering", "Wellness", "Photography"]),
  location: z.string().min(2, "Location is required"),
  price: z.coerce.number().positive("Price must be greater than 0"),
  duration: z.string().min(1, "Duration is required"),
  max_participants: z.coerce.number().int().min(1, "At least 1 participant"),
  difficulty: z.enum(["Easy", "Moderate", "Challenging", "Difficult", "Expert"]),
  images: z.array(z.string()).min(1, "At least one image is required"),
  includes: z.array(z.string()),
  excludes: z.array(z.string()),
});

export const onboardingSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  registrationNumber: z.string().min(1, "Registration number is required"),
  panNumber: z.string().min(1, "PAN number is required"),
  address: z.string().min(5, "Address is required"),
  city: z.string().min(2, "City is required"),
  district: z.string().min(2, "District is required"),
  phone: z.string().min(7, "Valid phone number required"),
  email: z.string().email("Valid email required"),
  ownerName: z.string().min(2, "Owner name is required"),
  ownerPhone: z.string().min(7, "Valid phone required"),
  description: z.string().min(20, "Description must be at least 20 characters"),
});

export const bookingFormSchema = z.object({
  date: z.string().min(1, "Please select a date"),
  participants: z.coerce.number().int().min(1, "At least 1 guest"),
  travelerName: z.string().min(2, "Name is required"),
  travelerEmail: z.string().email("Valid email required"),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().min(3, "Title must be at least 3 characters"),
  comment: z.string().min(10, "Review must be at least 10 characters"),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type SignUpFormData = z.infer<typeof signUpSchema>;
export type AgencySignUpFormData = z.infer<typeof agencySignUpSchema>;
export type ListingFormData = z.infer<typeof listingFormSchema>;
export type OnboardingFormData = z.infer<typeof onboardingSchema>;
export type BookingFormData = z.infer<typeof bookingFormSchema>;
export type ReviewFormData = z.infer<typeof reviewSchema>;
