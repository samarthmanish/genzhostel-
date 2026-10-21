import { z } from "zod";
import { paginationSchema } from "../middleware/validate.js";

export const ROOM_TYPES = ["SINGLE", "DOUBLE", "TRIPLE", "QUAD", "DORMITORY"];
export const AMENITIES = ["Wi-Fi", "Attached Bathroom", "Study Desk", "Wardrobe", "AC", "Geyser", "Balcony", "Laundry"];

export const roomListQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(80).optional(),
  blockId: z.string().uuid().optional(),
  roomType: z.enum(ROOM_TYPES).optional(),
  status: z.enum(["AVAILABLE", "FULL", "MAINTENANCE", "INACTIVE"]).optional(),
  availability: z.enum(["available", "full"]).optional(),
  amenity: z.string().trim().max(40).optional(),
});

export const createRoomSchema = z.object({
  blockId: z.string().uuid("Select a valid hostel block."),
  roomNumber: z.string().trim().min(1, "Room number is required.").max(20),
  floor: z.coerce.number().int("Floor must be a whole number.").min(0).max(50),
  roomType: z.enum(ROOM_TYPES, { errorMap: () => ({ message: "Select a valid room type." }) }),
  capacity: z.coerce
    .number({ invalid_type_error: "Capacity must be a number." })
    .int("Capacity must be a whole number.")
    .positive("Capacity must be at least 1.")
    .max(50, "Capacity of more than 50 is not realistic for a hostel room."),
  status: z.enum(["AVAILABLE", "MAINTENANCE", "INACTIVE"]).default("AVAILABLE"),
  amenities: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
});

export const updateRoomSchema = createRoomSchema.partial().refine((d) => Object.keys(d).length > 0, {
  message: "Provide at least one field to update.",
});

export const roomStatusSchema = z.object({
  status: z.enum(["AVAILABLE", "MAINTENANCE", "INACTIVE"], {
    errorMap: () => ({ message: "Status must be AVAILABLE, MAINTENANCE, or INACTIVE." }),
  }),
});

export const createBlockSchema = z.object({
  name: z.string().trim().min(2, "Block name is required.").max(60),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

export const updateBlockSchema = createBlockSchema.partial().refine((d) => Object.keys(d).length > 0, {
  message: "Provide at least one field to update.",
});
