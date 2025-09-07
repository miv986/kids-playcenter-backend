// src/dto/auth.dto.ts
import { IsEmail, IsNotEmpty, IsOptional, Length } from "class-validator";

export class RegisterDTO {
  @IsEmail({}, { message: "Email inválido" })
  email!: string;

  @IsNotEmpty({ message: "Password es obligatorio" })
  @Length(6, 100, { message: "Password debe tener al menos 6 caracteres" })
  password!: string;

  @IsNotEmpty({ message: "Nombre es obligatorio" })
  name!: string;

  @IsNotEmpty({ message: "Apellido es obligatorio" })
  surname!: string;

  @IsOptional()
  phone_number?: string;
}
