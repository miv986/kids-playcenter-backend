// src/dtos/CreateBookingDTO.ts
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

export class CreateBookingDTO {
  @IsInt({ message: "number_of_kids debe ser un número entero" })
  @Min(1, { message: "Debe haber al menos 1 niño" })
  number_of_kids!: number;

  @IsString({ message: "phone debe ser un string" })
  @IsNotEmpty({ message: "phone es obligatorio" })
  phone!: string;

  @IsString({ message: "pack debe ser un string" })
  @IsNotEmpty({ message: "pack es obligatorio" })
  pack!: string;

  @IsOptional()
  @IsString({ message: "comments debe ser un string" })
  comments?: string;
}
