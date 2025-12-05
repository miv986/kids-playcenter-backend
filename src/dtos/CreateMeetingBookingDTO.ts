// src/dtos/CreateMeetingBookingDTO.ts
import { IsInt, IsNotEmpty, IsOptional, IsString, IsEmail } from "class-validator";

export class CreateMeetingBookingDTO {
  @IsInt({ message: "slotId debe ser un número entero" })
  @IsNotEmpty({ message: "slotId es obligatorio" })
  slotId!: number;

  @IsString({ message: "nombre debe ser un string" })
  @IsNotEmpty({ message: "nombre es obligatorio" })
  name!: string;

  @IsEmail({}, { message: "email debe ser un email válido" })
  @IsString({ message: "email debe ser un string" })
  @IsNotEmpty({ message: "email es obligatorio" })
  email!: string;

  @IsOptional()
  @IsString({ message: "phone debe ser un string" })
  phone?: string;

  @IsOptional()
  @IsString({ message: "comments debe ser un string" })
  comments?: string;
}

