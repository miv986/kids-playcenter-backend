// src/dtos/CreateBirthdayBookingDTO.ts
import { IsInt, IsNotEmpty, IsOptional, IsString, Min, IsEnum, IsEmail } from "class-validator";
import { Package } from "@prisma/client";

export class CreateBirthdayBookingDTO {
  @IsInt({ message: "slotId debe ser un número entero" })
  @IsNotEmpty({ message: "slotId es obligatorio" })
  slotId!: number;

  @IsString({ message: "guest debe ser un string" })
  @IsNotEmpty({ message: "guest es obligatorio" })
  guest!: string;

  @IsEmail({}, { message: "guestEmail debe ser un email válido" })
  @IsString({ message: "guestEmail debe ser un string" })
  guestEmail?: string;

  @IsInt({ message: "number_of_kids debe ser un número entero" })
  @Min(1, { message: "Debe haber al menos 1 niño" })
  number_of_kids!: number;

  @IsString({ message: "contact_number debe ser un string" })
  @IsNotEmpty({ message: "contact_number es obligatorio" })
  contact_number!: string;

  @IsOptional()
  @IsString({ message: "comments debe ser un string" })
  comments?: string;

  @IsOptional()
  @IsEnum(Package, { message: "packageType debe ser ALEGRIA, FIESTA o ESPECIAL" })
  packageType?: Package;
}
